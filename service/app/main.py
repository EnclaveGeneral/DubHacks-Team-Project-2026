"""BackPocket service. Routes from IMPLEMENTATION.md section 4.

Add ?fresh=true to /purchases or /cards/{id}/select to skip the extraction cache.
"""

import logging
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import cards, clock, db, demo_data, extract, retailers, tracking
from .schemas import (
    Alert,
    CardCatalogEntry,
    ClaimFiled,
    ClockState,
    DraftRequest,
    DraftResponse,
    MerchantPolicy,
    NewPurchaseRequest,
    PanelState,
    ReadPolicyRequest,
    ReportPrice,
    SelectedCard,
    TrackedPurchase,
)

load_dotenv()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    yield


class QuietPolling(logging.Filter):
    """Keeps successful polling GETs out of uvicorn's access log, so the log
    shows actions (POSTs) and errors. Polling still happens as before."""

    def __init__(self, paths: tuple[str, ...]):
        super().__init__()
        self.paths = paths

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) < 5:
            return True
        method, path, status = args[1], str(args[2]), args[4]
        quiet = method == "GET" and isinstance(status, int) and status < 400
        return not (quiet and path.split("?")[0].startswith(self.paths))


logging.getLogger("uvicorn.access").addFilter(
    QuietPolling(("/health", "/state", "/clock", "/purchases", "/alerts", "/cards"))
)

app = FastAPI(title="BackPocket service", lifespan=lifespan)

# CORSMiddleware does not accept wildcards in allow_origins, so use a regex.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:(5173|5174))$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "llm_key_set": bool(os.environ.get("ANTHROPIC_API_KEY"))}


# ---------- Clock + demo (A) ----------


class SetDay(BaseModel):
    day: int


@app.get("/clock", response_model=ClockState)
def get_clock():
    return clock.get()


@app.post("/clock", response_model=ClockState)
def set_clock(body: SetDay):
    if body.day < 0:
        raise HTTPException(400, "day must be >= 0")
    return clock.set_day(body.day)


DEMO_CARD = "northwind-4417"


@app.post("/demo/reset", response_model=ClockState)
def demo_reset(seed: bool = False):
    """Wipe the demo. With ?seed=true, also add the fictional-store purchases
    (the extension's and website's Reset do this; the e2e scripts don't)."""
    # Under the purchase lock so an in-flight panel poll can't save a purchase
    # back after the wipe.
    with tracking.lock:
        db.reset()
    try:
        clock.http.post(f"{clock.store_server_url()}/admin/reset")
    except httpx.HTTPError:
        pass
    try:
        select_card(DEMO_CARD)  # cached extraction, so this is instant
    except HTTPException:
        pass  # no cache and no API key: shopper picks the card in the panel
    state = clock.set_day(0)
    if seed:
        demo_data.seed(state.day)
    return state


@app.post("/demo/seed", response_model=list[TrackedPurchase])
def demo_seed():
    """Add the fictional-store purchases (Fjord & Pine, Hearthside Home), or
    put them back to their starting state. Leaves other purchases alone."""
    return demo_data.seed(clock.get().day)


# ---------- Cards ----------


@app.get("/cards", response_model=list[CardCatalogEntry])
def list_cards():
    return cards.CATALOG


@app.get("/cards/selected", response_model=SelectedCard | None)
def get_selected_card():
    return tracking.selected_card()


@app.post("/cards/{card_id}/select", response_model=SelectedCard)
def select_card(card_id: str, fresh: bool = False):
    card = cards.find(card_id)
    if card is None:
        raise HTTPException(404, "unknown card")
    try:
        benefits = extract.card_benefits(
            cards.guide_text(card), card.card_id, card.display_name, fresh=fresh
        )
    except (extract.ExtractionError, anthropic.AnthropicError) as e:
        raise HTTPException(502, f"Couldn't read the benefits guide: {e}")
    selected = SelectedCard(card_id=card.card_id, last4=card.last4, benefits=benefits)
    tracking.save_selected_card(selected)
    return selected


# ---------- Purchases + alerts ----------


@app.post("/purchases", response_model=TrackedPurchase)
def add_purchase(body: NewPurchaseRequest, fresh: bool = False):
    stored = retailers.get(body.retailer_id) if body.retailer_id else None
    if body.retailer_id and not (stored and stored.get("policy")):
        raise HTTPException(404, f"no ingested policy for retailer {body.retailer_id!r}")
    if not stored and not body.policy_text.strip():
        raise HTTPException(400, "policy_text is empty")
    day = clock.get().day
    purchase = body.purchase if body.manual else body.purchase.model_copy(update={"purchase_day": day})
    with tracking.lock:
        existing = tracking.load(purchase.order_id)
        if existing and not fresh:
            return tracking.refresh(existing, day)
    if stored:
        policy = retailers.policy(stored).model_copy(update={"claim_form_url": purchase.claim_form_url})
    else:
        try:
            policy = extract.merchant_policy(
                body.policy_text, purchase.merchant, purchase.policy_url,
                purchase.claim_form_url, fresh=fresh,
            )
        except (extract.ExtractionError, anthropic.AnthropicError) as e:
            raise HTTPException(502, f"Couldn't read the store policy: {e}")
    tp = TrackedPurchase(
        purchase=purchase, policy=policy, timeline=[], lowest_seen=purchase.price_paid
    )
    with tracking.lock:
        return tracking.refresh(tp, day)


@app.post("/policies/read", response_model=MerchantPolicy)
def read_policy(body: ReadPolicyRequest, fresh: bool = False):
    """Terms for the store the shopper's tab is on. A major retailer we've
    ingested returns its full policy (merged from several pages) from any page
    on its site; any other store is read from the open page."""
    stored = retailers.find(body.url)
    if stored and stored.get("policy") and not fresh:
        return retailers.policy(stored)
    if len(body.text.strip()) < 200:
        raise HTTPException(400, "This page doesn't have enough text to be a policy.")
    try:
        return extract.merchant_policy(body.text, body.site_name, body.url, "", fresh=fresh)
    except (extract.ExtractionError, anthropic.AnthropicError) as e:
        raise HTTPException(502, f"Couldn't read this page's policy: {e}")


@app.get("/retailers")
def list_retailers():
    """Ingested retailers and how complete each one's policy is."""
    out = []
    for rec in retailers.all_records():
        pol = rec.get("policy") or {}
        pm = pol.get("price_match", {})
        out.append({
            "id": rec["id"],
            "name": rec["name"],
            "domains": rec["domains"],
            "ingested_at": rec.get("ingested_at"),
            "pages": [{k: p[k] for k in ("topic", "url", "status")} for p in rec["pages"]],
            "return_window_days": (pol.get("return_window_days") or {}).get("value"),
            "price_adjustment_days": (pm.get("window_days") or {}).get("value"),
            "price_adjustment_offered": (pm.get("allowed") or {}).get("value"),
        })
    return out


@app.post("/purchases/{order_id}/price", response_model=TrackedPurchase)
def report_price(order_id: str, body: ReportPrice):
    """A lower price the shopper saw (for stores BackPocket can't check itself)."""
    if body.price <= 0:
        raise HTTPException(400, "price must be positive")
    tp = tracking.report_price(order_id, body.price, clock.get().day)
    if tp is None:
        raise HTTPException(404, "unknown order")
    return tp


@app.get("/purchases", response_model=list[TrackedPurchase])
def list_purchases():
    return tracking.refresh_all(clock.get().day)


@app.get("/purchases/{order_id}", response_model=TrackedPurchase)
def get_purchase(order_id: str):
    with tracking.lock:
        tp = tracking.load(order_id)
        if tp is None:
            raise HTTPException(404, "unknown order")
        return tracking.refresh(tp, clock.get().day)


@app.get("/state", response_model=PanelState)
def panel_state():
    """One call for the side panel: refreshes each purchase once (one store
    price lookup each) and returns the clock, purchases, alerts, and card."""
    clk = clock.get()
    purchases = tracking.refresh_all(clk.day)
    alerts = [a for tp in purchases for a in tracking.alerts_for(tp, clk.day)]
    return PanelState(
        clock=clk, purchases=purchases, alerts=alerts, selected_card=tracking.selected_card()
    )


@app.get("/alerts", response_model=list[Alert])
def list_alerts():
    day = clock.get().day
    out: list[Alert] = []
    for tp in tracking.refresh_all(day):
        out.extend(tracking.alerts_for(tp, day))
    return out


@app.post("/claims/draft", response_model=DraftResponse)
def draft_claim(body: DraftRequest):
    # TODO(B, hours 12–15): 409 with reason if engine says no claim is supported
    raise HTTPException(501, "form drafter not implemented")


@app.post("/purchases/{order_id}/claims", response_model=TrackedPurchase)
def mark_claim_filed(order_id: str, body: ClaimFiled):
    tp = tracking.mark_claim_filed(order_id, body.claim_type, clock.get().day)
    if tp is None:
        raise HTTPException(404, "unknown order")
    return tp


# ---------- Website -> store form hand-off ----------
#
# The website's "Prepare claim form" opens the store's form with a single-use
# code in the URL; the extension fills the form only if the code redeems. CORS
# limits who can create codes to the website, the store, and the extension, so
# an arbitrary page linking to the form can't make the extension fill it.

HANDOFF_TTL_S = 300
_handoffs: dict[str, tuple[float, str, str]] = {}  # token -> (expires_at, order_id, alert_id)
_handoffs_lock = threading.Lock()


class HandoffRequest(BaseModel):
    order_id: str
    alert_id: str


@app.post("/handoffs")
def create_handoff(body: HandoffRequest):
    day = clock.get().day
    tp = tracking.load(body.order_id)
    if tp is None:
        raise HTTPException(404, "unknown order")
    if not any(a.id == body.alert_id and a.action for a in tracking.alerts_for(tp, day)):
        raise HTTPException(409, "There's nothing to prepare for this purchase right now.")
    token = secrets.token_urlsafe(16)
    now = time.monotonic()
    with _handoffs_lock:
        for t in [t for t, (exp, _, _) in _handoffs.items() if exp < now]:
            del _handoffs[t]
        _handoffs[token] = (now + HANDOFF_TTL_S, body.order_id, body.alert_id)
    return {"token": token}


@app.post("/handoffs/{token}/redeem")
def redeem_handoff(token: str):
    with _handoffs_lock:
        entry = _handoffs.pop(token, None)
    if entry is None or entry[0] < time.monotonic():
        raise HTTPException(404, "This link has expired or was already used. Start again from BackPocket.")
    return {"order_id": entry[1], "alert_id": entry[2]}
