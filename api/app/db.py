"""Neo4j is the database. Documents, pages, clauses, name mentions, audits, findings, decisions, the audit log, the
stored copies and the sync state are nodes and relationships of one graph; app/graph.py adds the knowledge side
(taxonomy, guideline, name register, retrieval, what the models get to read).

A Store is a unit of work: `add`, `get`, `delete`, then `commit` writes everything in one transaction, `rollback`
forgets it. Objects are the dataclasses in app/models.py; whatever was fetched or added is tracked, and a changed
object is written back on commit. Ids come from Counter nodes, so they stay small integers.
"""

import json
import logging
import time
from collections.abc import Iterator
from dataclasses import fields
from datetime import datetime, timezone

from app.config import settings
from app.models import Audit, AuditLog, Clause, Decision, Document, Entity, Finding, Page, StoredContract, SyncState

log = logging.getLogger("contracts.db")
DOWN_COOLDOWN = 60.0  # seconds: an unreachable server is not retried on every call
_driver = None
_down_until = 0.0

LABEL = {Document: "Contract", Page: "Page", Clause: "Clause", Entity: "Entity", Audit: "Audit", Finding: "Finding",
         AuditLog: "AuditLog", Decision: "Decision", StoredContract: "StoredContract", SyncState: "SyncState"}
JSON_FIELDS = {"ingest_summary", "report", "params", "summary", "evidence", "policy", "details", "payload"}  # nested -> string
LINKS = {"page_rows", "clauses", "entities", "findings", "document", "audit"}  # relationships, not properties
MUTABLE = {Document, Audit, Finding, SyncState}  # written back on commit when changed
NO_ID = {Page, Entity, SyncState}  # children of a contract, or keyed by name: no counter id, not tracked
CASCADE_ORDER = [Document, Page, Clause, Entity, Audit, Finding, Decision, AuditLog, StoredContract, SyncState]


class GraphUnavailable(RuntimeError):
    """Neo4j is not configured or not reachable."""


# ---------------------------------------------------------------- connection
def driver():
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase

        _driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password),
                                       connection_timeout=5, notifications_min_severity="OFF")
    return _driver


def reset() -> None:
    """Forget the connection (tests point the store at a scratch server)."""
    global _driver, _down_until
    if _driver is not None:
        _driver.close()
    _driver, _down_until = None, 0.0


def _guard() -> None:
    if not settings.graph_enabled:
        raise GraphUnavailable("no NEO4J_URI configured")
    if time.monotonic() < _down_until:
        raise GraphUnavailable("graph unreachable (cooling down)")


def _errors() -> tuple:
    """What counts as the server's fault (a rejected statement or an unreachable server); a Python error is a bug and propagates."""
    from neo4j.exceptions import DriverError, Neo4jError

    return (Neo4jError, DriverError, OSError)


def _failed(exc: Exception) -> GraphUnavailable:
    global _down_until
    from neo4j.exceptions import ClientError

    if isinstance(exc, ClientError):
        log.error("graph rejected a statement: %s", str(exc)[:200])
    else:
        _down_until = time.monotonic() + DOWN_COOLDOWN
        log.warning("graph unavailable, cooling down for %.0fs: %s", DOWN_COOLDOWN, str(exc)[:160])
    return GraphUnavailable(str(exc)[:120])


def run(query: str, **params) -> list[dict]:
    """One auto-committed query, its rows as dicts."""
    _guard()
    try:
        result = driver().execute_query(query, params, database_=settings.neo4j_database)
        return [r.data() for r in result.records]
    except _errors() as exc:
        raise _failed(exc) from exc


def reachable() -> bool:
    try:
        run("RETURN 1")
        return True
    except GraphUnavailable:
        return False


def init_db() -> None:
    """Constraints and indexes for the store, then the knowledge side's indexes and seed (idempotent)."""
    for label, key in (("Contract", "id"), ("Contract", "sha256"), ("Clause", "id"), ("Audit", "id"), ("Finding", "id"),
                       ("Decision", "id"), ("AuditLog", "id"), ("StoredContract", "id"), ("StoredContract", "idempotency_key"),
                       ("SyncState", "key"), ("Counter", "name"), ("ClauseType", "key"), ("ContractType", "key"), ("Entity", "key")):
        run(f"CREATE CONSTRAINT {label.lower()}_{key} IF NOT EXISTS FOR (n:{label}) REQUIRE n.{key} IS UNIQUE")
    for label, key in (("Page", "document_id"), ("Clause", "document_id"), ("Finding", "class_key"), ("Finding", "review_status"),
                       ("Finding", "document_id"), ("Decision", "class_key"), ("Decision", "sha256")):
        run(f"CREATE INDEX {label.lower()}_{key} IF NOT EXISTS FOR (n:{label}) ON (n.{key})")
    from app import graph  # lazy: graph imports this module

    graph.ensure_schema()


# ---------------------------------------------------------------- (de)serialisation
def _props(obj) -> dict:
    out = {}
    for f in fields(obj):
        if f.name in LINKS:
            continue
        v = getattr(obj, f.name)
        out[f.name] = json.dumps(v) if f.name in JSON_FIELDS else v
    return out


def _load(cls, data: dict):
    kw = {}
    for f in fields(cls):
        if f.name in LINKS or f.name not in data:
            continue
        v = data[f.name]
        if f.name in JSON_FIELDS and isinstance(v, str):
            v = json.loads(v)
        elif hasattr(v, "to_native"):  # neo4j.time.DateTime -> datetime
            v = v.to_native()
        kw[f.name] = v
    return cls(**kw)


def _snapshot(obj) -> str:
    return json.dumps(_props(obj), sort_keys=True, default=str)


# ---------------------------------------------------------------- the unit of work
class Store:
    def __init__(self):
        self._new: list = []
        self._deleted: list = []
        self._tracked: dict[tuple, object] = {}
        self._snap: dict[tuple, str] = {}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def close(self) -> None:
        self.rollback()

    # ---- tracking
    def _key(self, obj) -> tuple:
        return (type(obj), obj.key if isinstance(obj, SyncState) else obj.id)

    def _track(self, obj):
        key = self._key(obj)
        if key in self._tracked:  # the same node fetched twice: one object per unit of work
            return self._tracked[key]
        self._tracked[key] = obj
        self._snap[key] = _snapshot(obj)
        return obj

    def add(self, obj) -> None:
        self._new.append(obj)

    def delete(self, obj) -> None:
        self._deleted.append(obj)

    def flush(self) -> None:
        self.commit()

    def rollback(self) -> None:
        self._new, self._deleted, self._tracked, self._snap = [], [], {}, {}

    def commit(self) -> None:
        dirty = [o for k, o in self._tracked.items() if type(o) in MUTABLE and _snapshot(o) != self._snap[k]]
        if not (self._new or self._deleted or dirty):
            return
        _guard()
        try:
            with driver().session(database=settings.neo4j_database) as s:
                s.execute_write(self._write, list(self._new), list(self._deleted), dirty)
        except _errors() as exc:
            raise _failed(exc) from exc
        for o in self._new:
            if type(o) not in NO_ID:
                self._track(o)
        for o in self._deleted:
            self._tracked.pop(self._key(o), None)
            self._snap.pop(self._key(o), None)
        for o in dirty:
            self._snap[self._key(o)] = _snapshot(o)
        self._new, self._deleted = [], []

    # ---- one transaction
    def _write(self, tx, new: list, deleted: list, dirty: list) -> None:
        now = datetime.now(timezone.utc)
        by_type: dict[type, list] = {}
        for o in new:
            by_type.setdefault(type(o), []).append(o)
        for cls, objs in by_type.items():
            if cls in NO_ID:
                continue
            need = [o for o in objs if o.id is None]
            if need:
                top = tx.run("MERGE (c:Counter {name: $name}) SET c.value = coalesce(c.value, 0) + $n RETURN c.value AS v",
                             name=LABEL[cls], n=len(need)).single()["v"]
                for o, i in zip(need, range(top - len(need) + 1, top + 1)):
                    o.id = i
            for o in objs:
                for stamp in ("created_at", "ts"):
                    if hasattr(o, stamp) and getattr(o, stamp) is None:
                        setattr(o, stamp, now)
        for cls in CASCADE_ORDER:
            objs = by_type.get(cls)
            if objs:
                getattr(self, f"_create_{LABEL[cls].lower()}")(tx, objs)
        for o in dirty:
            if isinstance(o, SyncState):
                tx.run("MATCH (n:SyncState {key: $key}) SET n.value = $value", key=o.key, value=o.value)
            else:
                tx.run(f"MATCH (n:{LABEL[type(o)]} {{id: $id}}) SET n += $props", id=o.id, props=_props(o))
        for o in deleted:
            if isinstance(o, Document):
                tx.run("MATCH (f:Finding)-[:ON]->(c:Contract {id: $id}) DETACH DELETE f", id=o.id)
                tx.run("MATCH (d:Decision)-[r:ON]->(c:Contract {id: $id}) SET d.document_id = null DELETE r", id=o.id)
                tx.run("MATCH (c:Contract {id: $id}) OPTIONAL MATCH (c)-[:HAS_PAGE|HAS_CLAUSE]->(x) DETACH DELETE x, c", id=o.id)
            else:
                tx.run(f"MATCH (n:{LABEL[type(o)]} {{id: $id}}) DETACH DELETE n", id=o.id)

    def _create_contract(self, tx, objs):
        tx.run("UNWIND $rows AS r CREATE (c:Contract) SET c = r", rows=[_props(o) for o in objs])

    def _create_page(self, tx, objs):
        tx.run("UNWIND $rows AS r MATCH (c:Contract {id: r.document_id}) CREATE (p:Page) SET p = r CREATE (c)-[:HAS_PAGE]->(p)",
               rows=[_props(o) for o in objs])

    def _create_clause(self, tx, objs):
        tx.run("UNWIND $rows AS r MATCH (c:Contract {id: r.document_id}) CREATE (k:Clause) SET k = r CREATE (c)-[:HAS_CLAUSE]->(k) "
               "WITH k, r MERGE (t:ClauseType {key: r.clause_type}) CREATE (k)-[:IS_A {confidence: r.confidence, method: r.method}]->(t)",
               rows=[_props(o) for o in objs])
        for doc_id in sorted({o.document_id for o in objs}):
            tx.run("MATCH (:Contract {id: $id})-[:HAS_CLAUSE]->(k) WITH k ORDER BY k.ordinal WITH collect(k) AS ks "
                   "UNWIND range(0, size(ks) - 2) AS i WITH ks[i] AS a, ks[i + 1] AS b MERGE (a)-[:NEXT]->(b)", id=doc_id)

    def _create_entity(self, tx, objs):
        tx.run("UNWIND $rows AS r MATCH (c:Contract {id: r.document_id}) "
               "MERGE (e:Entity {key: r.normalized}) ON CREATE SET e.name = r.name, e.kind = r.kind, e.source = 'contract' "
               "CREATE (c)-[:MENTIONS {page_no: r.page_no, name: r.name, normalized: r.normalized, kind: r.kind, context: r.context, "
               "historical: r.historical, method: r.method, confidence: r.confidence}]->(e)", rows=[_props(o) for o in objs])

    def _create_audit(self, tx, objs):
        tx.run("UNWIND $rows AS r CREATE (a:Audit) SET a = r", rows=[_props(o) for o in objs])

    def _create_finding(self, tx, objs):
        tx.run("UNWIND $rows AS r MATCH (a:Audit {id: r.audit_id}) CREATE (f:Finding) SET f = r CREATE (a)-[:HAS_FINDING]->(f) "
               "WITH f, r MATCH (c:Contract {id: r.document_id}) CREATE (f)-[:ON]->(c)", rows=[_props(o) for o in objs])

    def _create_decision(self, tx, objs):
        rows = [{**_props(o), "clause_type": o.class_key.split(":")[2] if o.class_key.count(":") >= 2 else ""} for o in objs]
        tx.run("UNWIND $rows AS r CREATE (d:Decision) SET d = r WITH d, r REMOVE d.clause_type "
               "WITH d, r OPTIONAL MATCH (c:Contract {id: r.document_id}) "
               "FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END | CREATE (d)-[:ON]->(c)) "
               "WITH d, r OPTIONAL MATCH (t:ClauseType {key: r.clause_type}) "
               "FOREACH (_ IN CASE WHEN t IS NULL THEN [] ELSE [1] END | CREATE (d)-[:ABOUT]->(t))", rows=rows)

    def _create_auditlog(self, tx, objs):
        tx.run("UNWIND $rows AS r CREATE (l:AuditLog) SET l = r", rows=[_props(o) for o in objs])

    def _create_storedcontract(self, tx, objs):
        tx.run("UNWIND $rows AS r CREATE (s:StoredContract) SET s = r", rows=[_props(o) for o in objs])

    def _create_syncstate(self, tx, objs):
        tx.run("UNWIND $rows AS r MERGE (s:SyncState {key: r.key}) SET s.value = r.value", rows=[_props(o) for o in objs])

    # ---- reads
    def refresh(self, obj) -> None:
        """Reload what hangs off a node: a Document's pages, clauses and mentions; an Audit's findings. Objects added
        through `add` are not appended to these lists, so the lists are read again after a commit."""
        if isinstance(obj, Document):
            obj.page_rows, obj.clauses, obj.entities = self.pages(obj.id), self._clauses_of(obj.id), self._mentions_of(obj.id)
        elif isinstance(obj, Audit):
            obj.findings = self.findings(audit_id=obj.id, audit=obj)

    def get(self, cls, key):
        """One node by id (SyncState by key): a Document with its pages, clauses and mentions; an Audit with its findings."""
        tracked = self._tracked.get((cls, key))
        if tracked is not None:
            if cls in (Document, Audit):
                self.refresh(tracked)
            return tracked
        if cls is Document:
            docs = self.documents(ids=[key], children=True)
            return docs[0] if docs else None
        if cls is Audit:
            audits = self.audits(ids=[key], findings=True)
            return audits[0] if audits else None
        if cls is Finding:
            found = self.findings(ids=[key])
            return found[0] if found else None
        if cls is Clause:
            found = self.clauses([key])
            return found[0] if found else None
        if cls is SyncState:
            rows = run("MATCH (s:SyncState {key: $key}) RETURN s", key=key)
            return self._track(_load(SyncState, rows[0]["s"])) if rows else None
        raise TypeError(cls)

    def documents(self, *, ids=None, status: str | None = None, contract_type: str | None = None, children: bool = False) -> list[Document]:
        rows = run("MATCH (c:Contract) WHERE ($ids IS NULL OR c.id IN $ids) AND ($status IS NULL OR c.status = $status) "
                   "AND ($ct IS NULL OR c.contract_type = $ct) RETURN c ORDER BY c.id",
                   ids=list(ids) if ids is not None else None, status=status, ct=contract_type)
        docs = [self._track(_load(Document, r["c"])) for r in rows]
        if children:
            for d in docs:
                self.refresh(d)
        return docs

    def document_by_sha(self, sha256: str) -> Document | None:
        rows = run("MATCH (c:Contract {sha256: $sha}) RETURN c", sha=sha256)
        return self._track(_load(Document, rows[0]["c"])) if rows else None

    def document_counts(self) -> dict[int, tuple[int, int]]:
        """document id -> (clauses, name mentions)."""
        rows = run("MATCH (c:Contract) RETURN c.id AS id, size([(c)-[:HAS_CLAUSE]->() | 1]) AS clauses, size([(c)-[:MENTIONS]->() | 1]) AS mentions")
        return {r["id"]: (r["clauses"], r["mentions"]) for r in rows}

    def known_shas(self) -> set[str]:
        return {r["sha"] for r in run("MATCH (c:Contract) RETURN c.sha256 AS sha")}

    def contract_types(self, status: str = "ready") -> list[str]:
        return sorted(r["t"] for r in run("MATCH (c:Contract {status: $status}) RETURN DISTINCT c.contract_type AS t", status=status))

    def pages(self, document_id: int) -> list[Page]:
        return [_load(Page, r["p"]) for r in run("MATCH (:Contract {id: $id})-[:HAS_PAGE]->(p) RETURN p ORDER BY p.page_no", id=document_id)]

    def _clauses_of(self, document_id: int) -> list[Clause]:
        return [_load(Clause, r["k"]) for r in run("MATCH (:Contract {id: $id})-[:HAS_CLAUSE]->(k) RETURN k ORDER BY k.ordinal", id=document_id)]

    def _mentions_of(self, document_id: int) -> list[Entity]:
        return [_load(Entity, {**r["m"], "document_id": document_id})
                for r in run("MATCH (:Contract {id: $id})-[m:MENTIONS]->() RETURN properties(m) AS m ORDER BY m.page_no, m.name", id=document_id)]

    def clauses(self, ids) -> list[Clause]:
        return [_load(Clause, r["k"]) for r in run("MATCH (k:Clause) WHERE k.id IN $ids RETURN k", ids=list(ids))]

    def mentions(self, kinds: list[str]) -> list[Entity]:
        """Every mention of the given kinds across all contracts."""
        return [_load(Entity, {**r["m"], "document_id": r["id"]})
                for r in run("MATCH (c:Contract)-[m:MENTIONS]->() WHERE m.kind IN $kinds RETURN c.id AS id, properties(m) AS m", kinds=kinds)]

    def audits(self, *, ids=None, status: str | None = None, findings: bool = False, newest_first: bool = False) -> list[Audit]:
        rows = run("MATCH (a:Audit) WHERE ($ids IS NULL OR a.id IN $ids) AND ($status IS NULL OR a.status = $status) RETURN a ORDER BY a.id",
                   ids=list(ids) if ids is not None else None, status=status)
        audits = [self._track(_load(Audit, r["a"])) for r in rows]
        if findings:
            for a in audits:
                self.refresh(a)
        return list(reversed(audits)) if newest_first else audits

    def findings(self, *, ids=None, audit_id: int | None = None, document_id: int | None = None, class_key: str | None = None,
                 review_status: str | None = None, review_status_in: tuple | None = None, exclude_verdict: str | None = None,
                 order: str = "id", limit: int | None = None, audit: Audit | None = None) -> list[Finding]:
        """Findings with their contract (light) and audit (light); order: id | id_desc | reviewed_at | reviewed_at_desc."""
        by = {"id": "f.id", "id_desc": "f.id DESC", "reviewed_at": "f.reviewed_at, f.id", "reviewed_at_desc": "f.reviewed_at DESC, f.id DESC"}[order]
        rows = run("MATCH (a:Audit)-[:HAS_FINDING]->(f:Finding)-[:ON]->(c:Contract) "
                   "WHERE ($ids IS NULL OR f.id IN $ids) AND ($audit IS NULL OR a.id = $audit) AND ($doc IS NULL OR c.id = $doc) "
                   "AND ($ck IS NULL OR f.class_key = $ck) AND ($rs IS NULL OR f.review_status = $rs) "
                   "AND ($rsi IS NULL OR f.review_status IN $rsi) AND ($xv IS NULL OR f.verdict <> $xv) "
                   f"RETURN f, a, c ORDER BY {by}" + (" LIMIT $limit" if limit else ""),
                   ids=list(ids) if ids is not None else None, audit=audit_id, doc=document_id, ck=class_key, rs=review_status,
                   rsi=list(review_status_in) if review_status_in else None, xv=exclude_verdict, limit=limit)
        out = []
        for r in rows:
            f = _load(Finding, r["f"])
            f.document = _load(Document, r["c"])
            f.audit = audit if audit is not None and audit.id == r["a"]["id"] else _load(Audit, r["a"])
            t = self._track(f)
            if t is not f:  # already tracked (e.g. just added): keep its state, give it the links it may lack
                t.document, t.audit = t.document or f.document, t.audit or f.audit
            out.append(t)
        return out

    def finding_status_counts(self, class_key: str) -> dict[str, int]:
        return {r["s"]: r["n"] for r in run("MATCH (f:Finding {class_key: $ck}) RETURN f.review_status AS s, count(*) AS n", ck=class_key)}

    def class_keys(self) -> list[str]:
        return sorted(r["k"] for r in run("MATCH (f:Finding) WHERE f.class_key <> '' RETURN DISTINCT f.class_key AS k"))

    def decisions(self, *, class_key: str | None = None, sha256: str | None = None, item_key: str | None = None) -> list[Decision]:
        rows = run("MATCH (d:Decision) WHERE ($ck IS NULL OR d.class_key = $ck) AND ($sha IS NULL OR d.sha256 = $sha) "
                   "AND ($item IS NULL OR d.item_key = $item) RETURN d ORDER BY d.id", ck=class_key, sha=sha256, item=item_key)
        return [_load(Decision, r["d"]) for r in rows]

    def audit_log(self, limit: int = 200) -> list[AuditLog]:
        return [_load(AuditLog, r["l"]) for r in run("MATCH (l:AuditLog) RETURN l ORDER BY l.id DESC LIMIT $n", n=limit)]

    def delete_log(self, target_type: str, target_id: int, action: str) -> None:
        run("MATCH (l:AuditLog {target_type: $t, target_id: $id, action: $a}) DELETE l", t=target_type, id=target_id, a=action)

    def stored(self, idempotency_key: str) -> StoredContract | None:
        rows = run("MATCH (s:StoredContract {idempotency_key: $k}) RETURN s", k=idempotency_key)
        return _load(StoredContract, rows[0]["s"]) if rows else None

    def stored_all(self) -> list[StoredContract]:
        return [_load(StoredContract, r["s"]) for r in run("MATCH (s:StoredContract) RETURN s ORDER BY s.id DESC")]


SessionLocal = Store  # `with SessionLocal() as session:` - the name the jobs and tests use


def get_session() -> Iterator[Store]:
    with Store() as session:
        yield session
