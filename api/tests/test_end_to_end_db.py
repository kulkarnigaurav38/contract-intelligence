"""End-to-end against Postgres/pgvector (offline LLM): ingest fixtures, run audits, review, push, eval.

Skipped automatically when the database is unreachable.
"""

import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import routers
from app.config import settings
from app.db import engine
from app.ingest.classify import TAXONOMY

DATA = Path(__file__).resolve().parents[2] / "data"
GT = {c["id"]: c for c in json.loads((DATA / "ground_truth.json").read_text())["contracts"]}
BY_FILE = {c["file"]: c for c in GT.values()}
GT1 = {k: v for k, v in GT.items() if v.get("batch", 1) == 1}


def _db_up() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="database not reachable")


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with engine.begin() as conn:  # clean slate for a deterministic run
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    settings.contract_storage_url = "http://testserver/api/mock-contract-storage"
    settings.gemini_api_key = ""  # this suite pins the deterministic core; the live model path has its own tests
    with TestClient(app) as c:
        real_post = routers.httpx.post  # the mock storage API lives in the same app: route the push through it
        routers.httpx.post = lambda url, **kw: c.post(url, **{k: v for k, v in kw.items() if k != "timeout"})
        yield c
        routers.httpx.post = real_post


def _wait_ready(client, n: int):
    for _ in range(600):
        docs = client.get("/api/documents").json()
        if len(docs) >= n and all(d["status"] in ("ready", "failed") for d in docs):
            return docs
    raise AssertionError("ingest did not finish")


def test_ingest_all_fixtures(client):
    assert client.post("/api/documents/ingest-samples").json()["queued"] == len(GT1)
    docs = _wait_ready(client, len(GT1))
    failed = [d for d in docs if d["status"] != "ready"]
    assert not failed, failed
    by_file = {d["filename"]: d for d in docs}
    assert by_file[GT["C10"]["file"]]["input_type"] == "mixed_pdf"
    assert by_file[GT["C10"]["file"]]["ingest_summary"][2]["method"] == "tesseract"
    assert by_file[GT["C13"]["file"]]["injection_suspected"]
    assert by_file[GT["C05"]["file"]]["language"] == "de"
    # idempotent: re-ingest does not duplicate
    client.post("/api/documents/ingest-samples")
    assert len(_wait_ready(client, len(GT1))) == len(GT1)


def test_coverage_matrix_matches_ground_truth_on_digital(client):
    rows = client.get("/api/coverage").json()["rows"]
    for row in rows:
        gt = BY_FILE[row["filename"]]
        if gt["input_type"] != "digital_pdf":
            continue
        assert set(row["cells"]) == set(gt["clauses_present"]), row["filename"]


def _run(client, kind, params):
    audit = client.post("/api/audits", json={"kind": kind, "params": params}).json()
    for _ in range(600):
        audit = client.get(f"/api/audits/{audit['id']}").json()
        if audit["status"] in ("done", "failed"):
            break
    assert audit["status"] == "done", audit
    return audit


def test_rename_audit_flags_exactly_the_right_contracts(client):
    audit = _run(client, "rename", {})
    flagged = {BY_FILE[f["filename"]]["id"] for f in audit["findings"] if f["verdict"] != "dismissed"}
    expected = {c["id"] for c in GT1.values() if c["needs_rename"]}
    assert flagged == expected
    unreadable = {BY_FILE[f["filename"]]["id"] for f in audit["findings"] if f["verdict"] == "unreadable"}
    assert unreadable == {"C14"}  # low-quality scan: escalated to a human instead of silently passed
    assert audit["summary"]["historical_only"] == 1  # C06 "vormals"
    c10 = next(f for f in audit["findings"] if BY_FILE[f["filename"]]["id"] == "C10")
    assert c10["evidence"][0]["page"] == 3  # only the scanned signature page carries the old name


def test_missing_clause_audit_scoped_by_contract_type(client):
    audit = _run(client, "missing_clause", {"clause_type": "liability_cap", "contract_type": "merchant_agreement"})
    findings = [f for f in audit["findings"] if f["verdict"] != "unreadable"]
    flagged = {BY_FILE[f["filename"]]["id"] for f in findings}
    expected = {c["id"] for c in GT1.values()
                if c["contract_type"] == "merchant_agreement" and "liability_cap" in c["clauses_missing"] and c["id"] != "C14"}
    assert flagged == expected, (flagged, expected)
    assert all(f["verdict"] == "unverified" for f in findings)  # offline: no verifier
    assert all("coverage matrix" in f["method_chain"][0] for f in findings)


def test_missing_passage_audit(client):
    passage = GT and "Each Party shall comply with all applicable anti-corruption and anti-bribery laws"
    audit = _run(client, "missing_passage", {"passage": passage, "contract_type": "merchant_agreement"})
    assert audit["summary"]["scope"] >= 5
    assert audit["findings"]


def test_review_and_push_is_idempotent(client):
    finding = client.get("/api/findings", params={"review_status": "pending"}).json()[0]
    assert client.post(f"/api/findings/{finding['id']}/push-to-storage").status_code == 409  # not approved yet
    reviewed = client.post(f"/api/findings/{finding['id']}/review",
                           json={"decision": "approved", "note": "checked", "actor": "anna.legal"}).json()
    assert reviewed["review_status"] == "approved"
    first = client.post(f"/api/findings/{finding['id']}/push-to-storage").json()["storage_ref"]
    second = client.post(f"/api/findings/{finding['id']}/push-to-storage").json()["storage_ref"]
    assert first == second and first.startswith("CS-")
    assert len(client.get("/api/mock-contract-storage/contracts").json()) == 1
    actions = [e["action"] for e in client.get("/api/audit-log").json()]
    assert "finding.approved" in actions and "finding.pushed_to_storage" in actions and "ingest" in actions


def test_chat_offline_returns_cited_passages(client):
    res = client.post("/api/chat", json={"question": "Which court has jurisdiction in the Nordlicht agreement?"}).json()
    assert res["mode"] == "offline" and res["citations"]
    assert [d["counterparty"] for d in res["scope"]] == ["Nordlicht Möbelhaus GmbH"]  # the question names a contract
    assert all(p["filename"].startswith("C01_") for p in res["passages"])
    assert any(p["clause_type"] == "dispute_resolution" and "Frankfurt" in p["text"] for p in res["passages"])  # DIS arbitration, not a court
    broad = client.post("/api/chat", json={"question": "Which contracts mention arbitration?"}).json()
    assert broad["scope"] == [] and len({p["filename"] for p in broad["passages"]}) > 1


def test_eval_scores_layers(client):
    ev = client.post("/api/eval/run").json()
    assert ev["documents"] == len(GT1) and ev["unreadable"] == ["C14"]
    assert ev["rename_registry"]["metrics"]["recall"] == 1.0
    assert ev["coverage_matrix"]["metrics"]["recall"] >= 0.9
    assert any(a["kind"] == "rename" for a in ev["audits"])
    assert {i["id"] for i in ev["injection"] if i["flagged"]} == {"C13"}


def test_decisions_are_carried_over_and_policy_reports_the_class(client):
    first = _run(client, "rename", {"language": "de"})
    findings = [f for f in first["findings"] if f["verdict"] != "unreadable"]
    assert all(f["policy"]["kind"] == "required" and f["policy"]["review_rate"] == 1.0 for f in findings)
    rejected = next(f for f in findings if BY_FILE[f["filename"]]["id"] == "C02")
    approved = next(f for f in findings if BY_FILE[f["filename"]]["id"] == "C05")
    client.post(f"/api/findings/{rejected['id']}/review", json={"decision": "rejected", "note": "Vertrag läuft 2026 aus, keine Änderung nötig."})
    client.post(f"/api/findings/{approved['id']}/review", json={"decision": "approved", "note": "Nachtrag wird erstellt."})

    second = _run(client, "rename", {"language": "de"})
    by_id = {BY_FILE[f["filename"]]["id"]: f for f in second["findings"]}
    assert by_id["C02"]["verdict"] == "dismissed" and by_id["C02"]["policy"]["kind"] == "carried_over"
    assert by_id["C05"]["review_status"] == "auto_approved" and by_id["C05"]["policy"]["decision"] == "approved"
    assert by_id["C05"]["review_note"] == "Nachtrag wird erstellt."
    assert any("verification skipped" in step for step in by_id["C05"]["method_chain"])  # no second verifier call
    assert second["summary"]["review"]["carried_over"] == 2
    assert by_id["C01"]["policy"] == {"kind": "required", "reason": "not_verified", "review_rate": 1.0}  # offline: never automated
    assert client.post(f"/api/findings/{by_id['C05']['id']}/push-to-storage").json()["storage_ref"].startswith("CS-")

    pol = client.get("/api/policy").json()
    cls = next(c for c in pol["classes"] if c["class_key"] == "rename:registry")
    assert cls["decisions"] == 2 and cls["rejected"] == 1 and cls["review_rate"] == 1.0 and cls["automation_active"]
    assert pol["rules"]["min_decisions"] == 8
    actions = [e["action"] for e in client.get("/api/audit-log").json()]
    assert "finding.auto_approved" in actions


def test_guidelines_overlay_and_guideline_audits(client):
    g = client.get("/api/guidelines").json()
    assert "governing_law" in g["*"] and "anti_corruption" in g["merchant_agreement"]
    rows = client.get("/api/coverage").json()["rows"]
    nda = next(r for r in rows if r["contract_type"] == "nda")
    assert set(nda["required"]) == set(g["*"])  # NDAs only carry the general rules
    merchant = next(r for r in rows if r["contract_type"] == "merchant_agreement")
    assert "liability_cap" in merchant["required"] and "governing_law" in merchant["required"]
    created = client.post("/api/audits/guideline", params={"contract_type": "dpa"}).json()["audits"]
    assert len(created) == len(set(g["*"]) | set(g["dpa"]))
    for aid in created:
        for _ in range(600):
            a = client.get(f"/api/audits/{aid}").json()
            if a["status"] in ("done", "failed"):
                break
        assert a["status"] == "done" and a["params"]["guideline"] is True and a["params"]["contract_type"] == "dpa"


def test_local_source_sync_ingests_only_new_files(client):
    settings.document_source_path = DATA / "contracts_batch2"
    before = len(client.get("/api/documents").json())
    assert client.post("/api/documents/sync").json() == {"source": "local", "queued": True}
    docs = _wait_ready(client, before + 4)
    assert len(docs) == before + 4 and all(d["status"] == "ready" for d in docs)
    client.post("/api/documents/sync")  # nothing new -> nothing added
    assert len(_wait_ready(client, before + 4)) == before + 4
    assert any(e["action"] == "ingest" and "N01" in e["details"]["filename"] for e in client.get("/api/audit-log").json())


def test_upload_many_checks_each_contract_and_delete_removes_it(client):
    paths = {cid: DATA / "contracts" / GT[cid]["file"] for cid in ("C01", "C03")}
    shas = {hashlib.sha256(p.read_bytes()).hexdigest(): cid for cid, p in paths.items()}
    for d in client.get("/api/documents").json():  # the fixtures are already known (sha256): drop them so the upload is a real ingest
        if d["sha256"] in shas:
            assert client.delete(f"/api/documents/{d['id']}").json() == {"deleted": d["id"]}
    res = client.post("/api/documents/upload", params={"language": "de"},
                      files=[("files", (p.name, p.read_bytes(), "application/pdf")) for p in paths.values()]).json()
    assert res["queued"] == 2 and [n.split("_", 1)[1] for n in res["filenames"]] == [p.name for p in paths.values()]
    docs = {shas[d["sha256"]]: d for d in _wait_ready(client, 1) if d["sha256"] in shas}
    assert len(docs) == 2 and all(d["status"] == "ready" and d["report_status"] == "ready" for d in docs.values())
    for d in docs.values():
        rep = client.get(f"/api/documents/{d['id']}").json()["report"]
        assert rep["status"] == "ready" and rep["language"] == "de" and rep["cross_checked"] is False
        assert [c["clause_type"] for c in rep["clauses"]] == TAXONOMY
        assert {'missing', 'partial', 'old_names', 'old_name_pages', 'unreadable', 'open', 'accepted', 'dismissed', 'auto'} <= set(rep["summary"])
    c01, c03 = docs["C01"]["report_summary"], docs["C03"]["report_summary"]
    assert c01["missing"] == 1 and c01["old_names"] >= 1  # anti-corruption clause missing, old brand name still used
    assert (c03["missing"], c03["old_names"], c03["open"], c03["unreadable"]) == (0, 0, 0, False)  # "Alles in Ordnung"
    for d in docs.values():
        assert client.delete(f"/api/documents/{d['id']}").json() == {"deleted": d["id"]}
        assert client.get(f"/api/documents/{d['id']}").status_code == 404
