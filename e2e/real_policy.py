"""BackPocket on a real retailer's policy page (live network).

Opens Target's Price Match Guarantee page in Chromium with the extension
loaded, reads it the way "Read this page" does, tracks a purchase from that
store, reports a lower price, and checks the alert and the drafted message.

This depends on target.com being reachable and its page wording, so it is a
separate check from e2e/demo_walk.py (which is fully offline). It makes one
live Claude call per new version of the page text.

Needs the service (8000) running and a built extension.
Run:  .venv/Scripts/python e2e/real_policy.py   (add --headed to watch)
"""

import sys
import tempfile
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension" / "build" / "chrome-mv3-prod"
SERVICE = "http://127.0.0.1:8000"
POLICY_URL = "https://www.target.com/help/articles/policies-guidelines/price-match-guarantee"

failures: list[str] = []


def check(cond: bool, label: str) -> None:
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        failures.append(label)


def main(headed: bool) -> int:
    httpx.post(f"{SERVICE}/demo/reset", timeout=60).raise_for_status()

    with sync_playwright() as pw, tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        ctx = pw.chromium.launch_persistent_context(
            profile,
            channel="chromium",
            headless=not headed,
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
        )
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = worker.url.split("/")[2]

        store = ctx.new_page()
        store.goto(POLICY_URL, wait_until="domcontentloaded", timeout=45_000)
        store.get_by_text("14 days").first.wait_for(timeout=20_000)

        panel = ctx.new_page()
        panel.set_viewport_size({"width": 380, "height": 1000})
        panel.goto(f"chrome-extension://{ext_id}/sidepanel.html")

        # "Read this page" reads the active tab, so put the store tab in front.
        store.bring_to_front()
        page = panel.evaluate("() => window.__backpocket.readActiveTab()")
        check(page["url"].startswith("https://www.target.com/"), "Read the active Target tab")
        check("14 days" in page["text"], f"Visible text includes the 14-day rule ({len(page['text'])} chars)")

        policy = panel.evaluate(
            "([p]) => window.__backpocket.readPolicy(p.url, p.text, p.siteName)", [page]
        )
        pm = policy["price_match"]
        print(f"  merchant: {policy['merchant']}")
        print(f"  price adjustment: {pm['window_days']['value']} days | quote: {pm['window_days']['quote']}")
        print(f"  how to ask: {policy['how_to_request']['value']}")
        check(pm["window_days"]["value"] == 14, "Extracted the 14-day window")
        check(pm["window_days"]["confidence"] == "high", "14-day quote is verbatim on the page")
        how = (policy["how_to_request"]["value"] or "").lower()
        check("chat" in how or "1-800" in how, "Extracted how to request (chat / phone)")
        check("target" in policy["merchant"].lower(), "Merchant name is Target")

        # Track a purchase from 5 days ago, then report a lower price today.
        clock = httpx.get(f"{SERVICE}/clock").json()
        purchase = {
            "order_id": "M-real-test",
            "merchant": policy["merchant"],
            "sku": "",
            "item_name": "Throw blanket",
            "price_paid": 40.0,
            "card_last4": "4417",
            "purchase_day": clock["day"] - 5,
            "policy_url": page["url"],
            "claim_form_url": "",
        }
        panel.evaluate(
            "([p, t]) => window.__backpocket.trackPurchase(p, t, true)", [purchase, page["text"]]
        )
        httpx.post(f"{SERVICE}/purchases/M-real-test/price", json={"price": 32.0}, timeout=10)
        alerts = [a for a in httpx.get(f"{SERVICE}/alerts").json() if a["purchase_id"] == "M-real-test"]
        claim = next((a for a in alerts if a["kind"] == "price_drop_claimable"), None)
        check(
            claim is not None and claim["money"]["refund"] == 8.0 and "9 days left" in claim["body"],
            f"Claimable $8 drop with 9 days left: {claim and claim['body']}",
        )

        tp = next(t for t in httpx.get(f"{SERVICE}/purchases").json() if t["purchase"]["order_id"] == "M-real-test")
        msg = panel.evaluate("([tp, a, c]) => window.__backpocket.draftMessage(tp, a, c)", [tp, claim, clock])
        check("$8.00" in msg and pm["window_days"]["quote"][:40] in msg, "Drafted message cites the policy")

        # The panel UI for that purchase. Target has no web form, so the panel
        # offers to draft the message; the draft itself is written on the
        # BackPocket website (see e2e/web_walk.py), so we only check the offer.
        panel.bring_to_front()
        panel.reload()
        panel.get_by_role("button", name="Draft a request message").wait_for(timeout=10_000)
        check(True, "Panel offers 'Draft a request message' for a store without a web form")
        shot = Path(tempfile.gettempdir()) / "backpocket-panel-target.png"
        panel.screenshot(path=str(shot), full_page=True)
        print(f"  screenshot: {shot}")
        ctx.close()

    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main("--headed" in sys.argv))
