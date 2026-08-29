"""The per-contract result: which clauses are missing, where an old company name still appears - and where exactly.

Built automatically right after a contract has been read, so the legal team never has to start anything. It is a
LangGraph of six steps whose ids are the ones the 'So funktioniert es' page shows (app/pipeline.py):

    rules -> cross_check -> place -> draft -> policy -> summarize

rules: clause coverage vs the corporate guideline, name registry hits. cross_check: the verifier reads the whole
contract for every candidate (with the team's precedents). place: a box or insertion line on the page. draft: the new
name or a drafted clause. policy: earlier decisions carried over, spot-check rules. Without a model key the rule
result stands, marked as not cross-checked; a re-check ('upgrade') re-runs from 'place' without verifying again.
"""

import json
import re
from datetime import datetime, timezone
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
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
ORDER = ["rules", "cross_check", "place", "draft", "policy", "summarize"]
TITLES = {
    "replace": {"de": "Ersetzen durch", "en": "Replace with"},
    "draft": {"de": "Vorschlag für die fehlende Klausel", "en": "Suggested clause"},
    "amend": {"de": "Vorschlag zur Ergänzung", "en": "Suggested amendment"},
}


class ReportState(TypedDict, total=False):
    language: str
    report: dict


def required_for(contract_type: str) -> set[str]:
    g = json.loads((settings.data_dir / "guidelines.json").read_text())
    return set(g.get("*", [])) | set(g.get(contract_type, []))


# ---------------------------------------------------------------- entry points
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
    return graph(session, doc).invoke({"language": language, "report": {}})["report"]


def finalize(session: Session, doc: Document, report: dict) -> None:
    """Run the graph from 'place' on an existing result, in place."""
    state = {"language": report.get("language", doc.language), "report": report}
    report.update(graph(session, doc, start="place").invoke(state)["report"])


def graph(session: Session, doc: Document, start: str = "rules"):
    steps = {
        "rules": lambda s: {"report": _rules(doc, s["language"])},
        "cross_check": lambda s: {"report": _cross_check(session, doc, s["report"])},
        "place": lambda s: {"report": _place(doc, s["report"])},
        "draft": lambda s: {"report": _draft(doc, s["report"])},
        "policy": lambda s: {"report": _policy(session, doc, s["report"])},
        "summarize": lambda s: {"report": _summarized(doc, s["report"])},
    }
    g = StateGraph(ReportState)
    chain = ORDER[ORDER.index(start):]
    for name in chain:
        g.add_node(name, steps[name])
    g.add_edge(START, chain[0])
    for a, b in zip(chain, chain[1:]):
        g.add_edge(a, b)
    g.add_edge(chain[-1], END)
    return g.compile()


# ---------------------------------------------------------------- steps
def _rules(doc: Document, language: str) -> dict:
    """Deterministic candidates: guideline-required clause types without a certain clause; active old-name mentions."""
    required = required_for(doc.contract_type)
    best: dict[str, object] = {}
    for c in doc.clauses:
        if c.clause_type in TAXONOMY and (c.clause_type not in best or c.confidence > best[c.clause_type].confidence):
            best[c.clause_type] = c
    clauses = []
    for ct in TAXONOMY:
        c = best.get(ct)
        entry = {"clause_type": ct, "required": ct in required, "verified": False}
        if c is None:
            entry.update(status="missing", page=None, quote="")
        else:
            entry.update(status="present", page=c.page_no, quote=c.text[:240])
            if c.confidence < CERTAIN:  # labelled, but not confidently: the cross-check decides when it matters
                entry.update(uncertain=True, heading=c.heading)
        clauses.append(entry)
    mentions = [e for e in doc.entities if e.kind == "our_entity_old" and not e.historical]
    seen, old_names = set(), []
    for e in sorted(mentions, key=lambda e: (e.page_no, e.name)):
        key = (e.page_no, e.name.lower())
        if key in seen:
            continue
        seen.add(key)
        old_names.append({"name": e.name, "page": e.page_no, "quote": e.context[:240], "fuzzy": e.confidence < 1})
    return {
        "status": "ready",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "cross_checked": False,
        "degraded": False,
        "clauses": clauses,
        "old_names": old_names,
        "old_names_verified": False,
        "old_names_reason": "",
        "historical_names": sorted({e.name for e in doc.entities if e.kind == "our_entity_old" and e.historical}),
    }


def _cross_check(session: Session, doc: Document, report: dict) -> dict:
    """The verifier reads the whole contract for every candidate that matters; only it may remove one."""
    report = dict(report)
    language = report["language"]
    pages = [(p.page_no, p.text) for p in sorted(doc.page_rows, key=lambda p: p.page_no)]
    misses = 0  # verifications that could not run (provider outage / quota) - the result is then 'not cross-checked'
    clauses = []
    for entry in report["clauses"]:
        entry = dict(entry)
        ct = entry["clause_type"]
        if entry["required"] and (entry["status"] == "missing" or entry.get("uncertain")):
            history = learning.precedents(session, learning.class_key("missing_clause", doc.contract_type, ct))
            if entry["status"] == "missing":
                v = verify(pages, f"The contract contains no {LABELS[ct]} clause.", language, history)
            else:
                v = verify(pages, f"The contract contains a {LABELS[ct]} clause (heading: '{entry.get('heading', '')}').", language, history)
            misses += v is None
            if v is not None:
                entry["verified"] = True
                if entry["status"] == "missing":
                    if v.verdict == "refuted":
                        entry.update(status="present", page=v.page or None, quote=v.quote[:240], reason=v.reasoning)
                    elif v.verdict == "partial":
                        entry.update(status="partial", page=v.page or None, quote=v.quote[:240], reason=v.reasoning)
                    else:
                        entry["reason"] = v.reasoning
                else:
                    if v.verdict == "refuted":
                        entry.update(status="missing", page=None, quote="", reason=v.reasoning)
                    elif v.verdict == "partial":
                        entry.update(status="partial", reason=v.reasoning, page=v.page or entry["page"], quote=(v.quote or entry["quote"])[:240])
        entry.pop("uncertain", None)
        entry.pop("heading", None)
        clauses.append(entry)
    report["clauses"] = clauses
    old_names = list(report["old_names"])
    if old_names:
        names = sorted({m["name"] for m in old_names})
        v = verify(pages, f"The contract names {', '.join(repr(n) for n in names)} as an active contracting party "
                          f"(not merely a historical reference), so the name must be updated to '{NEW_NAME}'.", language,
                   learning.precedents(session, learning.class_key("old_name", doc.contract_type)))
        misses += v is None
        if v is not None:
            report["old_names_verified"], report["old_names_reason"] = True, v.reasoning
            if v.verdict == "refuted":
                old_names = []
    report["old_names"] = old_names
    report["cross_checked"] = settings.llm_enabled and misses == 0
    report["degraded"] = settings.llm_enabled and misses > 0  # re-check when the model is reachable again
    return report


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _place(doc: Document, report: dict) -> dict:
    """Every finding gets a place on a page: an exact box, an insertion line, or (honestly) just the page."""
    report = dict(report)
    language = report.get("language", doc.language)
    lang = language if language in ("de", "en") else "en"
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
    ordered = sorted(doc.clauses, key=lambda c: c.ordinal)
    body = [c for c in ordered if c.clause_type not in ("signature", "preamble", "other")]
    signature = next((c for c in ordered if c.clause_type == "signature"), None)
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
        old = old_items.get(key, {})
        items.append({
            "key": key, "kind": "partial_clause" if partial else "missing_clause", "clause_type": c["clause_type"],
            "page": page, "anchor": {"kind": kind, "bbox": bbox}, "quote": c.get("quote", "") if partial else "",
            "reason": c.get("reason", ""), "suggestion_title": TITLES["amend" if partial else "draft"][lang],
            "suggestion": old.get("suggestion", ""), "verified": c["verified"],
            "editable": bool(report["editable"] and text_layer.get(page)),
            "class_key": learning.class_key("missing_clause", doc.contract_type, c["clause_type"]),
            "_old": old,
        })
    for m in report.get("old_names", []):
        key = f"name:{m['page']}:{_slug(m['name'])}"
        bbox = box(m["page"], m["name"]) or (box(m["page"], m["quote"][:80]) if m.get("quote") else None)
        items.append({
            "key": key, "kind": "old_name", "name": m["name"], "page": m["page"],
            "anchor": {"kind": "highlight", "bbox": bbox}, "quote": m.get("quote", ""), "reason": report.get("old_names_reason", ""),
            "suggestion_title": TITLES["replace"][lang], "suggestion": "",
            "verified": bool(report.get("old_names_verified")), "editable": bool(report["editable"] and text_layer.get(m["page"])),
            "class_key": learning.class_key("old_name", doc.contract_type), "_old": old_items.get(key, {}),
        })
    if pdf is not None:
        pdf.close()

    def inside(a: list[float], b: list[float]) -> bool:  # box a lies within box b (with a little slack)
        return a[0] >= b[0] - 0.01 and a[1] >= b[1] - 0.01 and a[2] <= b[2] + 0.01 and a[3] <= b[3] + 0.01

    names = [it for it in items if it["kind"] == "old_name" and it["anchor"]["bbox"]]
    nested = {it["key"] for it in names for other in names
              if other is not it and other["page"] == it["page"] and len(other["name"]) > len(it["name"])
              and inside(it["anchor"]["bbox"], other["anchor"]["bbox"])}  # 'AFS' found inside 'arvato Financial Solutions (AFS)'
    report["items"] = [it for it in items if it["key"] not in nested]
    report.setdefault("storage", None)
    return report


def _draft(doc: Document, report: dict) -> dict:
    """The suggestion per finding: the new name, or a clause drafted in the contract's own language and style."""
    report = dict(report)
    language = report.get("language", doc.language)
    pages = [(p.page_no, p.text) for p in sorted(doc.page_rows, key=lambda p: p.page_no)]
    by_type = {c["clause_type"]: c for c in report["clauses"]}
    items = []
    for it in report["items"]:
        it = dict(it)
        if it["kind"] == "old_name":
            it["suggestion"] = NEW_NAME if " " in it["name"] else NEW_NAME.split()[0]  # 'AFS' -> 'Riverty'
        elif not it["suggestion"] and settings.llm_enabled:
            c = by_type[it["clause_type"]]
            d = draft_clause(pages, it["clause_type"], doc.contract_type, language, c.get("quote", "") if it["kind"] == "partial_clause" else "")
            if d is not None:
                it["suggestion"] = f"{d.heading}\n\n{d.text}".strip()
        items.append(it)
    report["items"] = items
    return report


def _policy(session: Session, doc: Document, report: dict) -> dict:
    """Earlier decisions carried over; the class rules decide who must look; decisions on this very report survive."""
    report = dict(report)
    items = [dict(it) for it in report["items"]]
    learning.apply(session, doc, items)
    for it in items:
        old = it.pop("_old", {})
        if old.get("review", {}).get("status") in ("accepted", "dismissed") and not it["review"]["carried_over"]:
            it["review"] = old["review"]
            it["policy"] = old.get("policy", it["policy"])
    report["items"] = items
    return report


def _summarized(doc: Document, report: dict) -> dict:
    report = dict(report)
    summarize(report, doc)
    return report


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


# ---------------------------------------------------------------- the team's decision
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
