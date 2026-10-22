"""
WHY THIS TEST EXISTS

The investments headline said 8.57 lakh crore "promised". 2,200 crore of it
was Lulu Group, which the same register marks cancelled, and 650 crore was two
stalled commitments. The number people quote was counting promises that the
record itself says are no longer promises.

These pin the rule: live commitments in the headline, withdrawn ones shown
beside it with their own amount, and the source shares computed on the same
set as the total, so the percentages describe the number they sit under.
"""
from app.services.mou_stats import MouRow, summarise


def row(status, tier="press", crore=100.0, jobs=10, foreign=False):
    return MouRow(status, tier, crore, jobs, foreign)


def test_cancelled_and_stalled_are_not_counted_as_promised():
    out = summarise([
        row("signed", crore=100), row("investment_started", crore=200),
        row("operational", "government", crore=50),
        row("cancelled", crore=2200), row("stalled", crore=650),
    ])
    assert out["total_investment_crore"] == 350
    assert out["total_mous"] == 3
    assert out["not_live"]["cancelled"] == {"mous": 1, "investment_crore": 2200}
    assert out["not_live"]["stalled"] == {"mous": 1, "investment_crore": 650}
    # Nothing vanishes: the whole register is still reconcilable.
    assert out["all_recorded"] == {"mous": 5, "investment_crore": 3200}


def test_jobs_and_foreign_count_follow_the_same_rule():
    out = summarise([
        row("signed", jobs=1000, foreign=True),
        row("cancelled", jobs=5000, foreign=True),
    ])
    assert out["total_expected_jobs"] == 1000
    assert out["foreign_investments"] == 1


def test_source_shares_describe_the_live_total_and_sum_to_100():
    out = summarise([
        row("signed", "press", 60), row("signed", "company", 30),
        row("operational", "government", 10), row("cancelled", "press", 1000),
    ])
    tiers = out["by_source_tier"]
    assert tiers["press"]["share_pct"] == 60.0
    assert tiers["company"]["share_pct"] == 30.0
    assert tiers["government"]["share_pct"] == 10.0
    assert round(sum(t["share_pct"] for t in tiers.values()), 1) == 100.0


def test_an_unknown_tier_is_reported_not_dropped():
    out = summarise([row("signed", None, 5), row("signed", "blog", 5)])
    assert out["by_source_tier"]["unlabelled"] == {"mous": 2, "investment_crore": 10, "share_pct": 100.0}


def test_empty_register_is_zero_not_a_division_error():
    out = summarise([])
    assert out["total_investment_crore"] == 0
    assert all(t["share_pct"] == 0.0 for t in out["by_source_tier"].values())


def test_missing_amount_counts_the_mou_but_not_a_figure():
    out = summarise([row("operational", "government", None), row("signed", crore=10)])
    assert out["total_mous"] == 2
    assert out["total_investment_crore"] == 10
