import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import chat, correct, evaluation, files, policy, report, sources
from app.audits.graph import coverage_matrix, run_audit
from app.config import settings
from app.db import SessionLocal, get_session
from app.ingest.classify import TAXONOMY
from app.ingest.pipeline import ingest_path, log
from app.llm import routing_table
from app.models import Audit, AuditLog, Clause, Document, Entity, Finding, Page, StoredContract

router = APIRouter(prefix="/api")
UPLOADS = settings.data_dir / "uploads"


# ---------------------------------------------------------------- meta
@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def config() -> dict:
    from app.llm import model_id

    return {"llm_enabled": settings.llm_enabled, "provider": settings.llm_provider_resolved,
            "ocr_provider": settings.ocr_provider_resolved, "document_source": settings.document_source,
            "routing": routing_table(), "taxonomy": TAXONOMY,
            "embedding": {"model": model_id("embedding"), "dim": settings.embedding_dim}}


# ---------------------------------------------------------------- documents
def _doc_summary(d: Document, clause_count: int, entity_count: int) -> dict:
    return {"id": d.id, "filename": d.filename, "title": d.title, "contract_type": d.contract_type,
            "language": d.language, "input_type": d.input_type, "pages": d.pages, "status": d.status,
            "error": d.error, "ingest_summary": d.ingest_summary, "injection_suspected": d.injection_suspected,
            "injection_note": d.injection_note, "warnings": d.warnings, "sha256": d.sha256, "created_at": d.created_at,
            "clauses": clause_count, "entities": entity_count,
            "report_status": d.report.get("status", "pending"), "report_summary": d.report.get("summary")}


@router.get("/documents")
def list_documents(session: Session = Depends(get_session)) -> list[dict]:
    clauses = dict(session.execute(select(Clause.document_id, func.count()).group_by(Clause.document_id)).all())
    ents = dict(session.execute(select(Entity.document_id, func.count()).group_by(Entity.document_id)).all())
    return [_doc_summary(d, clauses.get(d.id, 0), ents.get(d.id, 0))
            for d in session.scalars(select(Document).order_by(Document.id))]


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, session: Session = Depends(get_session)) -> dict:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    return {**_doc_summary(d, len(d.clauses), len(d.entities)), "report": d.report,
            "page_rows": [{"page_no": p.page_no, "method": p.method, "confidence": p.confidence, "text": p.text}
                          for p in sorted(d.page_rows, key=lambda p: p.page_no)],
            "clause_rows": [{"id": c.id, "ordinal": c.ordinal, "page_no": c.page_no, "heading": c.heading,
                             "clause_type": c.clause_type, "confidence": c.confidence, "method": c.method,
                             "rule_label": c.rule_label, "llm_label": c.llm_label, "text": c.text}
                            for c in sorted(d.clauses, key=lambda c: c.ordinal)],
            "entity_rows": [{"name": e.name, "kind": e.kind, "page_no": e.page_no, "historical": e.historical,
                             "context": e.context, "method": e.method, "confidence": e.confidence}
                            for e in d.entities]}


def _ingest_many(paths: list[Path], actor: str, language: str = "de") -> None:
    for path in paths:
        with SessionLocal() as session:
            doc = ingest_path(session, path, actor)
            if doc.status == "ready" and not doc.report:  # a re-uploaded (known) file keeps its report
                report.build(session, doc, language)


@router.post("/documents/ingest-samples")
def ingest_samples(background: BackgroundTasks, actor: str = "system", batch: int = 1, language: str = "de") -> dict:
    """batch 1 = the sample set; batch 2 = the 'new arrivals'; 3 = real contracts (CUAD subset); 4 = real German documents."""
    folder = settings.data_dir / {1: "contracts", 2: "contracts_batch2", 3: "real/cuad", 4: "real/german"}.get(batch, "contracts")
    paths = sorted(p for p in folder.iterdir() if p.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png"))
    background.add_task(_ingest_many, paths, actor, language)
    return {"queued": len(paths)}


def _sync_job(actor: str) -> None:
    with SessionLocal() as session:
        sources.sync(session, actor)


@router.post("/documents/sync")
def sync_source(background: BackgroundTasks, actor: str = "system") -> dict:
    """Pull whatever is new from the configured document source (local folder or SharePoint via Graph)."""
    background.add_task(_sync_job, actor)
    return {"source": settings.document_source, "queued": True}


@router.post("/documents/upload")
def upload(background: BackgroundTasks, files: list[UploadFile], actor: str = "legal.reviewer", language: str = "de") -> dict:
    """One or many contracts at once; each is read and checked automatically."""
    UPLOADS.mkdir(exist_ok=True)
    paths = []
    for file in files:
        data = file.file.read()
        path = UPLOADS / f"{hashlib.sha256(data).hexdigest()[:12]}_{Path(file.filename).name}"
        path.write_bytes(data)
        paths.append(path)
    background.add_task(_ingest_many, paths, actor, language)
    return {"queued": len(paths), "filenames": [p.name for p in paths]}


def _report_job(doc_id: int, language: str) -> None:
    with SessionLocal() as session:
        doc = session.get(Document, doc_id)
        if doc and doc.status == "ready":
            report.build(session, doc, language)


@router.post("/documents/{doc_id}/report")
def rebuild_report(doc_id: int, background: BackgroundTasks, language: str = "de", session: Session = Depends(get_session)) -> dict:
    """Check a contract again (e.g. after the guideline changed or a provider outage)."""
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    d.report = {"status": "running"}
    session.commit()
    background.add_task(_report_job, doc_id, language)
    return {"queued": 1}


# ---------------------------------------------------------------- the viewer: pages, decisions, corrected copy
@router.get("/documents/{doc_id}/pages/{page_no}.png")
def page_image(doc_id: int, page_no: int, session: Session = Depends(get_session)) -> Response:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    data = files.page_png(d, page_no)
    if data is None:
        raise HTTPException(404, "page not available")
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/documents/{doc_id}/file")
def original_file(doc_id: int, session: Session = Depends(get_session)) -> FileResponse:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    path = files.source_path(d)
    if path is None:
        raise HTTPException(409, "source file no longer available")
    return FileResponse(path, filename=d.filename)


class ItemDecision(BaseModel):
    decision: str  # accepted | dismissed | reopen
    note: str = ""
    edited_text: str = ""
    actor: str = "legal.reviewer"


@router.post("/documents/{doc_id}/items/{key}/decide")
def decide_item(doc_id: int, key: str, body: ItemDecision, session: Session = Depends(get_session)) -> dict:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    if body.decision not in ("accepted", "dismissed", "reopen"):
        raise HTTPException(400, "decision must be accepted, dismissed or reopen")
    try:
        r = report.decide(session, d, key, body.decision, body.note, body.edited_text, body.actor)
    except KeyError:
        raise HTTPException(404, "no such finding")
    log(session, body.actor, f"item.{body.decision}", "document", d.id, {"item": key, "sha256": d.sha256, "note": body.note})
    session.commit()
    return r


def _corrected(d: Document) -> bytes:
    if not any(it["review"]["status"] in ("accepted", "auto") for it in d.report.get("items", [])):
        raise HTTPException(409, "nothing accepted yet")
    data = correct.corrected_pdf(d, d.report)
    if data is None:
        raise HTTPException(409, "source file no longer available")
    return data


@router.get("/documents/{doc_id}/corrected.pdf")
def corrected_copy(doc_id: int, session: Session = Depends(get_session)) -> Response:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    stem = Path(d.filename).stem
    return Response(content=_corrected(d), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{stem}_korrigiert.pdf"'})


@router.post("/documents/{doc_id}/file-to-storage")
def file_to_storage(doc_id: int, actor: str = "legal.reviewer", session: Session = Depends(get_session)) -> dict:
    """Store the corrected copy in the contract storage (store-only, idempotent: same content -> same key)."""
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    data = _corrected(d)
    sha = hashlib.sha256(data).hexdigest()
    applied = [{"key": it["key"], "kind": it["kind"], "page": it["page"], "text": it["review"].get("edited_text") or it["suggestion"],
                "decided_by": it["review"]["actor"], "decided_at": it["review"]["decided_at"]}
               for it in d.report.get("items", []) if it["review"]["status"] in ("accepted", "auto")]
    payload = {"filename": f"{Path(d.filename).stem}_korrigiert.pdf", "original_sha256": d.sha256, "sha256": sha,
               "size": len(data), "applied": applied, "filed_by": actor}
    r = httpx.post(f"{settings.contract_storage_url}/contracts", json=payload, headers={"Idempotency-Key": f"copy-{sha}"},
                   timeout=30)
    r.raise_for_status()
    ref = r.json()
    rep = dict(d.report)
    rep["storage"] = {"external_id": ref["external_id"], "sha256": sha, "at": datetime.now(timezone.utc).isoformat()}
    d.report = rep
    log(session, actor, "document.copy_filed", "document", d.id, {"external_id": ref["external_id"], "sha256": sha})
    session.commit()
    return ref


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, actor: str = "legal.reviewer", session: Session = Depends(get_session)) -> dict:
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    log(session, actor, "document.deleted", "document", d.id, {"filename": d.filename, "sha256": d.sha256})
    session.delete(d)
    session.commit()
    return {"deleted": doc_id}


@router.post("/documents/{doc_id}/retry")
def retry_document(doc_id: int, background: BackgroundTasks, actor: str = "legal.reviewer",
                   session: Session = Depends(get_session)) -> dict:
    """Read a failed (or degraded) document again, e.g. after a provider outage."""
    d = session.get(Document, doc_id)
    if not d:
        raise HTTPException(404)
    path = files.source_path(d)
    if path is None:
        raise HTTPException(409, "source file no longer available")
    session.delete(d)
    session.commit()
    background.add_task(_ingest_many, [path], actor)
    return {"queued": 1, "filename": d.filename}


@router.get("/coverage")
def coverage(session: Session = Depends(get_session)) -> dict:
    matrix = coverage_matrix(session)
    for row in matrix["rows"]:
        row["required"] = sorted(report.required_for(row["contract_type"]))
    return matrix


@router.post("/audits/guideline")
def guideline_audits(background: BackgroundTasks, contract_type: str = "", actor: str = "legal.reviewer",
                     language: str = "de", session: Session = Depends(get_session)) -> dict:
    """One missing-clause check per clause the guideline requires, for one contract type or for all."""
    types = [contract_type] if contract_type else sorted({
        d.contract_type for d in session.scalars(select(Document).where(Document.status == "ready"))})
    created = []
    for ct in types:
        for clause_type in sorted(report.required_for(ct)):
            audit = Audit(kind="missing_clause", params={"clause_type": clause_type, "contract_type": ct, "language": language,
                                                         "guideline": True})
            session.add(audit)
            session.commit()
            log(session, actor, "audit.create", "audit", audit.id, {"kind": audit.kind, "params": audit.params})
            session.commit()
            background.add_task(_run_audit_job, audit.id)
            created.append(audit.id)
    return {"audits": created}


# ---------------------------------------------------------------- audits
class AuditRequest(BaseModel):
    kind: str  # missing_clause | missing_passage | rename
    params: dict = {}
    actor: str = "legal.reviewer"


def _run_audit_job(audit_id: int) -> None:
    with SessionLocal() as session:
        run_audit(session, audit_id)


def _audit_dict(a: Audit) -> dict:
    return {"id": a.id, "kind": a.kind, "params": a.params, "status": a.status, "summary": a.summary,
            "created_at": a.created_at, "findings": len(a.findings)}


def _finding_dict(f: Finding) -> dict:
    return {"id": f.id, "audit_id": f.audit_id, "document_id": f.document_id, "filename": f.document.filename,
            "title": f.document.title, "verdict": f.verdict, "confidence": f.confidence,
            "method_chain": f.method_chain, "evidence": f.evidence, "reasoning": f.reasoning,
            "review_status": f.review_status, "review_note": f.review_note, "reviewed_at": f.reviewed_at,
            "storage_ref": f.storage_ref, "audit_kind": f.audit.kind, "audit_params": f.audit.params,
            "class_key": f.class_key, "policy": f.policy}


@router.post("/audits")
def create_audit(req: AuditRequest, background: BackgroundTasks, session: Session = Depends(get_session)) -> dict:
    if req.kind not in ("missing_clause", "missing_passage", "rename"):
        raise HTTPException(400, "unknown audit kind")
    if req.kind == "missing_clause" and req.params.get("clause_type") not in TAXONOMY:
        raise HTTPException(400, "clause_type must be one of the taxonomy")
    if req.kind == "missing_passage" and not req.params.get("passage", "").strip():
        raise HTTPException(400, "passage required")
    audit = Audit(kind=req.kind, params=req.params)
    session.add(audit)
    session.commit()
    log(session, req.actor, "audit.create", "audit", audit.id, {"kind": req.kind, "params": req.params})
    session.commit()
    background.add_task(_run_audit_job, audit.id)
    return _audit_dict(audit)


@router.get("/audits")
def list_audits(session: Session = Depends(get_session)) -> list[dict]:
    return [_audit_dict(a) for a in session.scalars(select(Audit).order_by(Audit.id.desc()))]


@router.get("/audits/{audit_id}")
def get_audit(audit_id: int, session: Session = Depends(get_session)) -> dict:
    a = session.get(Audit, audit_id)
    if not a:
        raise HTTPException(404)
    return {**_audit_dict(a), "findings": [_finding_dict(f) for f in sorted(a.findings, key=lambda f: -f.confidence)]}


# ---------------------------------------------------------------- review + storage
class Review(BaseModel):
    decision: str  # approved | rejected
    note: str = ""
    actor: str = "legal.reviewer"


@router.get("/findings")
def list_findings(review_status: str | None = None, session: Session = Depends(get_session)) -> list[dict]:
    q = select(Finding).where(Finding.verdict != "dismissed").order_by(Finding.id.desc())
    if review_status:
        q = q.where(Finding.review_status == review_status)
    return [_finding_dict(f) for f in session.scalars(q)]


@router.post("/findings/{finding_id}/review")
def review_finding(finding_id: int, review: Review, session: Session = Depends(get_session)) -> dict:
    f = session.get(Finding, finding_id)
    if not f:
        raise HTTPException(404)
    if review.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be approved or rejected")
    f.review_status, f.review_note, f.reviewed_at = review.decision, review.note, datetime.now(timezone.utc)
    log(session, review.actor, f"finding.{review.decision}", "finding", f.id,
        {"document_id": f.document_id, "sha256": f.document.sha256, "note": review.note})
    session.commit()
    return _finding_dict(f)


@router.post("/findings/{finding_id}/push-to-storage")
def push_to_storage(finding_id: int, actor: str = "legal.reviewer", session: Session = Depends(get_session)) -> dict:
    f = session.get(Finding, finding_id)
    if not f:
        raise HTTPException(404)
    if f.review_status not in ("approved", "auto_approved"):
        raise HTTPException(409, "only approved findings can be pushed")
    payload = {"filename": f.document.filename, "sha256": f.document.sha256, "finding_id": f.id,
               "audit": {"kind": f.audit.kind, "params": f.audit.params}, "reviewer": actor,
               "decision_note": f.review_note, "evidence": f.evidence}
    key = f"finding-{f.id}-{f.document.sha256[:16]}"  # same finding -> same key -> no duplicate copies
    r = httpx.post(f"{settings.contract_storage_url}/contracts", json=payload, headers={"Idempotency-Key": key},
                   timeout=30)
    r.raise_for_status()
    f.storage_ref = r.json()["external_id"]
    log(session, actor, "finding.pushed_to_storage", "finding", f.id, {"external_id": f.storage_ref, "idempotency_key": key})
    session.commit()
    return _finding_dict(f)


@router.get("/policy")
def review_policy(session: Session = Depends(get_session)) -> dict:
    """Per finding class: how the team's decisions have changed the review rate."""
    keys = sorted({k for k in session.scalars(select(Finding.class_key).distinct()) if k})
    classes = []
    for k in keys:
        stats = policy.class_stats(session, k)
        sample = session.scalar(select(Finding).where(Finding.class_key == k).limit(1))
        counts = dict(session.execute(select(Finding.review_status, func.count()).where(Finding.class_key == k)
                                      .group_by(Finding.review_status)).all())
        classes.append({**stats, "kind": sample.audit.kind, "params": sample.audit.params, "findings": counts})
    return {"classes": classes, "rules": {"min_decisions": policy.MIN_DECISIONS, "min_agreement": policy.MIN_AGREEMENT,
                                         "tiers": policy.TIERS}}


@router.get("/audit-log")
def audit_log(session: Session = Depends(get_session)) -> list[dict]:
    return [{"id": e.id, "ts": e.ts, "actor": e.actor, "action": e.action, "target_type": e.target_type,
             "target_id": e.target_id, "details": e.details}
            for e in session.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(200))]


# mock of the external contract-storage REST API (store-only, legally compliant copy)
@router.post("/mock-contract-storage/contracts", status_code=201)
def storage_put(payload: dict, idempotency_key: str = Header(alias="Idempotency-Key"),
                session: Session = Depends(get_session)) -> dict:
    existing = session.scalar(select(StoredContract).where(StoredContract.idempotency_key == idempotency_key))
    if existing:
        return {"external_id": existing.external_id, "duplicate": True}
    rec = StoredContract(external_id=f"CS-{uuid.uuid4().hex[:10].upper()}", idempotency_key=idempotency_key,
                         sha256=payload.get("sha256", ""), payload=payload)
    session.add(rec)
    session.commit()
    return {"external_id": rec.external_id, "duplicate": False}


@router.get("/mock-contract-storage/contracts")
def storage_list(session: Session = Depends(get_session)) -> list[dict]:
    return [{"external_id": r.external_id, "sha256": r.sha256, "created_at": r.created_at, "payload": r.payload}
            for r in session.scalars(select(StoredContract).order_by(StoredContract.id.desc()))]


# ---------------------------------------------------------------- chat + eval
class Question(BaseModel):
    question: str
    language: str = "en"


@router.post("/chat")
def ask(q: Question, session: Session = Depends(get_session)) -> dict:
    return chat.ask(session, q.question, q.language)


@router.post("/eval/run")
def run_eval(session: Session = Depends(get_session)) -> dict:
    return evaluation.run_eval(session)


@router.get("/ground-truth")
def ground_truth() -> dict:
    return json.loads((settings.data_dir / "ground_truth.json").read_text())
