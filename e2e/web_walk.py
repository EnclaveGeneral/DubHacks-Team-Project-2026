"""Walks the BackPocket website in a real Chromium with the extension loaded.

  1. Dashboard: the five seeded purchases from the fictional stores, a store filter.
  2. Detail page: draft a request message for a store with no web form, mark it
     sent, and see the claim on the timeline.
  3. Hand-off: buy the Ridgeline jacket, then "Prepare claim form" on the website
     opens the store's form and the extension fills it (and never submits).
  4. Side panel: each purchase has a "More details" link to the website.

Needs the store (5173), store server (8001), service (8000), and website (5174)
running, and a built extension:  cd extension && npx plasmo build
Run:  .venv/Scripts/python e2e/web_walk.py   (add --headed to watch)
"""

import sys
import tempfile
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension" / "build" / "chrome-mv3-prod"
STORE = "http://localhost:5173"
SITE = "http://localhost:5174"
SERVICE = "http://127.0.0.1:8000"

failures: list[str] = []


def check(cond: bool, label: str) -> None:
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        failures.append(label)


def main(headed: bool) -> int:
    httpx.post(f"{SERVICE}/demo/reset", params={"seed": True}, timeout=60).raise_for_status()

    with sync_playwright() as pw, tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        ctx = pw.chromium.launch_persistent_context(
            profile,
            channel="chromium",
            headless=not headed,
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
        )
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        ext_id = worker.url.split("/")[2]

        # ---------- Dashboard ----------
        site = ctx.new_page()
        site.set_viewport_size({"width": 1200, "height": 900})
        site.goto(SITE)
        cards = site.locator(".purchase-card")
        cards.first.wait_for(timeout=10_000)
        check(cards.count() == 5, f"Dashboard lists the 5 seeded purchases ({cards.count()})")
        check(site.get_by_text("Price dropped $30").first.is_visible(), "Tent shows the claimable price drop")
        check(
            site.locator('[data-order="HS-55102"]').get_by_text("doesn't offer price adjustments").count() == 1,
            "Hearthside dinner set explains the store has no price adjustments",
        )
        check(
            cards.first.get_attribute("data-order") == "FP-20931",
            "Most valuable alert (price drop) is listed first",
        )

        site.get_by_role("button", name="Hearthside Home").click()
        check(cards.count() == 2, f"Store filter narrows to Hearthside's 2 purchases ({cards.count()})")
        site.get_by_role("button", name="All stores").click()
        shot = Path(tempfile.gettempdir()) / "backpocket-web-dashboard.png"
        site.screenshot(path=str(shot), full_page=True)
        print(f"  screenshot: {shot}")

        # ---------- Detail: draft a message, mark it sent ----------
        site.locator('[data-order="FP-20931"]').get_by_role("link", name="More details").click()
        site.wait_for_url("**/purchases/FP-20931")
        site.get_by_role("heading", name="Summit 2P Tent").wait_for()
        check(site.locator(".price-chart svg").count() == 1, "Detail page shows the price chart")
        check(site.get_by_text("Extra warranty from your card").count() == 1, "Detail page lists the card's warranty window")
        check(site.get_by_text("Store policy 4.2").count() >= 1, "Clause 4.2 is quoted on the page")

        site.get_by_role("button", name="Draft a request message").click()
        box = site.get_by_label("Message to the store")
        message = box.input_value()
        check("$30.00" in message, "Drafted message states the $30.00 difference")
        check("If an item you purchased from Fjord & Pine Outdoor Co." in message, "Drafted message quotes clause 4.2")

        site.get_by_role("button", name="I've sent it").click()
        site.get_by_text("Claim filed ✓").wait_for(timeout=10_000)
        check(True, "Marking it sent shows 'Claim filed' on the deadlines")
        check(
            "price_match" in httpx.get(f"{SERVICE}/purchases/FP-20931").json()["claims_filed"],
            "Service recorded the filed price match",
        )

        # The panel sends people here to draft: ?alert=<id> opens the draft.
        site.goto(f"{SITE}/purchases/FP-20877?alert=rebuy-FP-20877-p99")
        site.get_by_label("Message to the store").wait_for(timeout=10_000)
        check(True, "?alert= opens the drafted message straight away")

        # ---------- Hand-off: Ridgeline claim form ----------
        store = ctx.new_page()
        store.goto(f"{STORE}/product/rj-140")
        store.get_by_role("button", name="M", exact=True).click()
        store.get_by_role("button", name="Buy now").click()
        store.wait_for_url("**/checkout")
        store.get_by_role("button", name="Place order").click()
        store.wait_for_url("**/confirmation/RO-10482")
        store.locator("#backpocket-protect input[type=checkbox]").check()
        store.locator("#backpocket-protect", has_text="Protected").wait_for(timeout=120_000)
        httpx.post(f"{SERVICE}/clock", json={"day": 3}, timeout=10)

        site.goto(f"{SITE}/purchases/RO-10482")
        link = site.get_by_role("link", name="Prepare claim form")
        link.wait_for(timeout=10_000)
        with ctx.expect_page() as popup:
            link.click()
        form = popup.value
        form.wait_for_load_state()
        form.locator(".backpocket-tag").first.wait_for(timeout=15_000)
        check(form.url.endswith("/claim"), f"Website link opened the claim form ({form.url})")
        check(form.locator(".backpocket-tag").count() == 7, "Extension filled and highlighted 7 fields")
        check(form.locator("#claim-form").is_visible(), "Form is still unsubmitted (shopper submits)")
        check("#backpocket" not in form.url, "Hand-off hash removed from the URL")
        form.close()

        # ---------- Side panel ----------
        panel = ctx.new_page()
        panel.set_viewport_size({"width": 380, "height": 1000})
        panel.goto(f"chrome-extension://{ext_id}/sidepanel.html")
        panel.get_by_role("button", name="More details").first.wait_for(timeout=10_000)
        check(panel.get_by_role("button", name="More details").count() == 6, "Panel summarizes all 6 purchases")
        check(panel.locator(".price-chart").count() == 0, "Price chart moved to the website")
        with ctx.expect_page() as popup:
            panel.get_by_role("button", name="More details").first.click()
        details = popup.value
        check(details.url.startswith(f"{SITE}/purchases/"), f"'More details' opens the website ({details.url})")
        shot = Path(tempfile.gettempdir()) / "backpocket-panel-summary.png"
        panel.bring_to_front()
        panel.screenshot(path=str(shot), full_page=True)
        print(f"  screenshot: {shot}")
        ctx.close()

    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main("--headed" in sys.argv))
