"""Engine tests for the demo numbers in IMPLEMENTATION.md §2.

Uses the fixture policy and card so these run without the LLM.
"""

import json
from pathlib import Path

from app import engine
from app.schemas import CardBenefits, Cited, TrackedPurchase

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"

tracked = TrackedPurchase.model_validate(
    json.loads((FIXTURES / "purchases.json").read_text(encoding="utf-8"))[0]
)
PURCHASE, POLICY = tracked.purchase, tracked.policy
CARD = CardBenefits.model_validate(
    json.loads((FIXTURES / "card-benefits.json").read_text(encoding="utf-8"))
)

# Price observed on each visited day (store schedule: 140 / 110 from d3 / 95 from d20).
FULL_WALK = {0: 140.0, 3: 110.0, 20: 95.0, 28: 95.0}


def history_until(day: int, walk=FULL_WALK) -> dict[int, float]:
    return {d: p for d, p in walk.items() if d <= day}


def run(day, claims=(), walk=FULL_WALK):
    return engine.alerts(PURCHASE, POLICY, CARD, day, history_until(day, walk), list(claims))


def kinds(alerts):
    return [a.kind for a in alerts if a.kind != "card_protection"]


def test_day0_timeline_has_four_windows():
    tl = engine.timeline(PURCHASE, POLICY, CARD, 0, [])
    assert [(w.label.split(" (")[0], w.opens_day, w.closes_day) for w in tl] == [
        ("Price match", 0, 14),
        ("Return", 0, 30),
        ("Manufacturer warranty", 0, 365),
        ("Card extended warranty", 365, 730),
    ]
    assert kinds(run(0)) == []


def test_day3_price_drop_is_claimable():
    [a] = [a for a in run(3) if a.kind == "price_drop_claimable"]
    assert a.title == "Price dropped $30"
    assert "Clause 4.2" in a.body and "11 days left" in a.body and "about $29" in a.body
    assert a.money.refund == 30.0
    assert a.money.points_reversed == 90
    assert a.money.net_estimate == 29.10
    assert a.action == "prepare_claim"
    assert a.citations[0].clause == "4.2"


def test_claim_filed_hides_offer_and_marks_timeline():
    assert kinds(run(3, claims=["price_match"])) == []
    tl = engine.timeline(PURCHASE, POLICY, CARD, 3, ["price_match"])
    assert tl[0].status == "claimed"


def test_day14_last_day_then_window_closes():
    walk = {0: 140.0, 3: 110.0, 14: 110.0, 15: 110.0}
    [a] = [a for a in run(14, walk=walk) if a.kind == "price_drop_claimable"]
    assert "0 days left" in a.body
    assert kinds(run(15, walk=walk)) == []  # no new drop after the window: quiet


def test_day20_drop_outside_window_is_declined():
    [a] = [a for a in run(20) if a.kind.startswith("price_drop")]
    assert a.kind == "price_drop_declined"
    assert a.action is None
    assert "$95" in a.body and "$45" in a.body and "Clause 4.2" in a.body
    assert a.citations[0].clause == "4.2"


def test_day20_declined_even_if_presenter_skips_day3():
    [a] = [a for a in run(20, walk={0: 140.0, 20: 95.0}) if a.kind.startswith("price_drop")]
    assert a.kind == "price_drop_declined"


def test_day28_return_warning_ignores_pending_claim():
    [a] = [a for a in run(28, claims=["price_match"]) if a.kind == "window_closing"]
    assert a.title == "Return window closes in 2 days"
    assert a.money.refund == 140.0
    assert a.money.points_reversed == 420
    assert "before pending price adjustment" in a.body


def test_day30_closes_today_day31_gone():
    walk = {0: 140.0, 30: 95.0, 31: 95.0}
    assert [a.title for a in run(30, walk=walk) if a.kind == "window_closing"] == [
        "Return window closes today"
    ]
    assert [a for a in run(31, walk=walk) if a.kind == "window_closing"] == []


def test_store_without_price_match_declines():
    policy = POLICY.model_copy(deep=True)
    policy.price_match.allowed = Cited()
    policy.price_match.window_days = Cited()
    [a] = engine.alerts(PURCHASE, policy, CARD, 3, {3: 110.0}, [])[:1]
    assert a.kind == "price_drop_declined"
    assert "no price adjustment clause" in a.body


def test_card_protection_flagged_and_hedged():
    [a] = [a for a in run(0) if a.kind == "card_protection"]
    assert "may extend" in a.body and "Confirm with your issuer" in a.body


def test_card_not_applied_to_other_cards_purchases():
    assert engine.card_for(PURCHASE, CARD, "9021") is None
    assert engine.card_for(PURCHASE, CARD, "4417") is CARD


def test_threshold_reversal_rule():
    card = CARD.model_copy(deep=True)
    card.reversal_rule = Cited(value="threshold")
    card.reversal_threshold_dollars = Cited(value=50.0)
    assert engine.points_reversed(30, 140, card) == 0
    assert engine.points_reversed(140, 140, card) == 420
