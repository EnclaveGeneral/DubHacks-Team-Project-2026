"""The seeded fictional-store purchases (service/app/demo_data.py) are valid,
quote only text that is in /content, and land in the states the website shows."""

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import demo_data, engine
from app.main import app
from app.schemas import CardBenefits, TrackedPurchase

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    re.sub(r"\s+", " ", p.read_text(encoding="utf-8")).strip() for p in (ROOT / "content").glob("*.md")
]
CARD = CardBenefits.model_validate(
    json.loads((ROOT / "shared" / "fixtures" / "card-benefits.json").read_text(encoding="utf-8"))
)


def _quotes(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "quote" and v is not None:
                yield v
            else:
                yield from _quotes(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _quotes(v)


def _alerts(tp: TrackedPurchase, day: int):
    return engine.alerts(tp.purchase, tp.policy, CARD, day, tp.price_history, tp.claims_filed)


def _by_order() -> dict[str, TrackedPurchase]:
    return {tp.purchase.order_id: tp for tp in demo_data.seeded_purchases()}


def test_seeded_quotes_are_verbatim():
    for tp in demo_data.seeded_purchases():
        for quote in _quotes(json.loads(tp.policy.model_dump_json())):
            assert any(re.sub(r"\s+", " ", quote).strip() in src for src in SOURCES), quote


def test_seeded_purchases_are_unique_and_use_the_demo_card():
    tps = demo_data.seeded_purchases()
    assert len({tp.purchase.order_id for tp in tps}) == len(tps) == 5
    assert {tp.purchase.card_last4 for tp in tps} == {"4417"}
    assert {tp.purchase.merchant for tp in tps} == {"Fjord & Pine Outdoor Co.", "Hearthside Home"}


@pytest.mark.parametrize(
    "order_id, day, kind",
    [
        ("FP-20931", 0, "price_drop_claimable"),  # dropped $30 on day -4, window closes day 6
        ("FP-20931", 8, "return_rebuy"),  # window closed, price fell to $199
        ("FP-20877", 0, "return_rebuy"),  # adjustment window closed, return open
        ("HS-55102", 0, "return_rebuy"),  # store offers no adjustments
        ("FP-20812", 10, "return_rebuy"),  # filed adjustment already used, price fell again
    ],
)
def test_seeded_items_have_the_expected_alert(order_id, day, kind):
    tp = _by_order()[order_id]
    # The store server's later prices arrive through the clock; replay them here.
    history = dict(tp.price_history)
    later = {"FP-20931": {8: 199.0}, "FP-20812": {10: 59.0}}.get(order_id, {})
    history.update(later)
    tp = tp.model_copy(update={"price_history": history})
    kinds = [a.kind for a in _alerts(tp, day) if a.kind != "card_protection"]
    assert kinds[0] == kind


def test_quiet_items_have_nothing_to_act_on():
    by_order = _by_order()
    for order_id in ("FP-20812", "HS-54310"):
        actionable = [a for a in _alerts(by_order[order_id], 0) if a.kind != "card_protection"]
        assert actionable == []


def test_hearthside_explains_why_there_is_no_adjustment():
    alert = _alerts(_by_order()["HS-55102"], 0)[0]
    assert "doesn't offer price adjustments" in alert.body
    assert alert.citations[0].clause == "3.1"


def test_seed_endpoints():
    with TestClient(app) as client:
        client.post("/demo/reset")
        assert client.get("/purchases").json() == []

        seeded = client.post("/demo/seed").json()
        assert [p["purchase"]["order_id"] for p in seeded] == [
            "FP-20931", "FP-20877", "FP-20812", "HS-55102", "HS-54310",
        ]
        assert all(p["timeline"] for p in seeded)

        one = client.get("/purchases/FP-20931").json()
        assert one["purchase"]["item_name"] == "Summit 2P Tent"
        assert client.get("/purchases/nope").status_code == 404

        # Reset with seeding gives the same list; a plain reset leaves it empty.
        client.post("/demo/reset", params={"seed": True})
        assert len(client.get("/purchases").json()) == 5
        client.post("/demo/reset")
        assert client.get("/purchases").json() == []
