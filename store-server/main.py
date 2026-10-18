"""Ridgeline Outfitters store server (mock). Port 8001.

Knows nothing about BackPocket. The BackPocket service pushes the simulated
day to /admin/clock so prices follow the demo calendar.
"""

from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Ridgeline store server")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:5173)$",
    allow_methods=["*"],
    allow_headers=["*"],
)

# (first_day, price) pairs, sorted by day. IMPLEMENTATION.md section 2.
PRICE_SCHEDULE: dict[str, list[tuple[int, float]]] = {
    "RJ-140": [(0, 140.00), (3, 110.00), (20, 95.00)],
}

state = {"day": 0, "claims": []}


def price_on(sku: str, day: int) -> float:
    schedule = PRICE_SCHEDULE.get(sku)
    if schedule is None:
        raise HTTPException(404, "unknown sku")
    return [p for start, p in schedule if start <= day][-1]


@app.get("/price/{sku}")
def get_price(sku: str):
    return {"sku": sku, "day": state["day"], "price": price_on(sku, state["day"])}


class Claim(BaseModel):
    claim_type: str
    order_number: str
    email: str = ""
    item: str = ""
    price_paid: float | None = None
    current_price: float | None = None
    purchase_date: str = ""
    explanation: str = ""


@app.post("/claims")
def submit_claim(claim: Claim):
    confirmation = f"RC-{len(state['claims']) + 1:04d}"
    state["claims"].append(
        {"confirmation": confirmation, "day": state["day"],
         "received_at": datetime.now().isoformat(), **claim.model_dump()}
    )
    return {"confirmation": confirmation, "status": "received"}


@app.get("/claims")
def list_claims():
    return state["claims"]


class SetDay(BaseModel):
    day: int


@app.post("/admin/clock")
def admin_clock(body: SetDay):
    state["day"] = body.day
    return {"day": state["day"]}


@app.post("/admin/reset")
def admin_reset():
    state["day"] = 0
    state["claims"] = []
    return {"ok": True}
