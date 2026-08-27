from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Computed, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.db import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    contract_type: Mapped[str] = mapped_column(String(64), default="unknown")
    language: Mapped[str] = mapped_column(String(8), default="en")
    input_type: Mapped[str] = mapped_column(String(32), default="unknown")
    pages: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|processing|ready|failed
    error: Mapped[str] = mapped_column(Text, default="")
    # per-page extraction method + confidence, so the UI can show *how* text was obtained
    ingest_summary: Mapped[list] = mapped_column(JSON, default=list)
    injection_suspected: Mapped[bool] = mapped_column(default=False)
    injection_note: Mapped[str] = mapped_column(Text, default="")
    warnings: Mapped[list] = mapped_column(JSON, default=list)  # stages that had to fall back (provider outage etc.)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    page_rows: Mapped[list["Page"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    clauses: Mapped[list["Clause"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    entities: Mapped[list["Entity"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page_no: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String(16))  # text_layer|tesseract|vision_llm
    confidence: Mapped[float] = mapped_column(Float)

    document: Mapped[Document] = relationship(back_populates="page_rows")


class Clause(Base):
    """One clause = one retrieval unit. Clause-level chunking keeps chunks semantically whole."""

    __tablename__ = "clauses"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page_no: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(String(255), default="")
    text: Mapped[str] = mapped_column(Text)
    clause_type: Mapped[str] = mapped_column(String(32), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(32))  # rules | llm+rules | llm (rules disagree)
    rule_label: Mapped[str] = mapped_column(String(32), default="")
    llm_label: Mapped[str] = mapped_column(String(32), default="")
    embedding = mapped_column(Vector(settings.embedding_dim))
    tsv = mapped_column(TSVECTOR, Computed("to_tsvector('english', text) || to_tsvector('german', text)", persisted=True))

    document: Mapped[Document] = relationship(back_populates="clauses")


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page_no: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    normalized: Mapped[str] = mapped_column(String(255), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # our_entity_old|our_entity_current|third_party|counterparty|other
    context: Mapped[str] = mapped_column(Text)
    historical: Mapped[bool] = mapped_column(default=False)  # "formerly known as" style reference
    method: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[float] = mapped_column(Float, default=1.0)  # <1 for fuzzy (OCR-tolerant) matches

    document: Mapped[Document] = relationship(back_populates="entities")


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))  # missing_clause|missing_passage|rename
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="running")
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    findings: Mapped[list["Finding"]] = relationship(back_populates="audit", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    verdict: Mapped[str] = mapped_column(String(16))  # confirmed|unverified|dismissed
    confidence: Mapped[float] = mapped_column(Float)
    method_chain: Mapped[list] = mapped_column(JSON, default=list)  # ordered steps that produced the verdict
    evidence: Mapped[list] = mapped_column(JSON, default=list)  # [{page, quote}]
    reasoning: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|approved|rejected|auto_approved
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    storage_ref: Mapped[str] = mapped_column(String(64), default="")
    class_key: Mapped[str] = mapped_column(String(64), default="", index=True)  # the question asked, see policy.py
    policy: Mapped[dict] = mapped_column(JSON, default=dict)  # why a person did / did not have to look

    audit: Mapped[Audit] = relationship(back_populates="findings")
    document: Mapped[Document] = relationship()


class AuditLog(Base):
    """Append-only trail: who did what to which document/finding, and when."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[int] = mapped_column(Integer)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class StoredContract(Base):
    """Stand-in for the external contract-storage REST API (store-only, idempotent)."""

    __tablename__ = "stored_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(String(64), unique=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncState(Base):
    """Small key/value store for source bookkeeping (e.g. the SharePoint delta link)."""

    __tablename__ = "sync_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
