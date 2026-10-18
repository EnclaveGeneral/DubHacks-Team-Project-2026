"""Ridgeline Outfitters store server (mock). Port 8001.

Knows nothing about BackPocket. The BackPocket service pushes the simulated
day to /admin/clock so prices follow the demo calendar.
"""

import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


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


logging.getLogger("uvicorn.access").addFilter(QuietPolling(("/prices", "/price/")))

app = FastAPI(title="Ridgeline store server")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:5173)$",
    allow_methods=["*"],
    allow_headers=["*"],
)

# (first_day, price) pairs, sorted by day. Only the demo jacket changes price
# (IMPLEMENTATION.md section 2); the rest of the catalog stays flat.
PRICE_SCHEDULE: dict[str, list[tuple[int, float]]] = {
    "RJ-140": [(0, 140.00), (3, 110.00), (20, 95.00)],
    "BF-078": [(0, 78.00)],
    "SP-085": [(0, 85.00)],
    "CV-120": [(0, 120.00)],
    "TM-065": [(0, 65.00)],
    "AB-032": [(0, 32.00)],
    "DS-095": [(0, 95.00)],
    "LP-058": [(0, 58.00)],
    # Items the fictional Fjord & Pine and Hearthside Home stores sold before
    # day 0 (seeded by the BackPocket service for the website). Negative start
    # days are earlier than the demo's day 0. These stores have no pages here;
    # this server just answers for their prices.
    "FP-TENT-249": [(-20, 249.00), (-4, 219.00), (8, 199.00)],
    "FP-PACK-129": [(-30, 129.00), (-8, 99.00)],
    "FP-FLEECE-89": [(-30, 89.00), (-6, 69.00), (10, 59.00)],
    "HS-DINNER-120": [(-30, 120.00), (-5, 95.00)],
    "HS-DUVET-89": [(-60, 89.00)],
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


@app.get("/prices")
def get_prices():
    day = state["day"]
    return {"day": day, "prices": {sku: price_on(sku, day) for sku in PRICE_SCHEDULE}}


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
