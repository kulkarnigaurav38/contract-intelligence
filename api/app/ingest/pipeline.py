"""Ingest one file end to end and persist everything the audits need."""

import hashlib
import re
from pathlib import Path

from app import graph
from app.config import settings
from app.db import Store
from app.ingest import classify, embed, entities, loader, ocr, screen, segment
from app.models import AuditLog, Clause, Document, Entity, Page

DE_HINTS = re.compile(r"\b(und|nicht|zwischen|gemäß|vertrag|partei|die|der|das|nachfolgend)\b", re.I)
EN_HINTS = re.compile(r"\b(and|not|between|pursuant|agreement|party|the|hereinafter)\b", re.I)
TYPE_HINTS = [
    ("data processing", "dpa"), ("auftragsverarbeitung", "dpa"), ("non-disclosure", "nda"),
    ("geheimhaltung", "nda"), ("vendor", "vendor_agreement"), ("forderungskauf", "receivables_purchase"),
    ("receivables", "receivables_purchase"), ("inkasso", "collection_services"), ("collection", "collection_services"),
    ("software as a service", "saas_agreement"), ("saas", "saas_agreement"), ("amendment", "amendment"),
    ("merchant", "merchant_agreement"), ("händler", "merchant_agreement"),
]


def detect_language(text: str) -> str:
    return "de" if len(DE_HINTS.findall(text)) > len(EN_HINTS.findall(text)) else "en"


def guess_contract_type(title: str, text: str) -> str:
    for hint, kind in TYPE_HINTS:
        if hint in title.lower():
            return kind
    for hint, kind in TYPE_HINTS:
        if hint in text[:3000].lower():
            return kind
    return "other"


def log(session: Store, actor: str, action: str, target_type: str, target_id: int, details: dict) -> None:
    session.add(AuditLog(actor=actor, action=action, target_type=target_type, target_id=target_id, details=details))


def ingest_path(session: Store, path: Path, actor: str = "system") -> Document:
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    existing = session.document_by_sha(sha)
    if existing:
        return existing
    doc = Document(filename=path.name, sha256=sha, status="processing")
    session.add(doc)
    session.commit()
    try:
        _process(session, doc, path)
        doc.status = "ready"
        graph.link_type(doc.id, doc.contract_type)
    except Exception as exc:  # keep the node so the failure is visible in the UI
        session.rollback()
        doc = session.get(Document, doc.id)
        doc.status, doc.error = "failed", f"{type(exc).__name__}: {exc}"
    log(session, actor, "ingest", "document", doc.id,
        {"filename": doc.filename, "sha256": sha, "status": doc.status, "input_type": doc.input_type})
    session.commit()
    session.refresh(doc)  # the pages, clauses and mentions just written, for the check that follows
    return doc


def _process(session: Store, doc: Document, path: Path) -> None:
    """Everything is collected first and written by one commit at the end, so nothing partial survives a failure."""
    input_type, page_inputs = loader.load(path)
    doc.input_type, doc.pages = input_type, len(page_inputs)
    page_texts: list[tuple[int, str]] = []
    summary = []
    for p in page_inputs:
        if p.text is not None:
            text, method, confidence, note = p.text, "text_layer", 1.0, ""
        else:
            r = ocr.ocr_page(p.image)
            text, method, confidence, note = r.text, r.method, r.confidence, r.note
        session.add(Page(document_id=doc.id, page_no=p.page_no, text=text, method=method, confidence=confidence))
        page_texts.append((p.page_no, text))
        summary.append({"page": p.page_no, "method": method, "confidence": confidence, "note": note})
    doc.ingest_summary = summary

    full_text = "\n".join(t for _, t in page_texts)
    doc.language = detect_language(full_text)
    doc.injection_suspected, doc.injection_note = screen.screen(full_text)

    meta = entities.llm_meta(full_text)
    first_line = next((ln.strip() for ln in full_text.splitlines() if ln.strip()), path.stem)
    if summary[0]["confidence"] < ocr.ESCALATE_BELOW:  # a garbled OCR line is no title; fall back to the filename
        first_line = re.sub(r"^[A-Z]\d+_", "", path.stem).replace("_", " ")
    doc.title = (meta.title if meta else first_line)[:255]
    doc.contract_type = meta.contract_type if meta else guess_contract_type(first_line, full_text)
    if meta and meta.language in ("de", "en"):
        doc.language = meta.language

    warnings = [f"page {s['page']}: {s['note']}" for s in summary if "provider error" in s["note"]]
    if settings.llm_enabled and meta is None:
        warnings.append("party/title extraction: model unavailable, heuristics used")

    segments = segment.segment(page_texts)
    labels = classify.classify(segments)
    if settings.llm_enabled and segments and all(l["method"] == "rules" for l in labels):
        warnings.append("clause labels: model unavailable, rules only")
    doc.warnings = warnings
    vectors = embed.embed_documents([f"{s.heading}\n{s.text}" if s.heading else s.text for s in segments])
    for seg, label, vec in zip(segments, labels, vectors):
        session.add(Clause(document_id=doc.id, page_no=seg.page_no, ordinal=seg.ordinal, heading=seg.heading[:255],
                           text=seg.text, embedding=vec, **label))

    seen = set()
    ocr_pages = frozenset(s["page"] for s in summary if s["method"] != "text_layer")
    for m in entities.find_mentions(page_texts, ocr_pages):
        session.add(Entity(document_id=doc.id, page_no=m.page_no, name=m.name, normalized=m.normalized, kind=m.kind,
                           context=m.context, historical=m.historical, method=m.method, confidence=m.confidence))
        seen.add(m.normalized)
    for party in (meta.parties if meta else []):
        norm = entities.normalize(party.name)
        if norm in seen or any(norm in s or s in norm for s in seen):
            continue
        kind = "our_entity_current" if party.role == "our_company" else "counterparty"
        session.add(Entity(document_id=doc.id, page_no=1, name=party.name, normalized=norm, kind=kind,
                           context="extracted by LLM", historical=False, method="llm"))
    session.commit()
