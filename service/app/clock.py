"""Simulated clock. The service owns the day; the store server gets a copy."""

import os

import httpx

from . import db
from .schemas import ClockState

BASE_DATE = "2026-10-18"  # day 0 (demo purchase date)


def store_server_url() -> str:
    # Read at call time so load_dotenv() in main.py has already run.
    return os.environ.get("STORE_SERVER_URL", "http://127.0.0.1:8001")


def get() -> ClockState:
    return ClockState(day=db.get_state("sim_day", 0), base_date=BASE_DATE)


def set_day(day: int) -> ClockState:
    db.set_state("sim_day", day)
    push_to_store(day)
    return get()


def push_to_store(day: int) -> None:
    # The store never calls BackPocket; we push the day to it.
    try:
        httpx.post(f"{store_server_url()}/admin/clock", json={"day": day}, timeout=2)
    except httpx.HTTPError:
        pass  # store server down; prices will be stale until next push
