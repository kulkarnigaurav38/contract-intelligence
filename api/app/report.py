"""The per-contract result: which clauses are missing, where an old company name still appears - and where exactly.

Built automatically right after a contract has been read, so the legal team never has to start anything.
Rules first (clause coverage from ingest, name registry), then the full-contract AI cross-check on every missing
clause the corporate guideline requires and on every old-name mention. Every finding becomes an item with a place
on a page (a box to highlight, or the line where a clause would go), a suggestion (the new name, a drafted clause)
and the team's decision state. Without a model key the rule result stands, marked as not cross-checked.
"""

import json
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import learning
from app.audits.graph import LABELS
from app.audits.verify import verify
from app.config import settings
from app.draft import draft_clause
from app.files import open_pdf, page_info, source_path
from app.ingest.classify import TAXONOMY
from app.locate import find_text, insert_line, words_of
from app.models import Document

CERTAIN = 0.9
NEW_NAME = "Riverty GmbH"
TITLES = {
    "replace": {"de": "Ersetzen durch", "en": "Replace with"},
    "draft": {"de": "Vorschlag für die fehlende Klausel", "en": "Suggested clause"},
    "amend": {"de": "Vorschlag zur Ergänzung", "en": "Suggested amendment"},
}


def required_for(contract_type: str) -> set[str]:
    g = json.loads((settings.data_dir / "guidelines.json").read_text())
    return set(g.get("*", [])) | set(g.get(contract_type, []))


def build(session: Session, doc: Document, language: str = "de") -> dict:
    """Compute and store doc.report. Returns it."""
    doc.report = {"status": "running"}
    session.commit()
    try:
        report = _build(session, doc, language)
    except Exception as exc:  # the contract stays usable; the report says why it failed
        session.rollback()
        doc = session.get(Document, doc.id)
        report = {"status": "failed", "error": f"{type(exc).__name__}: {exc}"}
    doc.report = report
    session.commit()
    return report


def upgrade(session: Session, doc: Document) -> dict:
    """Add places, suggestions and decision state to a result computed before those existed (no re-verification)."""
    report = dict(doc.report)
    try:
        finalize(session, doc, report)
    except Exception as exc:  # keep the result; the viewer just has nothing placed yet
        session.rollback()
        doc = session.get(Document, doc.id)
        report = dict(doc.report)
        report["items"], report["upgrade_error"] = report.get("items", []), f"{type(exc).__name__}: {exc}"
        summarize(report, doc)
    doc.report = report
    session.commit()
    return report


def _build(session: Session, doc: Document, language: str) -> dict:
    pages = [(p.page_no, p.text) for p in sorted(doc.page_rows, key=lambda p: p.page_no)]
    required = required_for(doc.contract_type)
    best: dict[str, object] = {}
    for c in doc.clauses:
        if c.clause_type in TAXONOMY and (c.clause_type not in best or c.confidence > best[c.clause_type].confidence):
            best[c.clause_type] = c
    clauses = []
    misses = 0  # verifications that could not run (provider outage / quota) - the result is then 'not cross-checked'
    for ct in TAXONOMY:
        c = best.get(ct)
        entry = {"clause_type": ct, "required": ct in required, "verified": False}
        history = learning.precedents(session, learning.class_key("missing_clause", doc.contract_type, ct)) if ct in required else None
        if c is not None and c.confidence >= CERTAIN:
            entry.update(status="present", page=c.page_no, quote=c.text[:240])
        elif c is not None:  # labelled, but not confidently: let the cross-check decide when it matters
            entry.update(status="present", page=c.page_no, quote=c.text[:240])
            if ct in required:
                v = verify(pages, f"The contract contains a {LABELS[ct]} clause (heading: '{c.heading}').", language, history)
                misses += v is None
                if v is not None:
                    entry["verified"] = True
                    if v.verdict == "refuted":
                        entry.update(status="missing", page=None, quote="", reason=v.reasoning)
                    elif v.verdict == "partial":
                        entry.update(status="partial", reason=v.reasoning, page=v.page or c.page_no, quote=(v.quote or c.text)[:240])
        else:
            entry.update(status="missing", page=None, quote="")
            if ct in required:
                v = verify(pages, f"The contract contains no {LABELS[ct]} clause.", language, history)
                misses += v is None
                if v is not None:
                    entry["verified"] = True
                    if v.verdict == "refuted":
                        entry.update(status="present", page=v.page or None, quote=v.quote[:240], reason=v.reasoning)
                    elif v.verdict == "partial":
                        entry.update(status="partial", page=v.page or None, quote=v.quote[:240], reason=v.reasoning)
                    else:
                        entry["reason"] = v.reasoning
        clauses.append(entry)

    mentions = [e for e in doc.entities if e.kind == "our_entity_old" and not e.historical]
    seen, old_names = set(), []
    for e in sorted(mentions, key=lambda e: (e.page_no, e.name)):
        key = (e.page_no, e.name.lower())
        if key in seen:
            continue
        seen.add(key)
        old_names.append({"name": e.name, "page": e.page_no, "quote": e.context[:240], "fuzzy": e.confidence < 1})
    names_verified, names_reason = False, ""
    if old_names:
        names = sorted({m["name"] for m in old_names})
        v = verify(pages, f"The contract names {', '.join(repr(n) for n in names)} as an active contracting party "
                          f"(not merely a historical reference), so the name must be updated to '{NEW_NAME}'.", language,
                   learning.precedents(session, learning.class_key("old_name", doc.contract_type)))
        misses += v is None
        if v is not None:
            names_verified, names_reason = True, v.reasoning
            if v.verdict == "refuted":
                old_names = []
    historical = sorted({e.name for e in doc.entities if e.kind == "our_entity_old" and e.historical})

    report = {
        "status": "ready",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "cross_checked": settings.llm_enabled and misses == 0,
        "degraded": settings.llm_enabled and misses > 0,  # re-check when the model is reachable again
        "clauses": clauses,
        "old_names": old_names,
        "old_names_verified": names_verified,
        "old_names_reason": names_reason,
        "historical_names": historical,
    }
    finalize(session, doc, report)
    return report


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def finalize(session: Session, doc: Document, report: dict) -> None:
    """Turn clauses + old names into placed items with suggestions and decision state; fill pages and summary."""
    language = report.get("language", doc.language)
    page_text = [(p.page_no, p.text) for p in sorted(doc.page_rows, key=lambda p: p.page_no)]
    path = source_path(doc)
    pdf = open_pdf(path) if path else None
    words_cache: dict[int, list] = {}

    def words(n: int):
        if n not in words_cache:
            words_cache[n] = words_of(pdf[n - 1])
        return words_cache[n]

    def box(n: int, text: str, vision: bool = True):
        if pdf is None or not 1 <= n <= len(pdf):
            return None
        return find_text(pdf[n - 1], text, words(n), allow_vision=vision)

    report["pages"] = page_info(pdf) if pdf else []
    report["editable"] = doc.input_type == "digital_pdf"
    text_layer = {p["page"]: p["text_layer"] for p in report["pages"]}

    # where a new clause would go: below the last real clause, or above the signatures
    body = [c for c in sorted(doc.clauses, key=lambda c: c.ordinal) if c.clause_type not in ("signature", "preamble", "other")]
    signature = next((c for c in sorted(doc.clauses, key=lambda c: c.ordinal) if c.clause_type == "signature"), None)
    insert_at = (doc.pages or 1, None)
    if body and pdf is not None:
        last = body[-1]
        for n in (last.page_no, last.page_no + 1):
            if 1 <= n <= len(pdf):
                b = insert_line(pdf[n - 1], last.text, words(n))
                if b:
                    insert_at = (n, b)
                    break
        if insert_at[1] is None and signature is not None and 1 <= signature.page_no <= len(pdf):
            b = find_text(pdf[signature.page_no - 1], signature.text[:60], words(signature.page_no), allow_vision=False)
            if b:
                insert_at = (signature.page_no, [0.08, max(0, b[1] - 0.016), 0.92, max(0.012, b[1] - 0.004)])

    old_items = {it["key"]: it for it in report.get("items", [])}
    items = []
    for c in report["clauses"]:
        if not c["required"] or c["status"] == "present":
            continue
        key = f"clause:{c['clause_type']}"
        partial = c["status"] == "partial"
        if partial and c.get("page"):
            page, bbox, kind = c["page"], box(c["page"], c.get("quote", "")), "highlight"
        else:
            page, bbox, kind = insert_at[0], insert_at[1], "insert"
        old = old_items.get(key)
        suggestion = old["suggestion"] if old and old.get("suggestion") else ""
        if not suggestion and settings.llm_enabled:
            d = draft_clause(page_text, c["clause_type"], doc.contract_type, language, c.get("quote", "") if partial else "")
            if d is not None:
                suggestion = f"{d.heading}\n\n{d.text}".strip()
        items.append({
            "key": key, "kind": "partial_clause" if partial else "missing_clause", "clause_type": c["clause_type"],
            "page": page, "anchor": {"kind": kind, "bbox": bbox}, "quote": c.get("quote", "") if partial else "",
            "reason": c.get("reason", ""), "suggestion_title": TITLES["amend" if partial else "draft"][language if language in ("de", "en") else "en"],
            "suggestion": suggestion, "verified": c["verified"], "editable": bool(report["editable"] and text_layer.get(page)),
            "class_key": learning.class_key("missing_clause", doc.contract_type, c["clause_type"]),
        })
    for m in report.get("old_names", []):
        key = f"name:{m['page']}:{_slug(m['name'])}"
        bbox = box(m["page"], m["name"]) or (box(m["page"], m["quote"][:80]) if m.get("quote") else None)
        items.append({
            "key": key, "kind": "old_name", "name": m["name"], "page": m["page"],
            "anchor": {"kind": "highlight", "bbox": bbox}, "quote": m.get("quote", ""), "reason": report.get("old_names_reason", ""),
            "suggestion_title": TITLES["replace"][language if language in ("de", "en") else "en"],
            "suggestion": NEW_NAME if " " in m["name"] else NEW_NAME.split()[0],  # 'AFS' -> 'Riverty', full names -> 'Riverty GmbH'
            "verified": bool(report.get("old_names_verified")), "editable": bool(report["editable"] and text_layer.get(m["page"])),
            "class_key": learning.class_key("old_name", doc.contract_type),
        })
    if pdf is not None:
        pdf.close()

    def inside(a: list[float], b: list[float]) -> bool:  # box a lies within box b (with a little slack)
        return a[0] >= b[0] - 0.01 and a[1] >= b[1] - 0.01 and a[2] <= b[2] + 0.01 and a[3] <= b[3] + 0.01

    names = [it for it in items if it["kind"] == "old_name" and it["anchor"]["bbox"]]
    nested = {it["key"] for it in names for other in names
              if other is not it and other["page"] == it["page"] and len(other["name"]) > len(it["name"])
              and inside(it["anchor"]["bbox"], other["anchor"]["bbox"])}  # 'AFS' found inside 'arvato Financial Solutions (AFS)'
    items = [it for it in items if it["key"] not in nested]
    learning.apply(session, doc, items)
    for it in items:  # a decision taken on this very report (re-check) must survive
        old = old_items.get(it["key"])
        if old and old.get("review", {}).get("status") in ("accepted", "dismissed") and not it["review"]["carried_over"]:
            it["review"] = old["review"]
            it["policy"] = old.get("policy", it["policy"])
    report["items"] = items
    report.setdefault("storage", None)
    summarize(report, doc)


def summarize(report: dict, doc: Document) -> None:
    items = report.get("items", [])
    missing = [c for c in report.get("clauses", []) if c["required"] and c["status"] != "present"]
    names = [it for it in items if it["kind"] == "old_name"]
    st = [it["review"]["status"] for it in items]
    report["summary"] = {
        "missing": len(missing), "partial": sum(1 for c in missing if c["status"] == "partial"),
        "old_names": len(names), "old_name_pages": sorted({it["page"] for it in names}),
        "unreadable": any(s["method"] == "tesseract" and s["confidence"] < 0.5 for s in doc.ingest_summary),
        "open": st.count("open"), "accepted": st.count("accepted"), "dismissed": st.count("dismissed"), "auto": st.count("auto"),
    }


def decide(session: Session, doc: Document, key: str, decision: str, note: str, edited_text: str, actor: str) -> dict:
    report = dict(doc.report)
    items = [dict(it) for it in report.get("items", [])]
    item = next((it for it in items if it["key"] == key), None)
    if item is None:
        raise KeyError(key)
    now = datetime.now(timezone.utc).isoformat()
    if decision == "reopen":
        item["review"] = {"status": "open", "note": "", "edited_text": "", "carried_over": False, "decided_at": None, "actor": ""}
        learning.record(session, doc, item, "reopened", "", "", actor)
    else:
        item["review"] = {"status": decision, "note": note, "edited_text": edited_text, "carried_over": False, "decided_at": now, "actor": actor}
        learning.record(session, doc, item, decision, note, edited_text, actor)
    report["items"] = items
    summarize(report, doc)
    doc.report = report
    session.commit()
    return report
