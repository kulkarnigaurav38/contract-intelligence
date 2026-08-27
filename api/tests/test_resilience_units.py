"""Provider weather must not fail documents: retry transient errors, then degrade to the deterministic core."""

import pytest

from app import llm


def test_with_retry_backs_off_on_transient_errors_then_succeeds(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise RuntimeError("503 UNAVAILABLE. This model is currently experiencing high demand.")
        return "ok"

    assert llm.with_retry(flaky, "classify") == "ok" and len(calls) == 3


def test_with_retry_gives_up_loudly_and_raises_non_transient_immediately(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    calls = []

    def down():
        calls.append(1)
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    with pytest.raises(llm.ModelUnavailable):
        llm.with_retry(down, "verify", attempts=4)
    assert len(calls) == 4

    for msg in ("Server disconnected without sending a response.", "502 Bad Gateway", "Connection reset by peer", "DeadlineExceeded"):
        assert llm.TRANSIENT.search(msg), msg  # network weather, retried

    def bug():
        raise ValueError("schema mismatch")

    with pytest.raises(ValueError):
        llm.with_retry(bug, "verify")


def test_stages_degrade_instead_of_failing(monkeypatch):
    """With a provider that is 'up' but failing, every model stage returns its fallback value."""
    from app.audits import verify as v
    from app.ingest import classify, entities, screen, segment
    from app.config import settings

    class Down:
        def with_structured_output(self, _schema):
            return self

        def invoke(self, _messages):
            raise RuntimeError("503 UNAVAILABLE high demand")

    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    monkeypatch.setattr(settings, "gemini_api_key", "x")
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    for module in (classify, entities, screen, v):
        monkeypatch.setattr(module, "chat", lambda task: Down())
    segs = segment.segment([(1, "1. Governing Law\nThis Agreement is governed by the laws of Germany.")])
    labels = classify.classify(segs)
    assert labels[0]["method"] == "rules" and labels[0]["clause_type"] == "governing_law"
    assert entities.llm_meta("any") is None
    assert screen.screen("plain contract text") == (False, "")
    assert v.verify([(1, "text")], "claim") is None
