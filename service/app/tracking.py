"""Purchases persistence and evaluation against the current day."""

import threading

import httpx

from . import clock, db, engine
from .schemas import Alert, SelectedCard, TrackedPurchase

# FastAPI runs sync routes on a thread pool, and the side panel polls every 2 s.
# Every load-modify-save of a purchase holds this lock so a poll can't
# overwrite a claim that was marked filed in between.
lock = threading.RLock()


def selected_card() -> SelectedCard | None:
    data = db.get_state("selected_card_benefits")
    return SelectedCard.model_validate(data) if data else None


def save_selected_card(card: SelectedCard) -> None:
    db.set_state("selected_card", card.card_id)
    db.set_state("selected_card_benefits", card.model_dump())


def load_all() -> list[TrackedPurchase]:
    with db.connect() as conn:
        rows = conn.execute("SELECT data FROM purchases ORDER BY rowid").fetchall()
    return [TrackedPurchase.model_validate_json(r["data"]) for r in rows]


def load(order_id: str) -> TrackedPurchase | None:
    with db.connect() as conn:
        row = conn.execute("SELECT data FROM purchases WHERE order_id = ?", (order_id,)).fetchone()
    return TrackedPurchase.model_validate_json(row["data"]) if row else None


def save(tp: TrackedPurchase) -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO purchases (order_id, data) VALUES (?, ?) "
            "ON CONFLICT(order_id) DO UPDATE SET data = excluded.data",
            (tp.purchase.order_id, tp.model_dump_json()),
        )


def _store_price(sku: str) -> tuple[int, float] | None:
    """(store's day, price). Keyed by the store's own day so a poll that races
    a clock change can't file today's price under yesterday."""
    try:
        r = clock.http.get(f"{clock.store_server_url()}/price/{sku}")
        r.raise_for_status()
        body = r.json()
        return int(body["day"]), float(body["price"])
    except (httpx.HTTPError, KeyError, ValueError):
        return None


def _card_for(tp: TrackedPurchase):
    sel = selected_card()
    return engine.card_for(tp.purchase, sel.benefits if sel else None, sel.last4 if sel else None)


def refresh(tp: TrackedPurchase, day: int) -> TrackedPurchase:
    """Record today's store price and recompute the timeline."""
    observed = _store_price(tp.purchase.sku)
    if observed is not None:
        store_day, price = observed
        if store_day >= tp.purchase.purchase_day:
            tp.price_history[store_day] = price
            tp.lowest_seen = min(tp.lowest_seen, price)
    tp.timeline = engine.timeline(tp.purchase, tp.policy, _card_for(tp), day, tp.claims_filed)
    save(tp)
    return tp


def refresh_all(day: int) -> list[TrackedPurchase]:
    with lock:
        return [refresh(tp, day) for tp in load_all()]


def mark_claim_filed(order_id: str, claim_type: str, day: int) -> TrackedPurchase | None:
    with lock:
        tp = load(order_id)
        if tp is None:
            return None
        if claim_type not in tp.claims_filed:
            tp.claims_filed.append(claim_type)
        return refresh(tp, day)


def report_price(order_id: str, price: float, day: int) -> TrackedPurchase | None:
    with lock:
        tp = load(order_id)
        if tp is None:
            return None
        tp.price_history[day] = round(price, 2)
        tp.lowest_seen = min(tp.lowest_seen, price)
        return refresh(tp, day)


def alerts_for(tp: TrackedPurchase, day: int) -> list[Alert]:
    return engine.alerts(
        tp.purchase, tp.policy, _card_for(tp), day, tp.price_history, tp.claims_filed
    )
