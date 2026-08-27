"""Adaptive human-in-the-loop: the review rate of a finding class falls as the team's decisions prove it right.

Every class starts at full review. Once the legal team has agreed with the system often enough, only a
deterministic spot-check sample is queued and the rest is auto-approved (logged, visible, overturnable).
A single human rejection resets the class to full review. Automation only ever applies to findings the AI
verifier confirmed; "not cross-checked" and "partial" findings always need a person. Earlier decisions on the
same contract are carried over so nobody reviews the same thing twice, and decisions with notes are fed back
to the verifier as precedents.
"""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Audit, AuditLog, Finding

MIN_DECISIONS = 8  # consecutive agreeing human decisions before any automation (a policy knob; the sample set yields 9)
MIN_AGREEMENT = 0.95  # overall share of approvals required
TIERS = [(24, 0.10), (MIN_DECISIONS, 0.20)]  # (decisions since last rejection, spot-check rate)
HUMAN = ("approved", "rejected")


def class_key(kind: str, params: dict) -> str:
    """What makes findings comparable: the question asked, not the contract."""
    if kind == "missing_clause":
        return f"missing_clause:{params.get('clause_type', '')}"
    if kind == "missing_passage":
        return "missing_passage:" + hashlib.sha1(params.get("passage", "").strip().lower().encode()).hexdigest()[:10]
    return f"rename:{params.get('old_name') or 'registry'}"


def human_decisions(session: Session, key: str) -> list[Finding]:
    return session.scalars(
        select(Finding).where(Finding.class_key == key, Finding.review_status.in_(HUMAN))
        .order_by(Finding.reviewed_at)
    ).all()


def review_rate(decisions: list[str]) -> float:
    """decisions: ordered human decisions ('approved'/'rejected'). Returns the share that still needs a person."""
    if not decisions:
        return 1.0
    agreement = decisions.count("approved") / len(decisions)
    since_rejection = 0
    for d in reversed(decisions):
        if d != "approved":
            break
        since_rejection += 1
    if agreement < MIN_AGREEMENT:
        return 1.0
    for threshold, rate in TIERS:
        if since_rejection >= threshold:
            return rate
    return 1.0


def class_stats(session: Session, key: str) -> dict:
    decisions = [f.review_status for f in human_decisions(session, key)]
    since = 0
    for d in reversed(decisions):
        if d != "approved":
            break
        since += 1
    auto = session.scalar(select(Finding.id).where(Finding.class_key == key, Finding.review_status == "auto_approved").limit(1))
    return {
        "class_key": key,
        "decisions": len(decisions),
        "approved": decisions.count("approved"),
        "rejected": decisions.count("rejected"),
        "since_rejection": since,
        "agreement": round(decisions.count("approved") / len(decisions), 3) if decisions else None,
        "review_rate": review_rate(decisions),
        "automation_active": auto is not None,
    }


def precedents(session: Session, key: str, limit: int = 3) -> list[dict]:
    """The team's most recent decisions with a note, newest first: what they consider acceptable and why."""
    rows = [f for f in reversed(human_decisions(session, key)) if f.review_note.strip()][:limit]
    return [{"decision": f.review_status, "note": f.review_note, "quote": (f.evidence[0]["quote"] if f.evidence else "")}
            for f in rows]


def _spot_check(audit_id: int, sha256: str, rate: float) -> bool:
    """Deterministic sample: reproducible for the audit trail, rotating across runs."""
    return int(hashlib.sha256(f"{audit_id}:{sha256}".encode()).hexdigest()[:8], 16) % 100 < round(rate * 100)


def apply(session: Session, audit: Audit) -> dict:
    """Decide for every new finding whether a person must look at it. Returns counts for the audit summary."""
    key = class_key(audit.kind, audit.params)
    rate = review_rate([f.review_status for f in human_decisions(session, key)])
    counts = {"required": 0, "spot_check": 0, "auto_approved": 0, "carried_over": 0}
    now = datetime.now(timezone.utc)
    for f in audit.findings:
        f.class_key = key
        if f.verdict in ("dismissed", "unreadable"):
            continue
        previous = session.scalar(
            select(Finding).where(Finding.document_id == f.document_id, Finding.class_key == key,
                                  Finding.review_status.in_(HUMAN), Finding.id != f.id)
            .order_by(Finding.reviewed_at.desc()).limit(1))
        if previous is not None:
            counts["carried_over"] += 1
            f.policy = {"kind": "carried_over", "decision": previous.review_status, "note": previous.review_note,
                        "decided_at": previous.reviewed_at.isoformat() if previous.reviewed_at else None,
                        "finding_id": previous.id}
            if previous.review_status == "rejected":
                f.verdict = "dismissed"
                f.method_chain = f.method_chain + [f"carried over: rejected by a reviewer on finding #{previous.id}"]
            else:
                f.review_status, f.review_note, f.reviewed_at = "auto_approved", previous.review_note, now
                f.method_chain = f.method_chain + [f"carried over: approved by a reviewer on finding #{previous.id}"]
                _log(session, f, "finding.auto_approved", {"reason": "carried_over", "from_finding": previous.id})
            continue
        if f.verdict != "confirmed" or rate >= 1.0:
            counts["required"] += 1
            f.policy = {"kind": "required", "reason": "not_verified" if f.verdict != "confirmed" else "learning",
                        "review_rate": rate}
            continue
        if _spot_check(audit.id, f.document.sha256, rate):
            counts["spot_check"] += 1
            f.policy = {"kind": "spot_check", "review_rate": rate}
        else:
            counts["auto_approved"] += 1
            f.review_status, f.reviewed_at = "auto_approved", now
            f.policy = {"kind": "auto", "review_rate": rate}
            f.method_chain = f.method_chain + [f"policy: class review rate {rate:.0%}, auto-approved (AI-confirmed)"]
            _log(session, f, "finding.auto_approved", {"reason": "trusted_class", "class_key": key, "review_rate": rate})
    session.commit()
    return counts


def _log(session: Session, f: Finding, action: str, details: dict) -> None:
    session.add(AuditLog(actor="system", action=action, target_type="finding", target_id=f.id,
                         details={"document_id": f.document_id, "sha256": f.document.sha256, **details}))
