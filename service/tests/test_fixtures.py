"""Keeps /shared/fixtures honest: they must parse as our schemas, and every
quote must appear verbatim in a /content document (the same check the
extractor will run on live LLM output)."""

import json
import re
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas import Alert, CardBenefits, DraftResponse, TrackedPurchase

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "shared" / "fixtures"


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


SOURCES = [_norm(p.read_text(encoding="utf-8")) for p in (ROOT / "content").glob("*.md")]


def _load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _quotes(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "quote" and v is not None:
                yield v
            else:
                yield from _quotes(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _quotes(v)


def test_fixtures_match_schemas():
    TypeAdapter(list[TrackedPurchase]).validate_python(_load("purchases.json"))
    TypeAdapter(dict[str, list[Alert]]).validate_python(_load("alerts.json"))
    CardBenefits.model_validate(_load("card-benefits.json"))
    DraftResponse.model_validate(_load("draft-response.json"))


def test_every_quote_is_verbatim():
    for name in ["purchases.json", "alerts.json", "card-benefits.json"]:
        for quote in _quotes(_load(name)):
            assert any(_norm(quote) in src for src in SOURCES), f"{name}: {quote!r}"
