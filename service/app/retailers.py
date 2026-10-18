"""Ingested policies for major retailers (data/policies/<id>.json, built by ingest.py).

Looked up by the hostname of the page the shopper is on, so "Read this page"
anywhere on nordstrom.com returns Nordstrom's full policy, merged from its
returns and price adjustment pages.
"""

import json
from pathlib import Path
from urllib.parse import urlparse

from .schemas import MerchantPolicy

POLICIES = Path(__file__).resolve().parents[2] / "data" / "policies"

_cache: dict[str, tuple[float, dict]] = {}


def _load(path: Path) -> dict | None:
    mtime = path.stat().st_mtime
    hit = _cache.get(path.name)
    if hit and hit[0] == mtime:
        return hit[1]
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    _cache[path.name] = (mtime, record)
    return record


def all_records() -> list[dict]:
    if not POLICIES.exists():
        return []
    return [r for p in sorted(POLICIES.glob("*.json")) if (r := _load(p))]


def _host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def find(url: str) -> dict | None:
    """The ingested retailer whose domain matches this page (subdomains too)."""
    host = _host(url)
    if not host:
        return None
    for rec in all_records():
        for d in rec.get("domains", []):
            if host == d or host.endswith("." + d):
                return rec
    return None


def get(retailer_id: str) -> dict | None:
    path = POLICIES / f"{retailer_id}.json"
    return _load(path) if path.exists() else None


def policy(rec: dict) -> MerchantPolicy | None:
    return MerchantPolicy.model_validate(rec["policy"]) if rec.get("policy") else None
