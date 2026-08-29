"""The per-contract result is a pure function of what ingest stored plus the verifier's answers (faked here: no DB, no file)."""

import json
from types import SimpleNamespace as NS

import pytest

from app import learning, report
from app.audits.verify import Verdict
from app.config import settings
from app.ingest.classify import TAXONOMY

OPEN = {"status": "open", "note": "", "edited_text": "", "carried_over": False, "decided_at": None, "actor": ""}


def doc(contract_type="nda", clauses=(), entities=(), ingest_summary=None):
    return NS(id=1, sha256="sha-1", contract_type=contract_type, language="de", input_type="digital_pdf", pages=2, report={},
              clauses=list(clauses), entities=list(entities),
              page_rows=[NS(page_no=2, text="second page"), NS(page_no=1, text="first page")],
              ingest_summary=ingest_summary or [{"method": "text_layer", "confidence": 1.0}])


def clause(clause_type, confidence, page_no=1, text="clause text", heading="Heading"):
    return NS(clause_type=clause_type, confidence=confidence, page_no=page_no, text=text, heading=heading, ordinal=1)


def mention(name, page_no, historical=False, confidence=1.0, kind="our_entity_old"):
    return NS(kind=kind, name=name, page_no=page_no, historical=historical, confidence=confidence, context=f"... {name} ...")


def verdict(kind, page=0, quote="", reasoning="Begründung."):
    return Verdict(verdict=kind, confidence=0.9, page=page, quote=quote, reasoning=reasoning)


def by_type(rep):
    return {c["clause_type"]: c for c in rep["clauses"]}


def by_key(rep):
    return {it["key"]: it for it in rep["items"]}


@pytest.fixture
def offline(monkeypatch):
    """No decisions on record, no source file to place findings on, no drafting model."""
    monkeypatch.setattr(learning, "precedents", lambda session, key, limit=3: [])
    monkeypatch.setattr(learning, "previous", lambda session, sha256, key: None)
    monkeypatch.setattr(learning, "rate", lambda session, key: 1.0)
    monkeypatch.setattr(report, "source_path", lambda doc: None)
    monkeypatch.setattr(report, "draft_clause", lambda *a, **k: None)


@pytest.fixture
def no_model(offline, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "none")
    monkeypatch.setattr(report, "verify", lambda *a, **k: None)


@pytest.fixture
def verifier(offline, monkeypatch):
    """Fake cross-check: answers by substring of the claim and records every claim; unanswered claims -> None."""
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    answers, calls = {}, []

    def _verify(pages, claim, language="en", precedents=None):
        calls.append(claim)
        return next((v for key, v in answers.items() if key in claim), None)

    monkeypatch.setattr(report, "verify", _verify)
    return answers, calls


def test_rule_only_result_without_a_model(no_model):
    d = doc("nda", clauses=[clause("governing_law", 0.6, page_no=1), clause("governing_law", 0.95, page_no=2, text="German law applies."),
                            clause("preamble", 1.0)])
    rep = report._build(None, d, "de")
    assert rep["status"] == "ready" and rep["language"] == "de" and not rep["cross_checked"]
    assert [c["clause_type"] for c in rep["clauses"]] == TAXONOMY
    c = by_type(rep)
    assert c["governing_law"] == {"clause_type": "governing_law", "required": True, "verified": False,
                                  "status": "present", "page": 2, "quote": "German law applies."}  # best-labelled passage wins
    assert c["confidentiality"] == {"clause_type": "confidentiality", "required": True, "verified": False,
                                    "status": "missing", "page": None, "quote": ""}
    assert c["fees_payment"]["status"] == "missing" and not c["fees_payment"]["required"]  # not asked of an NDA
    assert rep["old_names"] == [] and not rep["old_names_verified"]
    assert [(it["key"], it["kind"], it["suggestion"], it["verified"], it["policy"]["kind"]) for it in rep["items"]] == [
        ("clause:term_termination", "missing_clause", "", False, "required"), ("clause:confidentiality", "missing_clause", "", False, "required")]
    assert rep["summary"] == {"missing": 2, "partial": 0, "old_names": 0, "old_name_pages": [], "unreadable": False,
                              "open": 2, "accepted": 0, "dismissed": 0, "auto": 0}


def test_low_confidence_scan_is_flagged_unreadable(no_model):
    d = doc(ingest_summary=[{"method": "text_layer", "confidence": 1.0}, {"method": "tesseract", "confidence": 0.3}])
    assert report._build(None, d, "de")["summary"]["unreadable"]


def test_verifier_decides_missing_and_uncertain_clauses(verifier):
    answers, calls = verifier
    answers["no confidentiality clause"] = verdict("refuted", page=2, quote="Each party shall keep the terms secret.", reasoning="Geheimhaltung in § 7.")
    answers["no governing law clause"] = verdict("confirmed", reasoning="Keine Rechtswahl.")
    answers["contains a term and termination clause"] = verdict("refuted", reasoning="Nur eine Laufzeitangabe.")
    d = doc("nda", clauses=[clause("term_termination", 0.5, heading="Duration"), clause("fees_payment", 0.5)])
    rep = report._build(None, d, "de")
    c = by_type(rep)
    assert rep["cross_checked"]
    assert c["confidentiality"] == {"clause_type": "confidentiality", "required": True, "verified": True, "status": "present",
                                    "page": 2, "quote": "Each party shall keep the terms secret.", "reason": "Geheimhaltung in § 7."}
    assert c["governing_law"]["status"] == "missing" and c["governing_law"]["verified"] and c["governing_law"]["reason"] == "Keine Rechtswahl."
    assert c["term_termination"] == {"clause_type": "term_termination", "required": True, "verified": True, "status": "missing",
                                     "page": None, "quote": "", "reason": "Nur eine Laufzeitangabe."}
    assert c["fees_payment"]["status"] == "present" and not c["fees_payment"]["verified"]  # not required: no cross-check
    assert len(calls) == 3 and "heading: 'Duration'" in calls[0]
    assert rep["summary"]["missing"] == 2 and rep["summary"]["partial"] == 0


def test_verifier_partial_keeps_the_passage_for_a_lawyer(verifier):
    answers, _ = verifier
    answers["no term and termination clause"] = verdict("partial", page=2, quote="The term is one year.", reasoning="Laufzeit ohne Kündigungsregel.")
    answers["contains a confidentiality clause"] = verdict("partial", reasoning="Nur ein Verweis.")  # no page/quote: keep the labelled passage
    d = doc("nda", clauses=[clause("governing_law", 0.95), clause("confidentiality", 0.5, page_no=2, text="See separate NDA.")])
    rep = report._build(None, d, "de")
    c = by_type(rep)
    assert c["term_termination"] == {"clause_type": "term_termination", "required": True, "verified": True, "status": "partial",
                                     "page": 2, "quote": "The term is one year.", "reason": "Laufzeit ohne Kündigungsregel."}
    assert c["confidentiality"] == {"clause_type": "confidentiality", "required": True, "verified": True, "status": "partial",
                                    "page": 2, "quote": "See separate NDA.", "reason": "Nur ein Verweis."}
    assert rep["summary"]["missing"] == 2 and rep["summary"]["partial"] == 2


def test_old_name_mentions_are_listed_once_per_page(no_model):
    d = doc(entities=[mention("arvato Financial Solutions", 3), mention("AFS", 3, confidence=0.85), mention("afs", 3, confidence=0.85),
                      mention("arvato Financial Solutions", 1), mention("arvato Financial Solutions", 2, historical=True),
                      mention("Nordlicht GmbH", 1, kind="counterparty")])
    rep = report._build(None, d, "de")
    assert [(m["name"], m["page"], m["fuzzy"]) for m in rep["old_names"]] == [
        ("arvato Financial Solutions", 1, False), ("AFS", 3, True), ("arvato Financial Solutions", 3, False)]
    assert rep["old_names"][0]["quote"] == "... arvato Financial Solutions ..."
    assert not rep["old_names_verified"] and rep["historical_names"] == ["arvato Financial Solutions"]
    assert rep["summary"]["old_names"] == 3 and rep["summary"]["old_name_pages"] == [1, 3]


def test_verifier_decides_old_name_mentions(verifier):
    answers, calls = verifier
    d = doc(entities=[mention("arvato Financial Solutions", 1), mention("AFS", 2, historical=True)])
    answers["'arvato Financial Solutions'"] = verdict("confirmed", reasoning="Aktive Vertragspartei.")
    rep = report._build(None, d, "de")
    assert [m["page"] for m in rep["old_names"]] == [1] and rep["old_names_verified"] and rep["old_names_reason"] == "Aktive Vertragspartei."
    assert "'Riverty GmbH'" in calls[-1]

    answers["'arvato Financial Solutions'"] = verdict("refuted", reasoning="Nur ein historischer Verweis.")
    rep = report._build(None, d, "de")
    assert rep["old_names"] == [] and rep["old_names_verified"] and rep["old_names_reason"] == "Nur ein historischer Verweis."
    assert rep["historical_names"] == ["AFS"]
    assert rep["summary"]["old_names"] == 0 and rep["summary"]["old_name_pages"] == [] and not [it for it in rep["items"] if it["kind"] == "old_name"]


def test_findings_become_placed_items_with_suggestions_and_decision_state(verifier, monkeypatch):
    answers, _ = verifier
    answers["no term and termination clause"] = verdict("partial", page=2, quote="The term is one year.", reasoning="Ohne Kündigungsregel.")
    answers["no confidentiality clause"] = verdict("confirmed", reasoning="Keine Geheimhaltung.")
    answers["'AFS', 'arvato Financial Solutions'"] = verdict("confirmed", reasoning="Aktive Vertragspartei.")
    drafts = []

    def _draft(pages, clause_type, contract_type, language, partial_quote=""):
        drafts.append((clause_type, contract_type, language, partial_quote))
        return NS(heading=f"§ 9 {clause_type}", text="Entwurf.")

    monkeypatch.setattr(report, "draft_clause", _draft)
    d = doc("nda", clauses=[clause("governing_law", 0.95)], entities=[mention("arvato Financial Solutions", 1), mention("AFS", 2)])
    rep = report._build(None, d, "de")
    assert rep["pages"] == []  # no file found: nothing can be placed, every anchor stays page-level
    items = by_key(rep)
    assert list(items) == ["clause:term_termination", "clause:confidentiality", "name:1:arvato-financial-solutions", "name:2:afs"]
    assert items["clause:term_termination"] == {
        "key": "clause:term_termination", "kind": "partial_clause", "clause_type": "term_termination", "page": 2,
        "anchor": {"kind": "highlight", "bbox": None}, "quote": "The term is one year.", "reason": "Ohne Kündigungsregel.",
        "suggestion_title": "Vorschlag zur Ergänzung", "suggestion": "§ 9 term_termination\n\nEntwurf.", "verified": True, "editable": False,
        "class_key": "missing:nda:term_termination", "review": OPEN, "policy": {"kind": "required", "review_rate": 1.0}}
    missing = items["clause:confidentiality"]
    assert missing["kind"] == "missing_clause" and missing["page"] == 2 and missing["anchor"] == {"kind": "insert", "bbox": None}  # last page
    assert missing["quote"] == "" and missing["suggestion_title"] == "Vorschlag für die fehlende Klausel"
    assert missing["suggestion"] == "§ 9 confidentiality\n\nEntwurf." and missing["class_key"] == "missing:nda:confidentiality"
    assert drafts == [("term_termination", "nda", "de", "The term is one year."), ("confidentiality", "nda", "de", "")]
    full, alias = items["name:1:arvato-financial-solutions"], items["name:2:afs"]
    assert full == {"key": "name:1:arvato-financial-solutions", "kind": "old_name", "name": "arvato Financial Solutions", "page": 1,
                    "anchor": {"kind": "highlight", "bbox": None}, "quote": "... arvato Financial Solutions ...", "reason": "Aktive Vertragspartei.",
                    "suggestion_title": "Ersetzen durch", "suggestion": "Riverty GmbH", "verified": True, "editable": False, "class_key": "rename",
                    "review": OPEN, "policy": {"kind": "required", "review_rate": 1.0}}
    assert (alias["name"], alias["page"], alias["suggestion"]) == ("AFS", 2, "Riverty")  # an alias without a space gets the short name
    assert rep["summary"] == {"missing": 2, "partial": 1, "old_names": 2, "old_name_pages": [1, 2], "unreadable": False,
                              "open": 4, "accepted": 0, "dismissed": 0, "auto": 0}


def test_a_decision_and_a_suggestion_survive_a_re_finalize(no_model):
    d = doc("nda", entities=[mention("AFS", 1)])
    rep = report._build(None, d, "de")
    items = by_key(rep)
    decided = {"status": "dismissed", "note": "Historisch.", "edited_text": "", "carried_over": False, "decided_at": "2026-08-01T10:00:00+00:00", "actor": "anna"}
    items["name:1:afs"]["review"], items["name:1:afs"]["policy"] = decided, {"kind": "spot_check", "review_rate": 0.2}
    items["clause:confidentiality"]["suggestion"] = "§ 9 Geheimhaltung\n\nHandgeschrieben."
    report.finalize(None, d, rep)
    again = by_key(rep)
    assert again["name:1:afs"]["review"] == decided and again["name:1:afs"]["policy"] == {"kind": "spot_check", "review_rate": 0.2}
    assert again["clause:confidentiality"]["suggestion"] == "§ 9 Geheimhaltung\n\nHandgeschrieben." and again["clause:confidentiality"]["review"] == OPEN
    assert rep["summary"]["dismissed"] == 1 and rep["summary"]["open"] == 3


def test_decide_records_the_decision_and_updates_the_summary(no_model):
    d = doc("nda", entities=[mention("AFS", 1)])
    d.report = report._build(None, d, "de")
    added = []
    session = NS(add=added.append, commit=lambda: None, rollback=lambda: None, get=lambda model, doc_id: d)
    rep = report.decide(session, d, "clause:confidentiality", "accepted", "Passt so.", "§ 9 Geheimhaltung\n\nText.", "anna")
    review = by_key(rep)["clause:confidentiality"]["review"]
    assert review["status"] == "accepted" and review["note"] == "Passt so." and review["edited_text"] == "§ 9 Geheimhaltung\n\nText."
    assert review["actor"] == "anna" and review["decided_at"] and not review["carried_over"]
    assert d.report is rep and rep["summary"]["accepted"] == 1 and rep["summary"]["open"] == 3
    assert (added[-1].sha256, added[-1].item_key, added[-1].class_key, added[-1].decision, added[-1].edited_text) == (
        "sha-1", "clause:confidentiality", "missing:nda:confidentiality", "accepted", "§ 9 Geheimhaltung\n\nText.")

    rep = report.decide(session, d, "clause:confidentiality", "reopen", "", "", "anna")
    assert by_key(rep)["clause:confidentiality"]["review"] == OPEN and added[-1].decision == "reopened"
    assert rep["summary"]["accepted"] == 0 and rep["summary"]["open"] == 4
    with pytest.raises(KeyError):
        report.decide(session, d, "clause:nope", "accepted", "", "", "anna")


def test_required_clauses_merge_the_general_rules_with_the_contract_type():
    g = json.loads((settings.data_dir / "guidelines.json").read_text())
    merchant = report.required_for("merchant_agreement")
    assert merchant == set(g["*"]) | set(g["merchant_agreement"])
    assert {"governing_law", "liability_cap"} <= merchant
    assert report.required_for("nda") == report.required_for("unknown") == set(g["*"])


def test_build_stores_the_result_or_the_failure_on_the_document(no_model):
    d = doc()
    session = NS(commit=lambda: None, rollback=lambda: None, get=lambda model, doc_id: d)
    assert report.build(session, d, "de")["status"] == "ready" and d.report["status"] == "ready"

    d.page_rows = None  # anything that breaks the computation
    rep = report.build(session, d, "de")
    assert rep["status"] == "failed" and rep["error"].startswith("TypeError") and d.report is rep
