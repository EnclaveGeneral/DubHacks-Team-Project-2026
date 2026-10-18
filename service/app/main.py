"""BackPocket service. Routes from IMPLEMENTATION.md section 4.

Add ?fresh=true to /purchases or /cards/{id}/select to skip the extraction cache.
"""

import os
from contextlib import asynccontextmanager

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import cards, clock, db, extract, tracking
from .schemas import (
    Alert,
    CardCatalogEntry,
    ClaimFiled,
    ClockState,
    DraftRequest,
    DraftResponse,
    NewPurchaseRequest,
    SelectedCard,
    TrackedPurchase,
)

load_dotenv()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    yield


app = FastAPI(title="BackPocket service", lifespan=lifespan)

# CORSMiddleware does not accept wildcards in allow_origins, so use a regex.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:5173)$",
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
def demo_reset():
    db.reset()
    try:
        httpx.post(f"{clock.store_server_url()}/admin/reset", timeout=2)
    except httpx.HTTPError:
        pass
    try:
        select_card(DEMO_CARD)  # cached extraction, so this is instant
    except HTTPException:
        pass  # no cache and no API key: shopper picks the card in the panel
    return clock.set_day(0)


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
    if not body.policy_text.strip():
        raise HTTPException(400, "policy_text is empty")
    day = clock.get().day
    purchase = body.purchase.model_copy(update={"purchase_day": day})
    with tracking.lock:
        existing = tracking.load(purchase.order_id)
        if existing and not fresh:
            return tracking.refresh(existing, day)
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


@app.get("/purchases", response_model=list[TrackedPurchase])
def list_purchases():
    return tracking.refresh_all(clock.get().day)


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
