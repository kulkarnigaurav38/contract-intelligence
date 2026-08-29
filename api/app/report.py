"""The per-contract result: which clauses are missing, where an old company name still appears.

Built automatically right after a contract has been read, so the legal team never has to start anything.
Rules first (clause-coverage from ingest, name registry), then the full-contract AI cross-check on every
missing clause the corporate guideline requires and on every old-name mention. Without a model key the
rule result stands, marked as not cross-checked.
"""

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.audits.graph import LABELS
from app.audits.verify import verify
from app.config import settings
from app.ingest.classify import TAXONOMY
from app.models import Document

CERTAIN = 0.9
NEW_NAME = "Riverty GmbH"


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


def _build(session: Session, doc: Document, language: str) -> dict:
    pages = [(p.page_no, p.text) for p in sorted(doc.page_rows, key=lambda p: p.page_no)]
    required = required_for(doc.contract_type)
    best: dict[str, object] = {}
    for c in doc.clauses:
        if c.clause_type in TAXONOMY and (c.clause_type not in best or c.confidence > best[c.clause_type].confidence):
            best[c.clause_type] = c
    clauses = []
    for ct in TAXONOMY:
        c = best.get(ct)
        entry = {"clause_type": ct, "required": ct in required, "verified": False}
        if c is not None and c.confidence >= CERTAIN:
            entry.update(status="present", page=c.page_no, quote=c.text[:240])
        elif c is not None:  # labelled, but not confidently: let the cross-check decide when it matters
            entry.update(status="present", page=c.page_no, quote=c.text[:240])
            if ct in required:
                v = verify(pages, f"The contract contains a {LABELS[ct]} clause (heading: '{c.heading}').", language)
                if v is not None:
                    entry["verified"] = True
                    if v.verdict == "refuted":
                        entry.update(status="missing", page=None, quote="", reason=v.reasoning)
                    elif v.verdict == "partial":
                        entry.update(status="partial", reason=v.reasoning, page=v.page or c.page_no, quote=(v.quote or c.text)[:240])
        else:
            entry.update(status="missing", page=None, quote="")
            if ct in required:
                v = verify(pages, f"The contract contains no {LABELS[ct]} clause.", language)
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
                          f"(not merely a historical reference), so the name must be updated to '{NEW_NAME}'.", language)
        if v is not None:
            names_verified, names_reason = True, v.reasoning
            if v.verdict == "refuted":
                old_names = []
    historical = sorted({e.name for e in doc.entities if e.kind == "our_entity_old" and e.historical})

    missing_required = [c for c in clauses if c["status"] != "present" and c["required"]]
    return {
        "status": "ready",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "cross_checked": settings.llm_enabled,
        "clauses": clauses,
        "old_names": old_names,
        "old_names_verified": names_verified,
        "old_names_reason": names_reason,
        "historical_names": historical,
        "summary": {"missing": len(missing_required), "partial": sum(1 for c in missing_required if c["status"] == "partial"),
                    "old_names": len(old_names), "old_name_pages": sorted({m["page"] for m in old_names}), "unreadable": any(s["method"] == "tesseract" and s["confidence"] < 0.5 for s in doc.ingest_summary)},
    }
