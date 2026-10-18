"""BackPocket service. Routes from IMPLEMENTATION.md section 4.

Routes marked TODO return 501 until their owner implements them.
"""

import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import cards, clock, db
from .schemas import (
    Alert,
    CardBenefits,
    CardCatalogEntry,
    ClockState,
    DraftRequest,
    DraftResponse,
    NewPurchaseRequest,
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


@app.post("/demo/reset", response_model=ClockState)
def demo_reset():
    db.reset()
    db.set_state("selected_card", "northwind-4417")
    try:
        httpx.post(f"{clock.store_server_url()}/admin/reset", timeout=2)
    except httpx.HTTPError:
        pass
    return clock.set_day(0)


# ---------- Cards ----------


@app.get("/cards", response_model=list[CardCatalogEntry])
def list_cards():
    return cards.CATALOG


@app.post("/cards/{card_id}/select", response_model=CardBenefits)
def select_card(card_id: str):
    card = cards.find(card_id)
    if card is None:
        raise HTTPException(404, "unknown card")
    db.set_state("selected_card", card_id)
    # TODO(B): extract.card_benefits(cards.guide_text(card)) with cache
    raise HTTPException(501, "benefits extraction not implemented")


# ---------- Purchases + alerts (B) ----------


@app.post("/purchases", response_model=TrackedPurchase)
def add_purchase(body: NewPurchaseRequest):
    # TODO(B): extract policy, run engine for timeline, store TrackedPurchase
    raise HTTPException(501, "purchase tracking not implemented")


@app.get("/purchases", response_model=list[TrackedPurchase])
def list_purchases():
    # TODO(B)
    return []


@app.get("/alerts", response_model=list[Alert])
def list_alerts(since: int | None = None):
    # TODO(B): evaluate every purchase at clock.get().day, update lowest_seen
    return []


@app.post("/claims/draft", response_model=DraftResponse)
def draft_claim(body: DraftRequest):
    # TODO(B): 409 with reason if engine says no claim is supported
    raise HTTPException(501, "form drafter not implemented")


@app.post("/purchases/{order_id}/claims")
def mark_claim_filed(order_id: str):
    # TODO(B)
    raise HTTPException(501, "not implemented")
