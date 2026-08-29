"""What the system does with the team's decisions is a pure function of what is on record (the lookups are faked, no DB)."""

from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest

from app import learning

OPEN = {"status": "open", "note": "", "edited_text": "", "carried_over": False, "decided_at": None, "actor": ""}


def item(key, verified=True, class_key="missing:nda:confidentiality"):
    return {"key": key, "class_key": class_key, "verified": verified}


@pytest.fixture
def on_record(monkeypatch):
    """What the lookups would find: the class's review rate, the spot-check sample, earlier decisions per item key."""
    state = {"rate": 1.0, "spot": False, "previous": {}}
    monkeypatch.setattr(learning, "rate", lambda session, key: state["rate"])
    monkeypatch.setattr(learning, "_spot", lambda sha256, key, r: state["spot"])
    monkeypatch.setattr(learning, "previous", lambda session, sha256, key: state["previous"].get(key))
    return state


def test_class_key_groups_renames_together_and_missing_clauses_by_contract_type():
    assert learning.class_key("old_name", "nda") == learning.class_key("old_name", "merchant_agreement", "x") == "rename"
    assert learning.class_key("missing_clause", "nda", "confidentiality") == "missing:nda:confidentiality"
    assert learning.class_key("missing_clause", "dpa", "confidentiality") != learning.class_key("missing_clause", "nda", "confidentiality")


def test_unverified_findings_and_untrusted_classes_always_need_a_person(on_record):
    on_record["rate"] = 0.2
    items = [item("clause:confidentiality", verified=False)]
    learning.apply(None, NS(sha256="s"), items)
    assert items[0]["review"] == OPEN and items[0]["policy"] == {"kind": "required", "review_rate": 0.2}

    on_record["rate"] = 1.0
    items = [item("clause:confidentiality")]
    learning.apply(None, NS(sha256="s"), items)
    assert items[0]["review"] == OPEN and items[0]["policy"] == {"kind": "required", "review_rate": 1.0}


def test_trusted_class_is_accepted_automatically_with_at_least_one_spot_check(on_record):
    on_record["rate"] = 0.2
    items = [item("clause:term_termination"), item("clause:confidentiality"), item("name:1:afs", class_key="rename")]
    learning.apply(None, NS(sha256="s"), items)
    by_key = {it["key"]: it for it in items}
    for key in ("clause:term_termination", "name:1:afs"):
        assert by_key[key]["review"]["status"] == "auto" and by_key[key]["review"]["actor"] == "system" and by_key[key]["review"]["decided_at"]
        assert by_key[key]["policy"] == {"kind": "auto", "review_rate": 0.2}
    minimum = by_key["clause:confidentiality"]  # nothing was sampled: the lowest key gets the contract's one human look
    assert minimum["review"] == OPEN and minimum["policy"] == {"kind": "spot_check", "review_rate": 0.2, "minimum": True}

    on_record["spot"] = True
    items = [item("clause:term_termination"), item("clause:confidentiality")]
    learning.apply(None, NS(sha256="s"), items)
    assert [it["review"] for it in items] == [OPEN, OPEN]
    assert [it["policy"] for it in items] == [{"kind": "spot_check", "review_rate": 0.2}] * 2


def test_an_earlier_decision_on_the_same_file_is_carried_over(on_record):
    on_record["rate"] = 0.2
    on_record["previous"]["clause:confidentiality"] = NS(decision="accepted", note="Passt.", edited_text="§ 9 Geheimhaltung\n\nText.",
                                                         created_at=datetime(2026, 8, 1, 10, tzinfo=timezone.utc), actor="anna")
    items = [item("clause:confidentiality"), item("clause:term_termination")]
    learning.apply(None, NS(sha256="s"), items)
    assert items[0]["review"] == {"status": "accepted", "note": "Passt.", "edited_text": "§ 9 Geheimhaltung\n\nText.", "carried_over": True,
                                  "decided_at": "2026-08-01T10:00:00+00:00", "actor": "anna"}
    assert items[0]["policy"] == {"kind": "carried_over", "review_rate": 0.2}
    assert items[1]["policy"]["kind"] == "spot_check" and items[1]["policy"]["minimum"]  # a carried-over item is not a spot check
