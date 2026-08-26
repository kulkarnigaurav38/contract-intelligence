"""End-to-end against Postgres/pgvector (offline LLM): ingest fixtures, run audits, review, push, eval.

Skipped automatically when the database is unreachable.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import routers
from app.config import settings
from app.db import engine

DATA = Path(__file__).resolve().parents[2] / "data"
GT = {c["id"]: c for c in json.loads((DATA / "ground_truth.json").read_text())["contracts"]}
BY_FILE = {c["file"]: c for c in GT.values()}


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
    assert client.post("/api/documents/ingest-samples").json()["queued"] == len(GT)
    docs = _wait_ready(client, len(GT))
    failed = [d for d in docs if d["status"] != "ready"]
    assert not failed, failed
    by_file = {d["filename"]: d for d in docs}
    assert by_file[GT["C10"]["file"]]["input_type"] == "mixed_pdf"
    assert by_file[GT["C10"]["file"]]["ingest_summary"][2]["method"] == "tesseract"
    assert by_file[GT["C13"]["file"]]["injection_suspected"]
    assert by_file[GT["C05"]["file"]]["language"] == "de"
    # idempotent: re-ingest does not duplicate
    client.post("/api/documents/ingest-samples")
    assert len(_wait_ready(client, len(GT))) == len(GT)


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
    expected = {c["id"] for c in GT.values() if c["needs_rename"]}
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
    expected = {c["id"] for c in GT.values()
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
    assert any("Baden-Baden" in p["text"] for p in res["passages"])


def test_eval_scores_layers(client):
    ev = client.post("/api/eval/run").json()
    assert ev["documents"] == len(GT) and ev["unreadable"] == ["C14"]
    assert ev["rename_registry"]["metrics"]["recall"] == 1.0
    assert ev["coverage_matrix"]["metrics"]["recall"] >= 0.9
    assert any(a["kind"] == "rename" for a in ev["audits"])
    assert {i["id"] for i in ev["injection"] if i["flagged"]} == {"C13"}
