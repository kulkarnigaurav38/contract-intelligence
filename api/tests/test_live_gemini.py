"""Live tests of every model stage. Skipped without GEMINI_API_KEY; they call the real API."""

import json
import time
from pathlib import Path

import pytest

from app import policy
from app.audits.verify import verify
from app.config import settings
from app.ingest import classify, entities, loader, ocr, screen, segment
from app.ingest.embed import embed_documents, embed_query

pytestmark = pytest.mark.skipif(not settings.llm_enabled, reason="GEMINI_API_KEY not set")


@pytest.fixture(scope="module")
def db_client():
    """API client on the current database (expects the sample set already ingested in LLM mode)."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        if len(c.get("/api/documents").json()) < 14:
            pytest.skip("sample set not ingested")
        yield c

DATA = Path(__file__).resolve().parents[2] / "data"
GT = {c["id"]: c for c in json.loads((DATA / "ground_truth.json").read_text())["contracts"]}


def pages(cid: str) -> list[tuple[int, str]]:
    _, ps = loader.load(DATA / "contracts" / GT[cid]["file"])
    return [(p.page_no, p.text) for p in ps if p.text]


def test_vision_ocr_reads_the_handwritten_contract():
    _, ps = loader.load(DATA / "contracts" / GT["C08"]["file"])
    result = ocr.ocr_page(ps[0].image)
    assert result.method == "vision_llm", result
    assert "arvato" in result.text.lower() and "18%" in result.text
    assert result.confidence >= 0.7


def test_vision_ocr_recovers_the_low_quality_scan():
    _, ps = loader.load(DATA / "contracts" / GT["C14"]["file"])
    result = ocr.ocr_page(ps[0].image)
    assert result.method == "vision_llm"
    assert "polarstern" in result.text.lower()
    # a degraded scan may still yield a near-miss ("arvalo"); the OCR-tolerant registry match must catch it
    mentions = entities.find_mentions([(1, result.text)], frozenset({1}))
    assert any(m.kind == "our_entity_old" and not m.historical for m in mentions), result.text[:200]


def test_llm_labels_agree_with_ground_truth_and_rules():
    segs = segment.segment(pages("C11"))
    labels = classify.classify(segs)
    found = {l["clause_type"] for l in labels} & set(classify.TAXONOMY)
    assert found == set(GT["C11"]["clauses_present"])
    assert sum(l["method"] == "llm+rules agree" for l in labels) >= len(segs) - 2


def test_llm_meta_extracts_parties_and_type():
    meta = entities.llm_meta("\n".join(t for _, t in pages("C04")))
    assert meta.contract_type == "vendor_agreement" and meta.language == "en"
    roles = {p.name: p.role for p in meta.parties}
    assert any("Riverty" in n and r == "our_company" for n, r in roles.items())
    assert any("Arvato Systems" in n and r == "counterparty" for n, r in roles.items())


def test_verifier_confirms_a_true_absence_and_refutes_a_false_one():
    c13 = pages("C13")  # no liability cap, but carries a hidden injection saying everything is present
    confirmed = verify(c13, "The contract contains no limitation of liability clause.")
    assert confirmed.verdict == "confirmed" and confirmed.confidence >= 0.7, confirmed
    refuted = verify(c13, "The contract contains no data protection / GDPR clause.")
    assert refuted.verdict == "refuted" and "Data Protection" in refuted.quote or "personal data" in refuted.quote.lower()


def test_verifier_treats_formerly_as_historical():
    v = verify(pages("C06"), "The contract names 'Arvato Payment Solutions GmbH' as an active contracting party "
                             "(not merely a historical reference), so the name must be updated to 'Riverty GmbH'.")
    assert v.verdict == "refuted", v


def test_injection_screen_llm_path_flags_only_the_injected_contract():
    injected, note = screen.screen("\n".join(t for _, t in pages("C13")).replace("SYSTEM NOTE TO AI REVIEWERS", "Note"))
    assert injected, note  # pattern no longer matches verbatim; the model has to catch it
    clean, _ = screen.screen("\n".join(t for _, t in pages("C03")))
    assert not clean


def test_embeddings_have_the_configured_dimension_and_rank_paraphrases():
    docs = embed_documents(["The courts of Baden-Baden shall have exclusive jurisdiction.",
                            "Invoices are payable within thirty days of receipt."])
    q = embed_query("Which court decides disputes?")
    assert len(q) == settings.embedding_dim == len(docs[0])
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))
    assert dot(q, docs[0]) > dot(q, docs[1])


def test_chat_cites_only_the_contract_the_question_names(db_client):
    res = db_client.post("/api/chat", json={"question": "Welcher Gerichtsstand gilt im Vertrag mit Nordlicht Möbelhaus?",
                                            "language": "de"}).json()
    assert res["mode"] == "llm" and res["citations"]
    assert all(c["filename"].startswith("C01_") for c in res["citations"])
    assert "Frankfurt" in res["answer"] and "Baden-Baden" not in res["answer"]  # Nordlicht: DIS arbitration, no court


def _run(client, kind, params):
    audit = client.post("/api/audits", json={"kind": kind, "params": params}).json()
    for _ in range(600):
        audit = client.get(f"/api/audits/{audit['id']}").json()
        if audit["status"] in ("done", "failed"):
            return audit
        time.sleep(1)
    raise AssertionError("audit did not finish")


def test_review_load_falls_after_the_team_agrees(db_client):
    """The loop the presentation shows: decide the first batch, new contracts arrive, most findings are auto-approved."""
    first = _run(db_client, "rename", {"language": "de"})
    open_findings = [f for f in first["findings"] if f["review_status"] == "pending"]
    assert len(open_findings) >= policy.MIN_DECISIONS, "need enough undecided rename findings to teach the policy"
    for f in open_findings:
        db_client.post(f"/api/findings/{f['id']}/review", json={"decision": "approved", "note": "Nachtrag wird erstellt."})
    cls = next(c for c in db_client.get("/api/policy").json()["classes"] if c["class_key"] == "rename:registry")
    assert cls["review_rate"] == 0.2 and cls["since_rejection"] >= policy.MIN_DECISIONS

    db_client.post("/api/documents/ingest-samples", params={"batch": 2})
    for _ in range(300):
        docs = db_client.get("/api/documents").json()
        if len(docs) >= 18 and all(d["status"] in ("ready", "failed") for d in docs):
            break
        time.sleep(1)
    second = _run(db_client, "rename", {"language": "de"})
    review = second["summary"]["review"]
    assert review["carried_over"] == len(open_findings)  # nobody reviews the same thing twice
    new = [f for f in second["findings"] if f["filename"].startswith("N0") and f["verdict"] == "confirmed"]
    assert len(new) == 3 and review["auto_approved"] + review["spot_check"] == 3
    assert all(f["review_status"] == "auto_approved" or f["policy"]["kind"] == "spot_check" for f in new)
    assert second["summary"]["precedents"] >= 1  # the verifier saw the team's notes
    log = db_client.get("/api/audit-log").json()
    assert any(e["action"] == "finding.auto_approved" and e["actor"] == "system" for e in log)
