"""Score what is in the database against the generated ground truth.

Two layers are scored separately so the effect of verification is visible:
the deterministic layer (coverage matrix, entity registry) and each finished
audit (deterministic + verifier).
"""

import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.ingest.classify import TAXONOMY
from app.ingest.ocr import UNREADABLE_BELOW
from app.models import Audit, Document


def _prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 1.0
    r = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(p, 3), "recall": round(r, 3), "f1": round(f1, 3)}


def _score(predicted: set, actual: set) -> tuple[dict, list]:
    tp, fp, fn = predicted & actual, predicted - actual, actual - predicted
    errors = [{"key": k, "error": "false_positive"} for k in sorted(fp)] + \
             [{"key": k, "error": "false_negative"} for k in sorted(fn)]
    return _prf(len(tp), len(fp), len(fn)), errors


def run_eval(session: Session) -> dict:
    gt = json.loads((settings.data_dir / "ground_truth.json").read_text())
    truth = {c["file"]: c for c in gt["contracts"]}
    docs = {d.filename: d for d in session.scalars(select(Document).where(Document.status == "ready"))
            if d.filename in truth}
    if not docs:
        return {"error": "no ground-truth documents ingested"}
    # documents the pipeline flagged as unreadable are escalated to humans, not scored as clean
    unreadable = sorted(truth[fn]["id"] for fn, d in docs.items()
                        if any(s["method"] == "tesseract" and s["confidence"] < UNREADABLE_BELOW for s in d.ingest_summary))
    docs = {fn: d for fn, d in docs.items() if truth[fn]["id"] not in unreadable}

    # deterministic layer: coverage matrix -> "missing clause" decisions per (doc, type)
    pred, actual = set(), set()
    for fn, doc in docs.items():
        labelled = {c.clause_type for c in doc.clauses}
        for ct in TAXONOMY:
            key = f"{truth[fn]['id']}:{ct}"
            if ct not in labelled:
                pred.add(key)
            if ct in truth[fn]["clauses_missing"]:
                actual.add(key)
    coverage, coverage_errors = _score(pred, actual)

    # deterministic layer: entity registry -> "needs rename" per doc
    pred = {truth[fn]["id"] for fn, d in docs.items()
            if any(e.kind == "our_entity_old" and not e.historical for e in d.entities)}
    actual = {truth[fn]["id"] for fn in docs if truth[fn]["needs_rename"]}
    rename, rename_errors = _score(pred, actual)

    # per-page extraction quality: how each input type was read
    extraction = {}
    for fn, d in docs.items():
        for s in d.ingest_summary:
            bucket = extraction.setdefault(truth[fn]["input_type"], {"pages": 0, "methods": {}, "confidence": 0.0})
            bucket["pages"] += 1
            bucket["methods"][s["method"]] = bucket["methods"].get(s["method"], 0) + 1
            bucket["confidence"] += s["confidence"]
    for b in extraction.values():
        b["confidence"] = round(b["confidence"] / b["pages"], 2)

    # finished audits: findings (confirmed + unverified) vs truth
    audits = []
    for audit in session.scalars(select(Audit).where(Audit.status == "done").order_by(Audit.id)):
        if audit.params.get("document_ids"):  # scoped to a benchmark (e.g. CUAD): scored in real_data, not here
            continue
        scope = {fn for fn, d in docs.items()
                 if not audit.params.get("contract_type") or d.contract_type == audit.params["contract_type"]}
        if audit.kind == "missing_clause":
            actual = {truth[fn]["id"] for fn in scope if audit.params["clause_type"] in truth[fn]["clauses_missing"]}
        elif audit.kind == "rename" and not audit.params.get("old_name"):
            actual = {truth[fn]["id"] for fn in scope if truth[fn]["needs_rename"]}
        else:
            continue
        by_id = {d.id: fn for fn, d in docs.items()}
        pred = {truth[by_id[f.document_id]]["id"] for f in audit.findings
                if f.verdict in ("confirmed", "unverified", "partial") and f.document_id in by_id}
        metrics, errors = _score(pred, actual)
        audits.append({"audit_id": audit.id, "kind": audit.kind, "params": audit.params,
                       "verified": audit.summary.get("verified", False), "metrics": metrics, "errors": errors})

    injection = [{"id": truth[fn]["id"], "expected": truth[fn]["injection"], "flagged": d.injection_suspected}
                 for fn, d in docs.items() if truth[fn]["injection"] or d.injection_suspected]

    return {"documents": len(docs) + len(unreadable), "unreadable": unreadable, "llm_enabled": settings.llm_enabled,
            "real_data": real_data(session),
            "coverage_matrix": {"metrics": coverage, "errors": coverage_errors},
            "rename_registry": {"metrics": rename, "errors": rename_errors},
            "extraction": extraction, "audits": audits, "injection": injection}


def real_data(session: Session) -> dict | None:
    """Score the pipeline against CUAD's expert annotations for the five clause types the two taxonomies share."""
    path = settings.data_dir / "real" / "cuad_ground_truth.json"
    if not path.exists():
        return None
    gt = json.loads(path.read_text())
    truth = {c["file"]: c for c in gt["contracts"]}
    # uploads are stored as <12-hex-hash>_<original name>; match on the original name
    docs = {}
    for d in session.scalars(select(Document).where(Document.status == "ready")):
        name = d.filename.split("_", 1)[1] if re.match(r"^[0-9a-f]{12}_", d.filename) else d.filename
        if name in truth:
            docs[name] = d
    if not docs:
        return {"source": gt.get("note", ""), "documents": 0}
    types = sorted(set(gt["mapping"].values()))
    pred, actual = set(), set()
    per_type = {t: {"tp": 0, "fp": 0, "fn": 0} for t in types}
    for fn, d in docs.items():
        labelled = {c.clause_type for c in d.clauses}
        for t in types:
            key = f"{fn[:40]}:{t}"
            p_missing, a_missing = t not in labelled, t in truth[fn]["clauses_missing"]
            if p_missing:
                pred.add(key)
            if a_missing:
                actual.add(key)
            if p_missing and a_missing:
                per_type[t]["tp"] += 1
            elif p_missing:
                per_type[t]["fp"] += 1
            elif a_missing:
                per_type[t]["fn"] += 1
    metrics, errors = _score(pred, actual)
    audits = []
    ids = {d.id: fn for fn, d in docs.items()}
    for audit in session.scalars(select(Audit).where(Audit.status == "done").order_by(Audit.id)):
        if audit.kind != "missing_clause" or audit.params.get("clause_type") not in types or not audit.params.get("document_ids"):
            continue
        t = audit.params["clause_type"]
        a = {f"{fn[:40]}:{t}" for fn in docs if t in truth[fn]["clauses_missing"]}
        p = {f"{ids[f.document_id][:40]}:{t}" for f in audit.findings if f.document_id in ids and f.verdict in ("confirmed", "unverified", "partial")}
        m, e = _score(p, a)
        audits.append({"audit_id": audit.id, "clause_type": t, "verified": audit.summary.get("verified", False), "metrics": m, "errors": e})
    return {"source": "CUAD v1 (The Atticus Project, CC BY 4.0) - " + gt.get("note", ""), "documents": len(docs), "types": types,
            "coverage_matrix": {"metrics": metrics, "errors": errors, "per_type": {t: _prf(**v) for t, v in per_type.items()}},
            "audits": audits}
