"""The adaptive review rate is a pure function of the team's decisions."""

from app import policy


def test_full_review_until_enough_agreeing_decisions():
    assert policy.review_rate([]) == 1.0
    assert policy.review_rate(["approved"] * 9) == 1.0
    assert policy.review_rate(["approved"] * 10) == 0.2
    assert policy.review_rate(["approved"] * 30) == 0.1


def test_one_rejection_resets_to_full_review_and_agreement_floor_holds():
    assert policy.review_rate(["approved"] * 30 + ["rejected"]) == 1.0
    assert policy.review_rate(["approved"] * 30 + ["rejected"] + ["approved"] * 10) == 0.2  # recovers tier by tier
    assert policy.review_rate(["approved"] * 10 + ["rejected"] * 2 + ["approved"] * 10) == 1.0  # agreement 0.91


def test_class_key_groups_by_question_not_contract():
    assert policy.class_key("missing_clause", {"clause_type": "liability_cap", "contract_type": "nda"}) == "missing_clause:liability_cap"
    assert policy.class_key("rename", {}) == policy.class_key("rename", {"language": "de"}) == "rename:registry"
    a = policy.class_key("missing_passage", {"passage": "Each Party shall comply."})
    assert a == policy.class_key("missing_passage", {"passage": "  each party SHALL comply. "})
    assert a != policy.class_key("missing_passage", {"passage": "Something else."})


def test_spot_check_is_deterministic_and_roughly_at_rate():
    picks = [policy._spot_check(7, f"sha{i:03d}", 0.2) for i in range(500)]
    assert picks == [policy._spot_check(7, f"sha{i:03d}", 0.2) for i in range(500)]
    assert 60 < sum(picks) < 140
