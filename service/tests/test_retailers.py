"""Merging a retailer's policy pages, and finding a retailer by page URL."""

import json

from app import extract, retailers
from app.extract import PolicyExtraction
from app.schemas import Cited

RETURNS = "https://shop.example/help/returns"
ADJUST = "https://shop.example/help/price-adjustments"


def cited(value, quote, url, confidence="high"):
    return Cited(value=value, quote=quote, confidence=confidence, source_url=url)


def page(**fields) -> PolicyExtraction:
    base = dict(
        merchant_name=None,
        how_to_request=Cited(),
        return_window_days=Cited(),
        return_window_unlimited=Cited(),
        exchange_window_days=Cited(),
        price_match_allowed=Cited(),
        price_match_window_days=Cited(),
        price_match_conditions=[],
        manufacturer_warranty_months=Cited(),
    )
    base.update(fields)
    return PolicyExtraction(**base)


def test_merge_takes_each_field_from_its_own_page():
    returns = page(
        merchant_name="Shop",
        return_window_days=cited(45, "Return within 45 days.", RETURNS),
        # A returns page that only mentions adjustments in passing, unverified.
        price_match_window_days=cited(7, "maybe 7", RETURNS, confidence="low"),
        how_to_request=cited("start a return online", "Start a return online.", RETURNS),
    )
    adjust = page(
        price_match_allowed=cited(True, "We offer price adjustments.", ADJUST),
        price_match_window_days=cited(14, "Request one within 14 days.", ADJUST),
        price_match_conditions=[cited("Same item", "Same item only.", ADJUST)],
        how_to_request=cited("call 1-800-555-0100", "Call 1-800-555-0100.", ADJUST),
    )
    merged = extract.merge_pages([("returns", returns), ("price_adjustment", adjust)])

    assert merged.merchant_name == "Shop"
    assert merged.return_window_days.value == 45 and merged.return_window_days.source_url == RETURNS
    assert merged.price_match_window_days.value == 14
    assert merged.price_match_window_days.source_url == ADJUST
    assert merged.how_to_request.value == "call 1-800-555-0100"
    assert [c.value for c in merged.price_match_conditions] == ["Same item"]


def test_merge_prefers_a_verified_quote_over_the_preferred_page():
    adjust = page(price_match_window_days=cited(30, "garbled", ADJUST, confidence="low"))
    returns = page(price_match_window_days=cited(14, "Adjustments within 14 days.", RETURNS))
    merged = extract.merge_pages([("returns", returns), ("price_adjustment", adjust)])
    assert merged.price_match_window_days.value == 14


def test_merge_falls_back_to_unverified_then_null():
    adjust = page(price_match_window_days=cited(30, "garbled", ADJUST, confidence="low"))
    merged = extract.merge_pages([("returns", page()), ("price_adjustment", adjust)])
    assert merged.price_match_window_days.value == 30
    assert merged.price_match_window_days.confidence == "low"
    assert merged.manufacturer_warranty_months.value is None


def test_find_matches_domain_and_subdomains(tmp_path, monkeypatch):
    rec = {"id": "shop", "name": "Shop", "domains": ["shop.example"], "pages": [], "policy": None}
    (tmp_path / "shop.json").write_text(json.dumps(rec), encoding="utf-8")
    monkeypatch.setattr(retailers, "POLICIES", tmp_path)
    assert retailers.find("https://www.shop.example/product/1")["id"] == "shop"
    assert retailers.find("https://help.shop.example/returns")["id"] == "shop"
    assert retailers.find("https://notshop.example/") is None
    assert retailers.find("https://shop.example.evil.com/") is None


def test_no_store_price_lookup_for_purchases_without_a_sku(monkeypatch):
    from app import clock, tracking

    calls = []
    monkeypatch.setattr(clock.http, "get", lambda url, **kw: calls.append(url))
    assert tracking._store_price("") is None
    assert calls == []
