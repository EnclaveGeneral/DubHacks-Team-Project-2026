"""Deterministic rules: deadlines, price watch, points. No LLM here.

evaluate() is a pure function of the purchase, the extracted terms, the
current day, and the prices observed so far. IMPLEMENTATION.md §5.4.

Filed claims are pending: they never change later refund or points numbers.
"""

from .schemas import (
    Alert,
    CardBenefits,
    Cited,
    MerchantPolicy,
    Money,
    Purchase,
    TimelineWindow,
)

CLOSING_SOON_DAYS = 3


def _days_from_months(months: int) -> int:
    return round(months * 365 / 12)


def _money_line(paid_or_refund: float) -> str:
    return f"${paid_or_refund:,.0f}" if paid_or_refund == int(paid_or_refund) else f"${paid_or_refund:,.2f}"


# ---------- Points ----------


def points_reversed(refund: float, price_paid: float, card: CardBenefits | None) -> int:
    if card is None or card.earn_rate_points_per_dollar.value is None:
        return 0
    rate = card.earn_rate_points_per_dollar.value
    rule = card.reversal_rule.value
    if rule == "none":
        return 0
    if rule == "full":
        return round(price_paid * rate)
    if rule == "threshold":
        threshold = card.reversal_threshold_dollars.value or 0
        if refund < threshold:
            return 0
    return round(refund * rate)


def money(refund: float, price_paid: float, card: CardBenefits | None) -> Money:
    pts = points_reversed(refund, price_paid, card)
    cents = (card.point_value_cents.value if card else None) or 0
    return Money(
        refund=round(refund, 2),
        points_reversed=pts,
        net_estimate=round(refund - pts * cents / 100, 2),
    )


def _points_citation(card: CardBenefits | None) -> list[Cited]:
    if card is None or card.reversal_rule.quote is None:
        return []
    return [card.reversal_rule]


# ---------- Timeline ----------


def _status(day: int, opens: int, closes: int) -> str:
    if day > closes:
        return "closed"
    if closes - day <= CLOSING_SOON_DAYS and day >= opens:
        return "closing_soon"
    return "open"


def timeline(
    purchase: Purchase,
    policy: MerchantPolicy,
    card: CardBenefits | None,
    day: int,
    claims_filed: list[str],
) -> list[TimelineWindow]:
    d0 = purchase.purchase_day
    rel = day - d0
    windows: list[TimelineWindow] = []

    pm = policy.price_match
    if pm.allowed.value and pm.window_days.value is not None:
        w = pm.window_days.value
        status = "claimed" if "price_match" in claims_filed else _status(rel, 0, w)
        windows.append(TimelineWindow(
            label="Price match", source="merchant", opens_day=d0, closes_day=d0 + w,
            status=status, citation=pm.window_days,
        ))

    if policy.return_window_days.value is not None:
        w = policy.return_window_days.value
        windows.append(TimelineWindow(
            label="Return", source="merchant", opens_day=d0, closes_day=d0 + w,
            status=_status(rel, 0, w), citation=policy.return_window_days,
        ))

    mfr_months = policy.manufacturer_warranty_months.value
    if mfr_months is not None:
        w = _days_from_months(mfr_months)
        windows.append(TimelineWindow(
            label="Manufacturer warranty", source="merchant", opens_day=d0,
            closes_day=d0 + w, status=_status(rel, 0, w), long_term=True,
            citation=policy.manufacturer_warranty_months,
        ))

    for p in card.protections if card else []:
        if p.type == "extended_warranty" and mfr_months is not None and p.extends_months.value:
            max_orig = p.max_original_warranty_months.value
            if max_orig is not None and mfr_months > max_orig:
                continue
            start = _days_from_months(mfr_months)
            end = start + _days_from_months(p.extends_months.value)
            windows.append(TimelineWindow(
                label="Card extended warranty (may cover; confirm with your issuer)",
                source="card", opens_day=d0 + start, closes_day=d0 + end,
                status=_status(rel, start, end), long_term=True, citation=p.extends_months,
            ))
        elif p.type == "return_protection" and p.window_days.value:
            w = p.window_days.value
            windows.append(TimelineWindow(
                label="Card return protection (may cover; confirm with your issuer)",
                source="card", opens_day=d0, closes_day=d0 + w,
                status=_status(rel, 0, w), long_term=w > 31, citation=p.window_days,
            ))
    return windows


# ---------- Price watch ----------


def drop_events(price_paid: float, price_history: dict[int, float]) -> list[tuple[int, float]]:
    """Days on which the observed price fell below every earlier price."""
    events = []
    lowest = price_paid
    for d in sorted(price_history):
        if price_history[d] < lowest - 0.005:
            lowest = price_history[d]
            events.append((d, lowest))
    return events


def _price_alerts(purchase, policy, card, day, price_history, claims_filed) -> list[Alert]:
    events = [(d, p) for d, p in drop_events(purchase.price_paid, price_history) if d <= day]
    if not events:
        return []
    event_day, price = events[-1]
    rel_event = event_day - purchase.purchase_day
    rel_now = day - purchase.purchase_day
    drop = purchase.price_paid - price
    pm = policy.price_match
    window = pm.window_days.value
    oid = purchase.order_id

    in_window = pm.allowed.value and window is not None and rel_event <= window
    if in_window:
        if "price_match" in claims_filed or rel_now > window:
            return []
        left = window - rel_now
        m = money(drop, purchase.price_paid, card)
        clause = f"Clause {pm.window_days.clause}" if pm.window_days.clause else "The store's policy"
        return [Alert(
            id=f"pm-{oid}-d{event_day}", purchase_id=oid, kind="price_drop_claimable",
            title=f"Price dropped {_money_line(drop)}",
            body=(
                f"{clause} allows a price match within {window} days; "
                f"{left} day{'s' if left != 1 else ''} left. "
                f"Net after points reversal: about {_money_line(round(m.net_estimate))} (estimate)."
            ),
            money=m, citations=[pm.window_days, *_points_citation(card)],
            action="prepare_claim", created_day=event_day,
        )]

    # Not claimable: outside the window, or no price-match clause at all.
    if pm.allowed.value and window is not None:
        clause = f"Clause {pm.window_days.clause}" if pm.window_days.clause else "The store's policy"
        reason = (
            f"{clause} allows price adjustments only within {window} days of purchase, "
            f"and that window closed on day {purchase.purchase_day + window}."
        )
        citations = [pm.window_days]
    elif pm.allowed.value is False:
        reason = "The store's policy says it does not adjust prices after purchase."
        citations = [pm.allowed]
    else:
        reason = "The store's policy has no price adjustment clause."
        citations = []
    return [Alert(
        id=f"pm-{oid}-d{event_day}", purchase_id=oid, kind="price_drop_declined",
        title="Price dropped, but no claim is available",
        body=(
            f"The {purchase.item_name} is now {_money_line(price)}, "
            f"{_money_line(drop)} below what you paid. {reason} BackPocket won't prepare a form."
        ),
        money=None, citations=citations, action=None, created_day=event_day,
    )]


# ---------- Window warnings + card protections ----------


def _return_alert(purchase, policy, card, day, claims_filed) -> list[Alert]:
    w = policy.return_window_days.value
    if w is None:
        return []
    left = purchase.purchase_day + w - day
    if not 0 <= left <= CLOSING_SOON_DAYS:
        return []
    m = money(purchase.price_paid, purchase.price_paid, card)
    pending = " (before pending price adjustment)" if claims_filed else ""
    when = "today" if left == 0 else f"in {left} day{'s' if left != 1 else ''}"
    points = f" and reverses about {m.points_reversed} points" if m.points_reversed else ""
    return [Alert(
        id=f"ret-{purchase.order_id}", purchase_id=purchase.order_id, kind="window_closing",
        title=f"Return window closes {when}",
        body=f"Returning refunds {_money_line(purchase.price_paid)}{points}{pending}. The decision is yours.",
        money=m, citations=[policy.return_window_days, *_points_citation(card)],
        action=None, created_day=day,
    )]


def _card_alerts(purchase, policy, card) -> list[Alert]:
    if card is None:
        return []
    alerts = []
    mfr = policy.manufacturer_warranty_months.value
    for p in card.protections:
        if p.type == "extended_warranty" and mfr is not None and p.extends_months.value:
            max_orig = p.max_original_warranty_months.value
            if max_orig is not None and mfr > max_orig:
                continue
            body = (
                f"Your {card.display_name} may extend the {mfr}-month manufacturer warranty "
                f"by {p.extends_months.value} months. Confirm with your issuer."
            )
            cite = p.extends_months
        elif p.type == "return_protection" and p.window_days.value:
            limit = f" up to {_money_line(p.max_amount_dollars.value)}" if p.max_amount_dollars.value else ""
            body = (
                f"If the store won't take a return, your {card.display_name} may refund you"
                f"{limit} within {p.window_days.value} days of purchase. Confirm with your issuer."
            )
            cite = p.window_days
        else:
            continue
        alerts.append(Alert(
            id=f"card-{purchase.order_id}-{p.type}", purchase_id=purchase.order_id,
            kind="card_protection", title="Your card may protect this purchase",
            body=body, citations=[cite], action=None, created_day=purchase.purchase_day,
        ))
    return alerts


def alerts(
    purchase: Purchase,
    policy: MerchantPolicy,
    card: CardBenefits | None,
    day: int,
    price_history: dict[int, float],
    claims_filed: list[str],
) -> list[Alert]:
    """Current alerts, most urgent first."""
    return [
        *_return_alert(purchase, policy, card, day, claims_filed),
        *_price_alerts(purchase, policy, card, day, price_history, claims_filed),
        *_card_alerts(purchase, policy, card),
    ]


def card_for(purchase: Purchase, card: CardBenefits | None, card_last4: str | None) -> CardBenefits | None:
    """Only apply the selected card to purchases made with it."""
    if card is None or card_last4 != purchase.card_last4:
        return None
    return card
