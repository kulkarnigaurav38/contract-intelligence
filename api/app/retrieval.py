"""Hybrid retrieval over clauses: pgvector similarity + Postgres full-text, fused with RRF."""

import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ingest.embed import embed_query
from app.models import Clause

RRF_K = 60
STOP = {"which", "what", "does", "the", "and", "for", "with", "that", "this", "from", "have", "has", "are",
        "welche", "welcher", "und", "der", "die", "das", "den", "dem", "ein", "eine", "ist", "sind", "mit", "für"}


def _vec(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


def _tsquery(query: str) -> str:
    """OR the meaningful tokens so a natural question still ranks partial matches."""
    tokens = [t for t in re.findall(r"[\wäöüß]{3,}", query.lower()) if t not in STOP]
    return " | ".join(dict.fromkeys(tokens)) or "___"


def hybrid_search(session: Session, query: str, k: int = 8) -> list[tuple[Clause, float]]:
    sql = text("""
        WITH v AS (
            SELECT id, row_number() OVER (ORDER BY embedding <=> CAST(:q AS vector)) AS r
            FROM clauses ORDER BY embedding <=> CAST(:q AS vector) LIMIT 25),
        f AS (
            SELECT id, row_number() OVER (ORDER BY ts_rank(tsv, q.q) DESC) AS r
            FROM clauses, (SELECT to_tsquery('english', :t) || to_tsquery('german', :t) AS q) q
            WHERE tsv @@ q.q LIMIT 25)
        SELECT COALESCE(v.id, f.id) AS id,
               COALESCE(1.0 / (:rrf + v.r), 0) + COALESCE(1.0 / (:rrf + f.r), 0) AS score
        FROM v FULL OUTER JOIN f ON v.id = f.id ORDER BY score DESC LIMIT :k
    """)
    rows = session.execute(sql, {"q": _vec(embed_query(query)), "t": _tsquery(query), "rrf": RRF_K, "k": k}).all()
    clauses = {c.id: c for c in session.query(Clause).filter(Clause.id.in_([r.id for r in rows]))}
    return [(clauses[r.id], float(r.score)) for r in rows if r.id in clauses]


def best_match_per_document(session: Session, query: str) -> dict[int, tuple[int, float]]:
    """document_id -> (clause_id, cosine similarity of the closest clause)."""
    sql = text("""
        SELECT DISTINCT ON (document_id) document_id, id, 1 - (embedding <=> CAST(:q AS vector)) AS sim
        FROM clauses ORDER BY document_id, embedding <=> CAST(:q AS vector)
    """)
    rows = session.execute(sql, {"q": _vec(embed_query(query))}).all()
    return {r.document_id: (r.id, float(r.sim)) for r in rows}
