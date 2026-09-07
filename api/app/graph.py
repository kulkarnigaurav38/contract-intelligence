"""The knowledge side of the graph: what the guideline demands, who the parties are, and what the models get to read.

The store (app/db.py) writes contracts, clauses and name mentions as nodes and edges; this module adds the backbone -
(ContractType)-[:REQUIRES]->(ClauseType) from the corporate guideline, the name register as Entity nodes with
(old)-[:RENAMED_TO]->(current) edges seeded from GLEIF, the public LEI register (CC0), which records
'Arvato Payment Solutions GmbH' as the previous legal name of Riverty GmbH - and the retrieval on top: a vector
index and a full-text index over the clauses, the guideline gap as one graph pattern, and the context builders that
give the verifier the contract's outline plus the relevant clauses instead of the whole text, and the drafter the
neighbouring clauses plus the wording the team accepted before.
"""

import json
import logging
import re
from functools import lru_cache

import httpx

from app.config import settings
from app.db import GraphUnavailable, run
from app.ingest.classify import KEYWORDS, STRUCTURAL, TAXONOMY
from app.ingest.embed import embed_query
from app.ingest.entities import REGISTRY, normalize

log = logging.getLogger("contracts.graph")
RRF_K = 60
STOP = {"which", "what", "does", "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "clause",
        "welche", "welcher", "und", "der", "die", "das", "den", "dem", "ein", "eine", "ist", "sind", "mit", "für", "klausel"}
CLAUSE_CHARS = 3000  # a clause longer than this is cut in the verifier's context
OUTLINE_LINES = 200

# GLEIF Level-1 facts (api.gleif.org, 2026-09-05): legal name, LEI, previous legal name. The same records come back
# from sync_gleif(); this copy makes the seed work offline.
GLEIF = [
    ("5299000OGZU8QU22ZH28", "Riverty GmbH", "Arvato Payment Solutions GmbH"),
    ("529900G05F6Z5CZ1CI89", "Riverty Group GmbH", "arvato infoscore GmbH"),
    ("5967007LIEEXZX6G2G21", "Riverty Norway AS", "Arvato Finance AS"),
    ("5299006YWZO87P0D2244", "Riverty Sweden AB", "arvato Finance AB"),
    ("529900W1DCQ03L4Y3932", "Riverty Group Sweden AB", "arvato Holding AB"),
    ("89450085BKPB2A2XZE44", "Riverty Bank S.A.", "RM Luxembourg S.A."),
    ("8945009VD3SPI4I93D64", "Riverty Finland Oy", ""),
    ("894500QH905T4IDKEH85", "Riverty Services Netherlands B.V.", ""),
]
GLEIF_URL = "https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=Riverty&page[size]=50"


# ---------------------------------------------------------------- schema + seed (idempotent)
def ensure_schema() -> None:
    run("CREATE VECTOR INDEX clause_embedding IF NOT EXISTS FOR (c:Clause) ON c.embedding "
        f"OPTIONS {{indexConfig: {{`vector.dimensions`: {settings.embedding_dim}, `vector.similarity_function`: 'cosine'}}}}")
    run("CREATE FULLTEXT INDEX clause_text IF NOT EXISTS FOR (c:Clause) ON EACH [c.heading, c.text]")
    seed()


def seed() -> None:
    """Clause types, contract types with the guideline's REQUIRES edges, and the name registry (built-in + GLEIF)."""
    from app.audits.graph import LABELS  # lazy: audits.graph -> retrieval -> graph

    run("UNWIND $rows AS r MERGE (t:ClauseType {key: r.key}) SET t.label = r.label, t.keywords = r.keywords, t.structural = r.structural",
        rows=[{"key": k, "label": LABELS.get(k, k.replace("_", " ")), "keywords": KEYWORDS.get(k, []), "structural": k in STRUCTURAL}
              for k in TAXONOMY + STRUCTURAL])
    g = json.loads((settings.data_dir / "guidelines.json").read_text())
    star = g.get("*", [])
    types = {k: sorted(set(star) | set(v)) for k, v in g.items() if not k.startswith("_") and k != "*"}
    types.setdefault("other", sorted(star))
    types.setdefault("unknown", sorted(star))
    run("MATCH (:ContractType)-[r:REQUIRES]->() DELETE r")
    run("UNWIND $rows AS r MERGE (t:ContractType {key: r.key}) WITH t, r UNWIND r.required AS ct "
        "MATCH (c:ClauseType {key: ct}) MERGE (t)-[:REQUIRES]->(c)",
        rows=[{"key": k, "required": v} for k, v in types.items()])
    run("MATCH (c:Contract) MERGE (t:ContractType {key: c.contract_type}) MERGE (c)-[:OF_TYPE]->(t) "
        "WITH t MATCH (s:ClauseType) WHERE s.key IN $star MERGE (t)-[:REQUIRES]->(s)", star=star)
    run("UNWIND $rows AS r MERGE (e:Entity {key: r.key}) SET e.name = r.name, e.kind = r.kind, e.source = 'registry'",
        rows=[{"key": normalize(n), "name": n, "kind": k} for n, k, _ in REGISTRY])
    _merge_gleif([{"lei": lei, "name": name, "previous": [p] if p else []} for lei, name, p in GLEIF])


def link_type(doc_id: int, contract_type: str) -> None:
    """(Contract)-[:OF_TYPE]->(ContractType), the '*' requirements included - called once a contract is read."""
    run("MATCH (c:Contract {id: $id}) OPTIONAL MATCH (c)-[old:OF_TYPE]->() DELETE old "
        "WITH DISTINCT c MERGE (t:ContractType {key: $ct}) MERGE (c)-[:OF_TYPE]->(t) "
        "WITH t MATCH (s:ClauseType) WHERE s.key IN $star MERGE (t)-[:REQUIRES]->(s)",
        id=doc_id, ct=contract_type, star=json.loads((settings.data_dir / "guidelines.json").read_text()).get("*", []))


def _merge_gleif(records: list[dict]) -> None:
    run("UNWIND $rows AS r "
        "MERGE (n:Entity {key: r.key}) SET n.name = r.name, n.kind = 'our_entity_current', n.lei = r.lei, n.source = 'GLEIF' "
        "WITH n, r UNWIND r.previous AS p "
        "MERGE (o:Entity {key: p.key}) SET o.name = p.name, o.kind = 'our_entity_old', o.source = 'GLEIF' "
        "MERGE (o)-[:RENAMED_TO {lei: r.lei, source: 'GLEIF'}]->(n)",
        rows=[{"lei": r["lei"], "name": r["name"], "key": normalize(r["name"]),
               "previous": [{"name": p, "key": normalize(p)} for p in r["previous"]]} for r in records])


def sync_gleif() -> list[dict]:
    """Refresh the registry from the live LEI register: every 'Riverty' legal name and its previous legal names."""
    data = httpx.get(GLEIF_URL, timeout=30).raise_for_status().json()
    records = []
    for rec in data.get("data", []):
        ent = rec["attributes"]["entity"]
        records.append({"lei": rec["attributes"]["lei"], "name": ent["legalName"]["name"],
                        "previous": [o["name"] for o in ent.get("otherNames", []) if o.get("type") == "PREVIOUS_LEGAL_NAME"]})
    _merge_gleif(records)
    return records


def registry() -> list[tuple[str, str]]:
    """(name, kind) of every registry entity in the graph - the rule layer's name list, database-first."""
    return [(r["name"], r["kind"]) for r in run("MATCH (e:Entity) WHERE e.source IN ['registry', 'GLEIF'] RETURN e.name AS name, e.kind AS kind")]


def successor(name: str) -> str | None:
    """The current legal name behind an old one, from the register's RENAMED_TO edge."""
    rows = run("MATCH (o:Entity)-[:RENAMED_TO]->(n:Entity) WHERE toLower(o.name) = toLower($name) RETURN n.name AS name LIMIT 1", name=name)
    return rows[0]["name"] if rows else None


# ---------------------------------------------------------------- retrieval
@lru_cache(maxsize=256)
def _vector(query: str) -> tuple[float, ...]:
    return tuple(embed_query(query))


def _tokens(query: str) -> list[str]:
    return [t for t in dict.fromkeys(re.findall(r"[\wäöüß]{3,}", query.lower())) if t not in STOP]


def _fuse(*rankings: list[int]) -> dict[int, float]:
    scores: dict[int, float] = {}
    for ranking in rankings:
        for r, cid in enumerate(ranking, start=1):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + r)
    return scores


def hybrid_search(query: str, k: int = 8, document_ids: list[int] | None = None) -> list[tuple[int, float]]:
    """(clause_id, RRF score) over the vector index and the full-text index, optionally within some contracts."""
    n = 200 if document_ids else 25  # the SEARCH clause (Cypher 25) ranks corpus-wide; a scope is filtered afterwards
    vec = run("MATCH (k:Clause) SEARCH k IN (VECTOR INDEX clause_embedding FOR $v LIMIT $n) SCORE AS score "
              "WHERE $ids IS NULL OR k.document_id IN $ids RETURN k.id AS id ORDER BY score DESC LIMIT 25",
              n=n, v=list(_vector(query)), ids=document_ids)
    lucene = " OR ".join(_tokens(query)) or "___"
    txt = run("CALL db.index.fulltext.queryNodes('clause_text', $q, {limit: $n}) YIELD node, score "
              "WHERE $ids IS NULL OR node.document_id IN $ids RETURN node.id AS id ORDER BY score DESC LIMIT 25",
              q=lucene, n=n, ids=document_ids)
    scores = _fuse([r["id"] for r in vec], [r["id"] for r in txt])
    return sorted(scores.items(), key=lambda kv: -kv[1])[:k]


def best_match_per_document(query: str) -> dict[int, tuple[int, float]]:
    """document_id -> (clause_id, cosine similarity of the closest clause); exact, one query."""
    rows = run("MATCH (k:Clause) WHERE k.embedding IS NOT NULL "
               "WITH k, vector.similarity.cosine(k.embedding, $v) AS sim ORDER BY sim DESC "
               "WITH k.document_id AS d, collect({id: k.id, sim: sim})[0] AS best "
               "RETURN d AS document_id, best.id AS id, best.sim AS sim", v=list(_vector(query)))
    return {r["document_id"]: (r["id"], float(r["sim"])) for r in rows}


def gaps() -> list[dict]:
    """The guideline question as one graph pattern: required clause types no clause of the contract is typed as."""
    return run("MATCH (c:Contract {status: 'ready'})-[:OF_TYPE]->(:ContractType)-[:REQUIRES]->(t:ClauseType) "
               "WHERE NOT EXISTS { (c)-[:HAS_CLAUSE]->(:Clause)-[:IS_A]->(t) } "
               "RETURN c.id AS document_id, c.title AS title, c.filename AS filename, c.contract_type AS contract_type, "
               "t.key AS clause_type ORDER BY c.id, t.key")


def stats() -> dict:
    nodes = {r["label"]: r["n"] for r in run("MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS n")}
    edges = {r["type"]: r["n"] for r in run("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n")}
    return {"nodes": nodes, "relationships": edges}


# ---------------------------------------------------------------- what the models get to read
def _clauses_of(doc_id: int, query: str) -> list[dict]:
    return run("MATCH (:Contract {id: $id})-[:HAS_CLAUSE]->(k) "
               "RETURN k.id AS id, k.ordinal AS ordinal, k.page_no AS page_no, k.heading AS heading, k.clause_type AS clause_type, "
               "k.text AS text, CASE WHEN k.embedding IS NULL THEN 0.0 ELSE vector.similarity.cosine(k.embedding, $v) END AS sim "
               "ORDER BY k.ordinal", id=doc_id, v=list(_vector(query)))


def _outline(clauses: list[dict]) -> str:
    from app.audits.graph import LABELS

    lines = []
    for c in clauses[:OUTLINE_LINES]:
        head = c["heading"] or " ".join(c["text"].split())[:60]
        lines.append(f"{c['ordinal']}. {head} — {LABELS.get(c['clause_type'], c['clause_type'])} (p. {c['page_no']})")
    return "\n".join(lines)


def _block(c: dict) -> tuple[int, str]:
    text = c["text"] if len(c["text"]) <= CLAUSE_CHARS else c["text"][:CLAUSE_CHARS] + " […]"
    return c["page_no"], f"{c['heading']}\n{text}".strip()


def type_query(clause_type: str) -> str:
    from app.audits.graph import LABELS

    return f"{LABELS.get(clause_type, clause_type)} clause: " + ", ".join(KEYWORDS.get(clause_type, []))


def context(doc_id: int, query: str, k: int = 6, types: tuple[str, ...] = (), names: tuple[str, ...] = ()) -> list[tuple[int, str]]:
    """What the verifier reads first instead of the whole contract: the outline (page 0) and the relevant clauses.

    Relevant = the top-k by vector similarity fused with a lexical rank on the query's words, plus every clause already
    labelled with one of `types`, plus (for names) every clause mentioning one of them together with the preamble and
    the signature blocks - the places a party is defined."""
    clauses = _clauses_of(doc_id, query)
    if not clauses:
        raise GraphUnavailable(f"contract {doc_id} has no clauses in the graph")
    tokens = _tokens(query)
    by_vec = sorted(clauses, key=lambda c: -c["sim"])
    by_lex = sorted(clauses, key=lambda c: -sum((3 if t in (c["heading"] or "").lower() else 0) + (t in c["text"].lower()) for t in tokens))
    scores = _fuse([c["id"] for c in by_vec], [c["id"] for c in by_lex])
    chosen = {cid for cid, _ in sorted(scores.items(), key=lambda kv: -kv[1])[:k]}
    chosen |= {c["id"] for c in clauses if c["clause_type"] in types}
    if names:
        low = [n.lower() for n in names]
        chosen |= {c["id"] for c in clauses if any(n in c["text"].lower() for n in low)
                   or c["ordinal"] == 0 or c["clause_type"] == "signature"}
    return [(0, _outline(clauses))] + [_block(c) for c in clauses if c["id"] in chosen]


def draft_context(doc_id: int, clause_type: str, contract_type: str, partial_quote: str = "") -> tuple[list[tuple[int, str]], list[str]]:
    """What the drafter reads: outline, the preamble (parties, defined terms), the clauses around the insertion point
    (numbering and register), the narrower clause when amending - and the wording the team accepted for this clause
    type in contracts of the same type."""
    clauses = _clauses_of(doc_id, type_query(clause_type))
    if not clauses:
        raise GraphUnavailable(f"contract {doc_id} has no clauses in the graph")
    body = [c for c in clauses if c["clause_type"] not in ("signature", "preamble", "other")]
    chosen = {c["id"] for c in clauses if c["ordinal"] == 0} | {c["id"] for c in body[-3:]}
    if partial_quote:
        probe = " ".join(partial_quote.split())[:60].lower()
        chosen |= {c["id"] for c in clauses if probe and probe in " ".join(c["text"].split()).lower()}
    precedents = [r["text"] for r in run(
        "MATCH (d:Decision)-[:ABOUT]->(:ClauseType {key: $ct})-[:REQUIRES*0..0]-() WHERE d.decision = 'accepted' AND d.edited_text <> '' "
        "AND EXISTS { (d)-[:ON]->(:Contract {contract_type: $type}) } RETURN d.edited_text AS text ORDER BY d.id DESC LIMIT 2",
        ct=clause_type, type=contract_type)]
    return [(0, _outline(clauses))] + [_block(c) for c in clauses if c["id"] in chosen], precedents


def verify_context(session, doc_id: int, query: str, types: tuple[str, ...] = (), names: tuple[str, ...] = ()) -> list[tuple[int, str]]:
    """The graph's selection; the whole contract when the contract has no clauses in the graph."""
    try:
        return context(doc_id, query, types=types, names=names)
    except GraphUnavailable:
        return full_text(session, doc_id)


def full_text(session, doc_id: int) -> list[tuple[int, str]]:
    return [(p.page_no, p.text) for p in session.pages(doc_id)]
