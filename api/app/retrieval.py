"""Hybrid retrieval over clauses: the graph's vector index + full-text index, fused with RRF (app/graph.py)."""

from app import graph
from app.db import Store
from app.models import Clause


def hybrid_search(session: Store, query: str, k: int = 8, document_ids: list[int] | None = None) -> list[tuple[Clause, float]]:
    """Top-k clauses by RRF over vector + full-text rank; optionally restricted to the given documents."""
    hits = graph.hybrid_search(query, k, document_ids)
    clauses = {c.id: c for c in session.clauses([cid for cid, _ in hits])}
    return [(clauses[cid], score) for cid, score in hits if cid in clauses]


def best_match_per_document(session: Store, query: str) -> dict[int, tuple[int, float]]:
    """document_id -> (clause_id, cosine similarity of the closest clause)."""
    return graph.best_match_per_document(query)
