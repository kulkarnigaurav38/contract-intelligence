"""The audit graph: plan -> deterministic -> verify -> report.

Deterministic first: coverage matrix / entity registry / embedding similarity
produce *claims* with evidence. The verifier then reads the full contract for
every claim that is not already certain. Every finding records the chain of
methods that produced it, so a reviewer can see whether it came from a rule,
a model, or both.
"""

import re
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import policy
from app.audits.verify import verify
from app.config import settings
from app.ingest.classify import TAXONOMY
from app.ingest.entities import HISTORICAL_RE
from app.ingest.ocr import ESCALATE_BELOW, UNREADABLE_BELOW
from app.models import Audit, Clause, Document, Entity, Finding, Page
from app.retrieval import best_match_per_document

LABELS = {
    "term_termination": "term and termination", "fees_payment": "fees and payment", "liability_cap": "limitation of liability",
    "confidentiality": "confidentiality", "data_protection": "data protection / GDPR", "governing_law": "governing law",
    "dispute_resolution": "dispute resolution / jurisdiction", "force_majeure": "force majeure", "assignment": "assignment",
    "audit_rights": "audit rights", "anti_corruption": "anti-corruption / compliance", "change_of_control": "change of control",
}
CERTAIN = 0.9  # presence at or above this confidence is not re-verified
NEW_NAME_DEFAULT = "Riverty GmbH"


class AuditState(TypedDict, total=False):
    audit_id: int
    kind: str
    params: dict
    scope: list[int]
    claims: list[dict]
    summary: dict


def _present_sim() -> tuple[float, float]:
    """(present_at_or_above, missing_at_or_below) cosine thresholds; the offline vector is a different scale."""
    return (0.75, 0.60) if settings.llm_enabled else (0.45, 0.25)


def build(session: Session):
    def plan(state: AuditState) -> AuditState:
        q = select(Document.id).where(Document.status == "ready")
        if ct := state["params"].get("contract_type"):
            q = q.where(Document.contract_type == ct)
        return {"scope": list(session.scalars(q)), "claims": []}

    def deterministic(state: AuditState) -> AuditState:
        kind, params = state["kind"], state["params"]
        docs = session.scalars(select(Document).where(Document.id.in_(state["scope"]))).all()
        claims, summary = [], {"scope": len(docs), "present": 0, "missing": 0, "uncertain": 0, "historical_only": 0,
                               "unreadable": 0}
        # Never silently pass a document the pipeline could not read: surface it instead.
        readable, weak_ocr = [], {}
        for doc in docs:
            weak = [s for s in doc.ingest_summary if s["method"] == "tesseract" and s["confidence"] < ESCALATE_BELOW]
            if weak and min(s["confidence"] for s in weak) < UNREADABLE_BELOW:
                summary["unreadable"] += 1
                _store(session, state["audit_id"], {"document_id": doc.id, "evidence": []}, "unreadable",
                       round(min(s["confidence"] for s in weak), 2),
                       [f"OCR confidence {min(s['confidence'] for s in weak):.0%} on page(s) "
                        f"{[s['page'] for s in weak]} is below the {UNREADABLE_BELOW:.0%} floor",
                        "vision OCR unavailable offline; human review required"], "")
                continue
            if weak:
                weak_ocr[doc.id] = min(s["confidence"] for s in weak)
            readable.append(doc)
        docs = readable
        if kind == "missing_clause":
            ct = params["clause_type"]
            nearest = best_match_per_document(session, f"{LABELS[ct]} clause")
            for doc in docs:
                typed = [c for c in doc.clauses if c.clause_type == ct]
                if typed:
                    best = max(typed, key=lambda c: c.confidence)
                    if best.confidence >= CERTAIN:
                        summary["present"] += 1
                        continue
                    summary["uncertain"] += 1
                    claims.append({
                        "document_id": doc.id, "direction": "present", "confidence": best.confidence,
                        "claim": f"The contract contains a {LABELS[ct]} clause (heading: '{best.heading}').",
                        "evidence": [{"page": best.page_no, "quote": best.text[:400]}],
                        "method_chain": [f"coverage matrix: labelled {ct} at {best.confidence:.0%} via {best.method}"],
                    })
                else:
                    summary["missing"] += 1
                    claims.append(_missing_claim(session, doc, ct, nearest.get(doc.id)))
        elif kind == "missing_passage":
            passage = params["passage"].strip()
            present_at, missing_at = _present_sim()
            matches = best_match_per_document(session, passage)
            for doc in docs:
                clause_id, sim = matches.get(doc.id, (None, 0.0))
                if sim >= present_at:
                    summary["present"] += 1
                    continue
                clause = session.get(Clause, clause_id) if clause_id else None
                direction = "missing" if sim <= missing_at else "uncertain"
                summary["missing" if direction == "missing" else "uncertain"] += 1
                claims.append({
                    "document_id": doc.id, "direction": "missing", "confidence": round(max(0.5, 1 - sim), 2),
                    "claim": f"The contract contains no provision equivalent to: \"{passage}\"",
                    "evidence": [{"page": clause.page_no, "quote": clause.text[:400]}] if clause else [],
                    "method_chain": [f"hybrid retrieval: closest clause similarity {sim:.2f} "
                                     f"({'below' if direction == 'missing' else 'between'} thresholds "
                                     f"{missing_at}/{present_at})"],
                })
        elif kind == "rename":
            new_name = params.get("new_name") or NEW_NAME_DEFAULT
            for doc in docs:
                mentions = _rename_mentions(session, doc, params.get("old_name"))
                active = [m for m in mentions if not m["historical"]]
                if not mentions:
                    summary["present"] += 1
                    continue
                if not active:
                    summary["historical_only"] += 1
                    continue
                summary["missing"] += 1
                names = sorted({m["name"] for m in active})
                fuzzy = [m for m in active if m["confidence"] < 1]
                chain = [f"entity registry: {len(active)} active mention(s) of {names}, "
                         f"{len(mentions) - len(active)} historical"]
                if fuzzy:
                    chain.append(f"{len(fuzzy)} OCR-tolerant fuzzy match(es), lowest ratio "
                                 f"{min(m['confidence'] for m in fuzzy):.2f}")
                claims.append({
                    "document_id": doc.id, "direction": "missing",
                    "confidence": round(min(0.85, min(m["confidence"] for m in active)), 2),
                    "claim": f"The contract names {', '.join(repr(n) for n in names)} as an active contracting party "
                             f"(not merely a historical reference), so the name must be updated to '{new_name}'.",
                    "evidence": [{"page": m["page"], "quote": m["context"]} for m in active[:3]],
                    "method_chain": chain,
                })
        for claim in claims:  # text read below the escalation gate caps the confidence of anything built on it
            if claim["document_id"] in weak_ocr:
                ocr_conf = weak_ocr[claim["document_id"]]
                claim["confidence"] = round(min(claim["confidence"], ocr_conf), 2)
                claim["method_chain"].append(f"OCR confidence {ocr_conf:.0%} is below the {ESCALATE_BELOW:.0%} "
                                             f"escalation gate; vision OCR unavailable offline")
        return {"claims": claims, "summary": summary}

    def verify_claims(state: AuditState) -> AuditState:
        summary = dict(state["summary"], verified=settings.llm_enabled, verifier=settings.model_pro)
        history = policy.precedents(session, policy.class_key(state["kind"], state["params"]))
        for claim in state["claims"]:
            pages = [(p.page_no, p.text) for p in session.scalars(
                select(Page).where(Page.document_id == claim["document_id"]).order_by(Page.page_no))]
            verdict = verify(pages, claim["claim"], state["params"].get("language", "en"), history)
            if verdict is None:
                if claim["direction"] == "missing":
                    _store(session, state["audit_id"], claim, "unverified", claim["confidence"],
                           claim["method_chain"] + ["verifier: unavailable offline"], "")
                continue
            chain = claim["method_chain"] + [f"verifier {settings.model_pro}: {verdict.verdict} ({verdict.confidence:.0%})"]
            evidence = claim["evidence"]
            if verdict.quote:
                evidence = [{"page": verdict.page, "quote": verdict.quote[:400]}] + evidence
            if claim["direction"] == "missing":
                status = {"confirmed": "confirmed", "refuted": "dismissed", "partial": "partial"}[verdict.verdict]
                _store(session, state["audit_id"], claim, status, verdict.confidence, chain, verdict.reasoning, evidence)
            elif verdict.verdict != "confirmed":  # "present" claim refuted or only partly true => flag it
                claim = dict(claim, claim=claim["claim"].replace("contains a", "does not contain a", 1))
                status = "confirmed" if verdict.verdict == "refuted" else "partial"
                _store(session, state["audit_id"], claim, status, verdict.confidence, chain, verdict.reasoning, evidence)
        session.commit()
        return {"summary": summary}

    def report(state: AuditState) -> AuditState:
        audit = session.get(Audit, state["audit_id"])
        review = policy.apply(session, audit)  # who has to look, and who does not
        counts = {}
        for f in audit.findings:
            counts[f.verdict] = counts.get(f.verdict, 0) + 1
        audit.summary = dict(state["summary"], findings=counts, review=review,
                             precedents=len(policy.precedents(session, policy.class_key(audit.kind, audit.params))))
        audit.status = "done"
        session.commit()
        return {}

    g = StateGraph(AuditState)
    g.add_node("plan", plan)
    g.add_node("deterministic", deterministic)
    g.add_node("verify", verify_claims)
    g.add_node("report", report)
    g.add_edge(START, "plan")
    g.add_edge("plan", "deterministic")
    g.add_edge("deterministic", "verify")
    g.add_edge("verify", "report")
    g.add_edge("report", END)
    return g.compile()


def _missing_claim(session: Session, doc: Document, ct: str, nearest: tuple[int, float] | None) -> dict:
    chain = [f"coverage matrix: 0 of {len(doc.clauses)} clauses labelled {ct}"]
    evidence, confidence = [], 0.6
    if nearest:
        clause = session.get(Clause, nearest[0])
        sim = nearest[1]
        chain.append(f"nearest clause by embedding: '{clause.heading or clause.clause_type}' (similarity {sim:.2f})")
        evidence = [{"page": clause.page_no, "quote": clause.text[:400]}]
        if settings.llm_enabled:
            confidence = round(min(0.95, max(0.5, 1 - sim)), 2)
    return {"document_id": doc.id, "direction": "missing", "confidence": confidence,
            "claim": f"The contract contains no {LABELS[ct]} clause.", "evidence": evidence, "method_chain": chain}


def _rename_mentions(session: Session, doc: Document, old_name: str | None) -> list[dict]:
    if not old_name:
        return [{"name": e.name, "page": e.page_no, "context": e.context, "historical": e.historical,
                 "confidence": e.confidence} for e in doc.entities if e.kind == "our_entity_old"]
    pattern = re.compile(r"(?<![\w-])" + re.escape(old_name) + r"(?![\w-])", re.I)
    out = []
    for page in session.scalars(select(Page).where(Page.document_id == doc.id)):
        for m in pattern.finditer(page.text):
            before = page.text[max(0, m.start() - 80): m.start()]
            context = (before + m.group(0) + page.text[m.end(): m.end() + 80]).replace("\n", " ").strip()
            out.append({"name": m.group(0), "page": page.page_no, "context": context,
                        "historical": bool(HISTORICAL_RE.search(before)), "confidence": 1.0})
    return out


def _store(session: Session, audit_id: int, claim: dict, verdict: str, confidence: float, chain: list[str],
           reasoning: str, evidence: list[dict] | None = None) -> None:
    session.add(Finding(audit_id=audit_id, document_id=claim["document_id"], verdict=verdict,
                        confidence=round(confidence, 2), method_chain=chain,
                        evidence=evidence if evidence is not None else claim["evidence"], reasoning=reasoning))


def run_audit(session: Session, audit_id: int) -> None:
    audit = session.get(Audit, audit_id)
    try:
        build(session).invoke({"audit_id": audit.id, "kind": audit.kind, "params": audit.params})
    except Exception as exc:
        session.rollback()
        audit = session.get(Audit, audit_id)
        audit.status, audit.summary = "failed", {"error": f"{type(exc).__name__}: {exc}"}
        session.commit()


def coverage_matrix(session: Session) -> dict:
    docs = session.scalars(select(Document).where(Document.status == "ready").order_by(Document.id)).all()
    rows = []
    for doc in docs:
        cells = {}
        for c in doc.clauses:
            if c.clause_type in TAXONOMY and c.confidence > cells.get(c.clause_type, {"confidence": -1})["confidence"]:
                cells[c.clause_type] = {"confidence": c.confidence, "method": c.method, "page": c.page_no,
                                        "heading": c.heading}
        rows.append({"document_id": doc.id, "filename": doc.filename, "title": doc.title,
                     "contract_type": doc.contract_type, "language": doc.language, "cells": cells})
    return {"taxonomy": TAXONOMY, "labels": LABELS, "rows": rows}
