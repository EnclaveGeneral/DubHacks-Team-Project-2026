"""Seeded demo purchases from two fictional stores besides Ridgeline.

Fjord & Pine Outdoor Co. and Hearthside Home have a written policy in /content
but no store pages, so the BackPocket website has more than one store to show.
The policies below are written by hand (no LLM call, so seeding works offline)
and every quote is read from the policy file, so it can't drift from the text.

Purchase days are negative, so at demo day 0 each item is in a different state:

  Summit tent        price dropped inside the 15-day window -> claimable
  Trail backpack     adjustment window closed, return open   -> return and rebuy
  Fleece             price adjustment already filed          -> waiting on the store
  Dinner set         store offers no price adjustments       -> return and rebuy
  Duvet cover        returns closed, warranty only           -> nothing to do

Prices for these SKUs follow the demo clock through store-server's schedule.
"""

import re
from functools import lru_cache

from . import cards, tracking
from .schemas import Cited, MerchantPolicy, PriceMatch, Purchase, TrackedPurchase

CARD_LAST4 = "4417"  # the demo card; the engine only applies the selected card to its own purchases


@lru_cache
def _clauses(filename: str) -> dict[str, str]:
    """Clause number -> sentence, from a /content policy file."""
    out: dict[str, str] = {}
    for line in (cards.CONTENT_DIR / filename).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(\d+\.\d+)\s+(.*\S)\s*$", line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _cited(filename: str, clause: str, value) -> Cited:
    return Cited(value=value, quote=_clauses(filename)[clause], clause=clause, confidence="high")


FJORD_FILE = "fjord-pine-policy.md"
HEARTH_FILE = "hearthside-policy.md"


def fjord_pine_policy() -> MerchantPolicy:
    f = FJORD_FILE
    return MerchantPolicy(
        merchant="Fjord & Pine Outdoor Co.",
        source_url="https://fjordpine.example/policy",
        return_window_days=_cited(f, "3.1", 45),
        exchange_window_days=Cited(),
        price_match=PriceMatch(
            allowed=_cited(f, "4.2", True),
            window_days=_cited(f, "4.2", 15),
            conditions=[
                _cited(f, "4.3", "Identical item, same size and color, offered by Fjord & Pine Outdoor Co."),
                _cited(f, "4.4", "Final Sale items and typographical errors are not eligible"),
            ],
        ),
        manufacturer_warranty_months=_cited(f, "5.1", 24),
        claim_form_url="",
        how_to_request=_cited(f, "4.5", "chat online or email help@fjordpine.example"),
    )


def hearthside_policy() -> MerchantPolicy:
    f = HEARTH_FILE
    return MerchantPolicy(
        merchant="Hearthside Home",
        source_url="https://hearthside.example/policy",
        return_window_days=_cited(f, "3.1", 30),
        exchange_window_days=Cited(),
        price_match=PriceMatch(allowed=_cited(f, "4.1", False), window_days=Cited(), conditions=[]),
        manufacturer_warranty_months=_cited(f, "5.1", 12),
        claim_form_url="",
        how_to_request=_cited(f, "6.1", "phone 1-800-555-0177 or email help@hearthside.example"),
    )


def _tracked(
    policy: MerchantPolicy,
    order_id: str,
    sku: str,
    item: str,
    paid: float,
    day: int,
    history: dict[int, float],
    claims: list[str] | None = None,
) -> TrackedPurchase:
    return TrackedPurchase(
        purchase=Purchase(
            order_id=order_id,
            merchant=policy.merchant,
            sku=sku,
            item_name=item,
            price_paid=paid,
            card_last4=CARD_LAST4,
            purchase_day=day,
            policy_url=policy.source_url,
            claim_form_url="",
        ),
        policy=policy,
        timeline=[],
        lowest_seen=min(history.values()),
        price_history=history,
        claims_filed=claims or [],
    )


def seeded_purchases() -> list[TrackedPurchase]:
    fjord, hearth = fjord_pine_policy(), hearthside_policy()
    return [
        _tracked(fjord, "FP-20931", "FP-TENT-249", "Summit 2P Tent", 249.00, -9, {-9: 249.00, -4: 219.00}),
        _tracked(fjord, "FP-20877", "FP-PACK-129", "Alder Trail Backpack", 129.00, -20, {-20: 129.00, -8: 99.00}),
        _tracked(
            fjord, "FP-20812", "FP-FLEECE-89", "Fjord Fleece Jacket", 89.00, -12,
            {-12: 89.00, -6: 69.00}, claims=["price_match"],
        ),
        _tracked(hearth, "HS-55102", "HS-DINNER-120", "Stoneware Dinner Set", 120.00, -12, {-12: 120.00, -5: 95.00}),
        _tracked(hearth, "HS-54310", "HS-DUVET-89", "Linen Duvet Cover", 89.00, -50, {-50: 89.00}),
    ]


def seed(day: int) -> list[TrackedPurchase]:
    """Insert (or restore to their starting state) the seeded purchases."""
    with tracking.lock:
        return [tracking.refresh(tp, day) for tp in seeded_purchases()]
