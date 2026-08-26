"""Embeddings: Gemini when configured, a deterministic hashed bag-of-words otherwise.

The offline vector is crude, but it keeps the pgvector path exercised end to
end without a key; full-text search carries most of the retrieval weight
offline anyway.
"""

import hashlib
import math
import re

from app.config import settings
from app.llm import embeddings

TOKEN_RE = re.compile(r"[a-zäöüß0-9]{3,}")


def _hashed(text: str) -> list[float]:
    vec = [0.0] * settings.embedding_dim
    for tok in TOKEN_RE.findall(text.lower()):
        idx = int.from_bytes(hashlib.md5(tok.encode()).digest()[:4], "little") % settings.embedding_dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed_documents(texts: list[str]) -> list[list[float]]:
    model = embeddings("RETRIEVAL_DOCUMENT")
    if model is None:
        return [_hashed(t) for t in texts]
    return model.embed_documents(texts)


def embed_query(text: str) -> list[float]:
    model = embeddings("RETRIEVAL_QUERY")
    if model is None:
        return _hashed(text)
    return model.embed_query(text)
