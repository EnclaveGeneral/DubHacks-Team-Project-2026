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


def test_day14_last_day_then_rebuy_takes_over():
    walk = {0: 140.0, 3: 110.0, 14: 110.0, 15: 110.0}
    [a] = [a for a in run(14, walk=walk) if a.kind == "price_drop_claimable"]
    assert "0 days left" in a.body
    # Day 15: adjustment window closed, unclaimed, return window open -> rebuy.
    [b] = [a for a in run(15, walk=walk) if a.kind != "card_protection"]
    assert b.kind == "return_rebuy" and b.title == "Save $30 by returning and rebuying"


def test_day20_offers_return_and_rebuy_not_a_dead_end():
    [a] = [a for a in run(20) if a.kind != "card_protection"]
    assert a.kind == "return_rebuy"
    assert a.action == "prepare_return"
    assert a.title == "Save $45 by returning and rebuying"
    # Why no adjustment, and the return clause it relies on.
    assert "isn't available anymore: clause 4.2" in a.body
    assert "10 days left" in a.body and "$95" in a.body and "$140 refund" in a.body
    assert [c.clause for c in a.citations][:2] == ["3.1", "4.2"]
    # Points: lose 420 on the refund, earn 285 on the rebuy -> net 135 lost.
    assert (a.money.refund, a.money.points_reversed, a.money.net_estimate) == (45.0, 135, 43.65)


def test_day20_rebuy_even_if_presenter_skips_day3():
    [a] = [a for a in run(20, walk={0: 140.0, 20: 95.0}) if a.kind != "card_protection"]
    assert a.kind == "return_rebuy"


def test_rebuy_after_claim_counts_the_pending_adjustment():
    [a] = [a for a in run(20, claims=["price_match"]) if a.kind != "card_protection"]
    assert a.title == "Save $15 by returning and rebuying"
    assert "$110 refund" in a.body and "pending $30 price adjustment" in a.body
    assert (a.money.refund, a.money.points_reversed) == (15.0, 45)


def test_day28_rebuy_carries_the_deadline_no_duplicate_warning():
    found = [a for a in run(28, claims=["price_match"]) if a.kind != "card_protection"]
    assert [a.kind for a in found] == ["return_rebuy"]
    assert "2 days left" in found[0].body


def test_return_warning_when_price_is_not_lower():
    walk = {0: 140.0, 27: 140.0, 28: 140.0, 30: 140.0}
    [a] = [a for a in run(28, walk=walk) if a.kind != "card_protection"]
    assert a.kind == "window_closing" and a.title == "Return window closes in 2 days"
    assert (a.money.refund, a.money.points_reversed) == (140.0, 420)
    assert a.action == "prepare_return"
    assert [a.title for a in run(30, walk=walk) if a.kind == "window_closing"] == [
        "Return window closes today"
    ]


def test_nothing_actionable_means_no_alert():
    walk = {0: 140.0, 31: 95.0}
    assert kinds(run(31, walk=walk)) == []


def test_return_requested_stops_return_offers():
    assert kinds(run(20, claims=["price_match", "return"])) == []
    tl = engine.timeline(PURCHASE, POLICY, CARD, 20, ["price_match", "return"])
    assert [w.status for w in tl if w.label == "Return"] == ["claimed"]


def test_store_without_price_match_offers_rebuy():
    policy = POLICY.model_copy(deep=True)
    policy.price_match.allowed = Cited()
    policy.price_match.window_days = Cited()
    [a] = engine.alerts(PURCHASE, policy, CARD, 3, {3: 110.0}, [])[:1]
    assert a.kind == "return_rebuy"
    assert "doesn't offer price adjustments" in a.body


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


def test_returns_with_no_time_limit_keep_rebuy_open():
    policy = POLICY.model_copy(deep=True)
    policy.return_window_days = Cited()
    policy.returns_unlimited = Cited(value=True, quote="There are no time limits for returns.")
    [a] = [a for a in engine.alerts(PURCHASE, policy, CARD, 60, {0: 140.0, 60: 95.0}, [])
           if a.kind != "card_protection"]
    assert a.kind == "return_rebuy" and "Returns have no time limit." in a.body
    assert a.citations[0].quote == "There are no time limits for returns."
    tl = engine.timeline(PURCHASE, policy, CARD, 60, [])
    [ret] = [w for w in tl if w.label == "Return"]
    assert ret.open_ended and ret.status == "open"
    # Never a "closing" warning.
    assert not [a for a in engine.alerts(PURCHASE, policy, CARD, 400, {0: 140.0}, [])
                if a.kind == "window_closing"]


def test_any_drop_below_paid_is_actionable_today_not_just_new_lows():
    # 140 paid; drops to 120, back up to 150, then 130 (not a new low, still below paid).
    walk = {0: 140.0, 2: 120.0, 4: 150.0, 6: 130.0}
    [a] = [a for a in run(2, walk=walk) if a.kind == "price_drop_claimable"]
    assert a.title == "Price dropped $20"
    assert kinds(run(4, walk=walk)) == []  # price back above what was paid: nothing to claim
    [b] = [a for a in run(6, walk=walk) if a.kind == "price_drop_claimable"]
    assert b.title == "Price dropped $10" and b.money.refund == 10.0
