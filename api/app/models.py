"""What the store holds: one plain dataclass per node type of the graph (app/db.py writes and reads them).

    (Contract)-[:HAS_PAGE]->(Page)                       Document below - the code has always called it that
    (Contract)-[:HAS_CLAUSE]->(Clause)-[:IS_A]->(ClauseType), (Clause)-[:NEXT]->(Clause)
    (Contract)-[:MENTIONS {page_no, context, historical, ...}]->(Entity)     one Entity row here = one mention
    (Audit)-[:HAS_FINDING]->(Finding)-[:ON]->(Contract)
    (Decision)-[:ON]->(Contract), (Decision)-[:ABOUT]->(ClauseType)
    (AuditLog), (StoredContract), (SyncState)            stand alone

Ids are integers from a Counter node, so URLs, filenames and tests stay as they were with the relational store.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Page:
    document_id: int
    page_no: int
    text: str
    method: str  # text_layer|tesseract|vision_llm
    confidence: float


@dataclass
class Clause:
    """One clause = one retrieval unit. Clause-level chunking keeps chunks semantically whole."""

    document_id: int
    page_no: int
    ordinal: int
    text: str
    clause_type: str
    confidence: float
    method: str  # rules | llm+rules | llm (rules disagree)
    heading: str = ""
    rule_label: str = ""
    llm_label: str = ""
    embedding: list[float] | None = None
    id: int | None = None


@dataclass
class Entity:
    """One mention of a company name in one contract: the MENTIONS relationship to the Entity node."""

    document_id: int
    page_no: int
    name: str
    normalized: str
    kind: str  # our_entity_old|our_entity_current|third_party|counterparty|other
    context: str
    historical: bool  # "formerly known as" style reference
    method: str
    confidence: float = 1.0  # <1 for fuzzy (OCR-tolerant) matches


@dataclass
class Document:
    filename: str
    sha256: str
    id: int | None = None
    title: str = ""
    contract_type: str = "unknown"
    language: str = "en"
    input_type: str = "unknown"
    pages: int = 0
    status: str = "queued"  # queued|processing|ready|failed
    error: str = ""
    ingest_summary: list = field(default_factory=list)  # per-page extraction method + confidence
    injection_suspected: bool = False
    injection_note: str = ""
    warnings: list = field(default_factory=list)  # stages that had to fall back (provider outage etc.)
    report: dict = field(default_factory=dict)  # the per-contract result, see report.py
    created_at: datetime | None = None
    page_rows: list[Page] = field(default_factory=list)
    clauses: list[Clause] = field(default_factory=list)
    entities: list[Entity] = field(default_factory=list)


@dataclass
class Audit:
    kind: str  # missing_clause|missing_passage|rename
    params: dict = field(default_factory=dict)
    id: int | None = None
    status: str = "running"
    summary: dict = field(default_factory=dict)
    created_at: datetime | None = None
    findings: list["Finding"] = field(default_factory=list)


@dataclass
class Finding:
    audit_id: int
    document_id: int
    verdict: str  # confirmed|unverified|dismissed|partial|unreadable
    confidence: float
    method_chain: list = field(default_factory=list)  # ordered steps that produced the verdict
    evidence: list = field(default_factory=list)  # [{page, quote}]
    reasoning: str = ""
    id: int | None = None
    review_status: str = "pending"  # pending|approved|rejected|auto_approved
    review_note: str = ""
    reviewed_at: datetime | None = None
    storage_ref: str = ""
    class_key: str = ""  # the question asked, see policy.py
    policy: dict = field(default_factory=dict)  # why a person did / did not have to look
    document: Document | None = None  # the contract, without its pages and clauses
    audit: Audit | None = None  # the audit, without its findings


@dataclass
class AuditLog:
    """Append-only trail: who did what to which document/finding, and when."""

    actor: str
    action: str
    target_type: str
    target_id: int
    details: dict = field(default_factory=dict)
    id: int | None = None
    ts: datetime | None = None


@dataclass
class Decision:
    """What the legal team said about one finding of one file - reused when the file comes back, and as precedent."""

    sha256: str
    item_key: str
    class_key: str
    decision: str  # accepted | dismissed | reopened
    document_id: int | None = None
    note: str = ""
    edited_text: str = ""
    quote: str = ""
    actor: str = "legal.reviewer"
    id: int | None = None
    created_at: datetime | None = None


@dataclass
class StoredContract:
    """Stand-in for the external contract-storage REST API (store-only, idempotent)."""

    external_id: str
    idempotency_key: str
    sha256: str
    payload: dict = field(default_factory=dict)
    id: int | None = None
    created_at: datetime | None = None


@dataclass
class SyncState:
    """Small key/value store for source bookkeeping (e.g. the SharePoint delta link)."""

    key: str
    value: str
