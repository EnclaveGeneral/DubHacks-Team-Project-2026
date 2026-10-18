"""SQLite storage. JSON blobs for models; the service is the record of truth."""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "backpocket.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases (
    order_id TEXT PRIMARY KEY,
    data TEXT NOT NULL            -- TrackedPurchase JSON
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def reset() -> None:
    with connect() as conn:
        conn.executescript("DROP TABLE IF EXISTS state; DROP TABLE IF EXISTS purchases;")
        conn.executescript(SCHEMA)


def get_state(key: str, default=None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_state(key: str, value) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO state (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )
