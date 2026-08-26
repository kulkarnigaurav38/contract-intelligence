"""Offline unit tests of the deterministic ingest core, run against the generated fixtures."""

import json
from pathlib import Path

import pytest

from app.ingest import classify, entities, loader, ocr, screen, segment
from app.ingest.pipeline import detect_language, guess_contract_type

DATA = Path(__file__).resolve().parents[2] / "data"
GT = {c["id"]: c for c in json.loads((DATA / "ground_truth.json").read_text())["contracts"]}


def fixture(cid: str) -> Path:
    return DATA / "contracts" / GT[cid]["file"]


def digital_pages(cid: str) -> list[tuple[int, str]]:
    _, pages = loader.load(fixture(cid))
    return [(p.page_no, p.text) for p in pages]


# ---------------------------------------------------------------- loader routing
@pytest.mark.parametrize("cid,expected,ocr_pages", [
    ("C01", "digital_pdf", []),
    ("C07", "scanned_pdf", [1, 2]),
    ("C10", "mixed_pdf", [3]),
    ("C08", "image", [1]),
])
def test_loader_routes_per_page(cid, expected, ocr_pages):
    kind, pages = loader.load(fixture(cid))
    assert kind == expected
    assert [p.page_no for p in pages if p.text is None] == ocr_pages


# ---------------------------------------------------------------- segmentation + rule classification
def test_segmentation_finds_every_numbered_clause():
    segs = segment.segment(digital_pages("C01"))
    headings = [s.heading for s in segs if s.heading]
    assert segs[0].heading == "" and "Nordlicht" in segs[0].text  # preamble
    assert len(headings) == len(GT["C01"]["clauses_present"]) + 2  # + scope + notices
    assert headings[0] == "Scope of Services"


DIGITAL = [cid for cid, c in GT.items() if c["input_type"] == "digital_pdf"]


@pytest.mark.parametrize("cid", DIGITAL)
def test_rules_recover_ground_truth_coverage_on_digital_pdfs(cid):
    segs = segment.segment(digital_pages(cid))
    labels = {classify.rule_label(s)[0] for s in segs}
    found = labels & set(classify.TAXONOMY)
    assert found == set(GT[cid]["clauses_present"]), cid


# ---------------------------------------------------------------- entities
def test_old_entity_and_alias_detected():
    kinds = {(m.normalized, m.kind) for m in entities.find_mentions(digital_pages("C01"))}
    assert ("arvato financial solutions", "our_entity_old") in kinds
    assert ("afs", "our_entity_old") in kinds
    assert ("nordlicht möbelhaus gmbh", "counterparty") in kinds


def test_formerly_reference_is_historical():
    old = [m for m in entities.find_mentions(digital_pages("C06")) if m.kind == "our_entity_old"]
    assert old and all(m.historical for m in old)


def test_arvato_systems_is_third_party_not_old_entity():
    mentions = entities.find_mentions(digital_pages("C04"))
    assert not [m for m in mentions if m.kind == "our_entity_old"]
    assert [m for m in mentions if m.kind == "third_party"]
    assert [m for m in mentions if m.kind == "our_entity_current"]


# ---------------------------------------------------------------- OCR confidence gate
def test_clean_scan_stays_on_tesseract():
    _, pages = loader.load(fixture("C07"))
    text, conf = ocr.tesseract(pages[0].image)
    assert conf >= ocr.ESCALATE_BELOW
    assert "Merchant" in text and "Helios" in text


def test_handwriting_triggers_escalation():
    _, pages = loader.load(fixture("C08"))
    _, conf = ocr.tesseract(pages[0].image)
    assert conf < ocr.ESCALATE_BELOW


# ---------------------------------------------------------------- misc
def test_injection_pattern_flags_hidden_text():
    text = "\n".join(t for _, t in digital_pages("C13"))
    suspicious, note = screen.screen(text)
    assert suspicious and "AI REVIEWERS" in note


def test_language_and_type_guess():
    de = "\n".join(t for _, t in digital_pages("C05"))
    assert detect_language(de) == "de"
    assert guess_contract_type("Forderungskaufvertrag", de) == "receivables_purchase"
    assert guess_contract_type("Merchant Agreement", "") == "merchant_agreement"


def test_fuzzy_matching_survives_ocr_noise():
    noisy = [(3, "- For Arvate Payment Solutions: GmbH: Managing Director For Lumen Retail Group Ltd")]
    assert not [m for m in entities.find_mentions(noisy) if m.kind == "our_entity_old"]  # exact: nothing
    fuzzy = [m for m in entities.find_mentions(noisy, frozenset({3})) if m.kind == "our_entity_old"]
    assert fuzzy and fuzzy[0].method == "rules-fuzzy" and fuzzy[0].confidence >= 0.8
    clean = [(1, "IT Vendor Agreement between Riverty GmbH and Arvato Systems GmbH")]
    assert not [m for m in entities.find_mentions(clean, frozenset({1})) if m.kind == "our_entity_old"]
