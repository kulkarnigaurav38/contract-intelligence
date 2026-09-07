"""The legal team's decisions on findings, and what the system does with them.

Three effects, all visible in the report: (1) the same file checked again gets the earlier decisions carried
over; (2) notes become precedents for the AI cross-check of the same kind of finding; (3) a class of finding the
team has agreed with often enough is accepted automatically, with a deterministic spot-check sample and at least
one spot check per contract - the review rules (thresholds) are the ones in app/policy.py.
"""

import hashlib
from datetime import datetime, timezone

from app.db import Store
from app.models import Decision, Document
from app.policy import review_rate

HUMAN = ("accepted", "dismissed")
AS_POLICY = {"accepted": "approved", "dismissed": "rejected"}


def class_key(kind: str, contract_type: str, clause_type: str = "") -> str:
    return "rename" if kind == "old_name" else f"missing:{contract_type}:{clause_type}"


def current_decisions(session: Store, key: str) -> list[Decision]:
    """Latest decision per (file, item), oldest first; reopened items drop out."""
    latest: dict[tuple[str, str], Decision] = {}
    for d in session.decisions(class_key=key):
        latest[(d.sha256, d.item_key)] = d
    return sorted((d for d in latest.values() if d.decision in HUMAN), key=lambda d: d.id)


def rate(session: Store, key: str) -> float:
    return review_rate([AS_POLICY[d.decision] for d in current_decisions(session, key)])


def precedents(session: Store, key: str, limit: int = 3) -> list[dict]:
    rows = [d for d in reversed(current_decisions(session, key)) if d.note.strip()][:limit]
    return [{"decision": AS_POLICY[d.decision], "note": d.note, "quote": d.quote} for d in rows]


def previous(session: Store, sha256: str, item_key: str) -> Decision | None:
    rows = session.decisions(sha256=sha256, item_key=item_key)
    d = rows[-1] if rows else None
    return d if d is not None and d.decision in HUMAN else None


def _spot(sha256: str, key: str, r: float) -> bool:
    return int(hashlib.sha256(f"{sha256}:{key}".encode()).hexdigest()[:8], 16) % 100 < round(r * 100)


def apply(session: Store, doc: Document, items: list[dict]) -> None:
    """Fill item['review'] and item['policy'] for every finding of a fresh report."""
    now = datetime.now(timezone.utc).isoformat()
    automated, spot_checked = [], 0
    for it in items:
        prev = previous(session, doc.sha256, it["key"])
        if prev is not None:
            it["review"] = {"status": prev.decision, "note": prev.note, "edited_text": prev.edited_text, "carried_over": True,
                            "decided_at": prev.created_at.isoformat() if prev.created_at else None, "actor": prev.actor}
            it["policy"] = {"kind": "carried_over", "review_rate": rate(session, it["class_key"])}
            continue
        r = rate(session, it["class_key"])
        it["review"] = {"status": "open", "note": "", "edited_text": "", "carried_over": False, "decided_at": None, "actor": ""}
        if not it["verified"] or r >= 1.0:
            it["policy"] = {"kind": "required", "review_rate": r}
        elif _spot(doc.sha256, it["key"], r):
            it["policy"] = {"kind": "spot_check", "review_rate": r}
            spot_checked += 1
        else:
            it["review"].update(status="auto", decided_at=now, actor="system")
            it["policy"] = {"kind": "auto", "review_rate": r}
            automated.append(it)
    if automated and not spot_checked:  # a contract that automates anything still gets one human look
        it = min(automated, key=lambda i: i["key"])
        it["review"].update(status="open", decided_at=None, actor="")
        it["policy"] = {"kind": "spot_check", "review_rate": it["policy"]["review_rate"], "minimum": True}


def record(session: Store, doc: Document, item: dict, decision: str, note: str, edited_text: str, actor: str) -> None:
    """A Decision node, linked to the contract and the clause type: the drafter retrieves accepted wording and the
    cross-check the notes from there."""
    session.add(Decision(document_id=doc.id, sha256=doc.sha256, item_key=item["key"], class_key=item["class_key"],
                         decision=decision, note=note, edited_text=edited_text, quote=item.get("quote", "")[:400], actor=actor))
