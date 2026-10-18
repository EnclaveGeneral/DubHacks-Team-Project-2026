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
        status = "claimed" if "return" in claims_filed else _status(rel, 0, w)
        windows.append(TimelineWindow(
            label="Return", source="merchant", opens_day=d0, closes_day=d0 + w,
            status=status, citation=policy.return_window_days,
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


def price_on(day: int, price_paid: float, price_history: dict[int, float]) -> float:
    """Latest observed price on or before `day` (the paid price if none)."""
    seen = [d for d in price_history if d <= day]
    return price_history[max(seen)] if seen else price_paid


def effective_paid(purchase: Purchase, policy: MerchantPolicy, price_history: dict[int, float],
                   claims_filed: list[str]) -> float:
    """What the shopper will have paid if a filed price adjustment is approved:
    the lowest price seen inside the price-match window."""
    w = policy.price_match.window_days.value
    if "price_match" not in claims_filed or w is None:
        return purchase.price_paid
    d0 = purchase.purchase_day
    in_window = [v for d, v in price_history.items() if d0 <= d <= d0 + w]
    return min([purchase.price_paid, *in_window])


def rebuy_money(refund: float, current: float, price_paid: float, card: CardBenefits | None) -> Money:
    """Return for `refund`, buy again at `current`. Points: lose what the refund
    reverses, earn points on the new purchase."""
    savings = refund - current
    if card is None or card.earn_rate_points_per_dollar.value is None:
        return Money(refund=round(savings, 2), points_reversed=0, net_estimate=round(savings, 2))
    earned = round(current * card.earn_rate_points_per_dollar.value)
    lost = points_reversed(refund, price_paid, card) - earned
    cents = card.point_value_cents.value or 0
    return Money(refund=round(savings, 2), points_reversed=lost,
                 net_estimate=round(savings - lost * cents / 100, 2))


def _days(n: int) -> str:
    return f"{n} day{'s' if n != 1 else ''}"


def _clause(c: Cited, start: bool = True) -> str:
    if c.clause:
        return f"Clause {c.clause}" if start else f"clause {c.clause}"
    return "The store's policy" if start else "the store's policy"


def _adjustment_alert(purchase, policy, card, day, price_history, claims_filed) -> Alert | None:
    """A price adjustment the shopper can request right now, if any."""
    pm = policy.price_match
    window = pm.window_days.value
    if not pm.allowed.value or window is None or "price_match" in claims_filed:
        return None
    rel_now = day - purchase.purchase_day
    if rel_now > window:
        return None
    events = [(d, p) for d, p in drop_events(purchase.price_paid, price_history)
              if d <= day and d - purchase.purchase_day <= window]
    if not events:
        return None
    event_day, price = events[-1]
    drop = purchase.price_paid - price
    m = money(drop, purchase.price_paid, card)
    return Alert(
        id=f"pm-{purchase.order_id}-d{event_day}", purchase_id=purchase.order_id,
        kind="price_drop_claimable", title=f"Price dropped {_money_line(drop)}",
        body=(
            f"{_clause(pm.window_days)} allows a price match within {window} days; "
            f"{_days(window - rel_now)} left. Net after points reversal: about "
            f"{_money_line(round(m.net_estimate))} (estimate)."
        ),
        money=m, citations=[pm.window_days, *_points_citation(card)],
        action="prepare_claim", created_day=event_day,
    )


def _rebuy_alert(purchase, policy, card, day, price_history, claims_filed) -> Alert | None:
    """When a price adjustment isn't available but the return window is open
    and the price is lower: return the item and buy it again."""
    rw = policy.return_window_days.value
    if rw is None or "return" in claims_filed:
        return None
    left = purchase.purchase_day + rw - day
    if left < 0:
        return None
    paid_now = effective_paid(purchase, policy, price_history, claims_filed)
    current = price_on(day, purchase.price_paid, price_history)
    if current >= paid_now - 0.005:
        return None

    pm = policy.price_match
    window = pm.window_days.value
    if "price_match" in claims_filed:
        why_not = "You've already used your one price adjustment, and the price has dropped again."
        why_cites = [pm.window_days] if pm.window_days.quote else []
    elif pm.allowed.value and window is not None:
        why_not = (
            f"A price adjustment isn't available anymore: {_clause(pm.window_days, start=False)} "
            f"allows one only within {window} days of purchase."
        )
        why_cites = [pm.window_days]
    elif pm.allowed.value is False:
        why_not = "This store doesn't offer price adjustments."
        why_cites = [pm.allowed] if pm.allowed.quote else []
    else:
        why_not = "This store's policy doesn't offer price adjustments."
        why_cites = []

    m = rebuy_money(paid_now, current, purchase.price_paid, card)
    pending = (
        f" This assumes your pending {_money_line(purchase.price_paid - paid_now)} price adjustment is approved."
        if paid_now < purchase.price_paid else ""
    )
    return Alert(
        id=f"rebuy-{purchase.order_id}-p{current:g}", purchase_id=purchase.order_id,
        kind="return_rebuy",
        title=f"Save {_money_line(m.refund)} by returning and rebuying",
        body=(
            f"{why_not} The return window is still open "
            f"({'it closes today' if left == 0 else _days(left) + ' left'}). Buy it again at "
            f"{_money_line(current)}, then return the original for a {_money_line(paid_now)} refund."
            f"{pending} Check that the new order isn't marked Final Sale."
        ),
        money=m,
        citations=[policy.return_window_days, *why_cites, *_points_citation(card)],
        action="prepare_return", created_day=day,
    )


# ---------- Window warnings + card protections ----------


def _return_alert(purchase, policy, card, day, price_history, claims_filed) -> list[Alert]:
    w = policy.return_window_days.value
    if w is None or "return" in claims_filed:
        return []
    left = purchase.purchase_day + w - day
    if not 0 <= left <= CLOSING_SOON_DAYS:
        return []
    refund = effective_paid(purchase, policy, price_history, claims_filed)
    m = money(refund, purchase.price_paid, card)
    pending = (
        f" (if your pending {_money_line(purchase.price_paid - refund)} price adjustment is approved)"
        if refund < purchase.price_paid else ""
    )
    when = "today" if left == 0 else f"in {_days(left)}"
    points = f" and reverses about {m.points_reversed} points" if m.points_reversed else ""
    return [Alert(
        id=f"ret-{purchase.order_id}", purchase_id=purchase.order_id, kind="window_closing",
        title=f"Return window closes {when}",
        body=f"Returning refunds {_money_line(refund)}{pending}{points}. The decision is yours.",
        money=m, citations=[policy.return_window_days, *_points_citation(card)],
        action="prepare_return", created_day=day,
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
    """Only what the shopper can act on now, most valuable first. A price drop
    the shopper can't act on produces no alert."""
    out: list[Alert] = []
    adjust = _adjustment_alert(purchase, policy, card, day, price_history, claims_filed)
    rebuy = None if adjust else _rebuy_alert(purchase, policy, card, day, price_history, claims_filed)
    out += [a for a in (adjust, rebuy) if a]
    if not rebuy:  # the rebuy card already carries the return deadline
        out += _return_alert(purchase, policy, card, day, price_history, claims_filed)
    out += _card_alerts(purchase, policy, card)
    return out


def card_for(purchase: Purchase, card: CardBenefits | None, card_last4: str | None) -> CardBenefits | None:
    """Only apply the selected card to purchases made with it."""
    if card is None or card_last4 != purchase.card_last4:
        return None
    return card
