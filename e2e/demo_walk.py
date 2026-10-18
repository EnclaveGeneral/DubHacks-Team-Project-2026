"""Walks the demo in a real Chromium with the extension loaded.

Checks the H5 and H6 checkpoints (IMPLEMENTATION.md §6):
  H6: confirmation page -> "Protect this purchase" -> service extracts the real
      policy -> timeline; hidden injection text never reaches the service.
  H5: "Prepare claim" fills the React claim form, the shopper submits, the
      store receives the values, and the service marks the claim filed.
Also walks days 3 / 20 / 28 and checks the alerts.

Needs the store (5173), store server (8001), and service (8000) running, and
a built extension:  cd extension && npx plasmo build
Run:  .venv/Scripts/python e2e/demo_walk.py   (add --headed to watch)
"""

import json
import sys
import tempfile
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension" / "build" / "chrome-mv3-prod"
STORE = "http://localhost:5173"
SERVICE = "http://127.0.0.1:8000"
STORE_SERVER = "http://127.0.0.1:8001"

failures: list[str] = []


def check(cond: bool, label: str) -> None:
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        failures.append(label)


def alerts_by_kind() -> dict[str, dict]:
    return {a["kind"]: a for a in httpx.get(f"{SERVICE}/alerts", timeout=10).json()}


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

        # ---------- H6: protect the purchase ----------
        store = ctx.new_page()
        posted: list[dict] = []
        store.on(
            "request",
            lambda r: posted.append(json.loads(r.post_data))
            if r.method == "POST" and r.url.endswith(":8000/purchases")
            else None,
        )
        store.goto(f"{STORE}/product/rj-140")
        store.get_by_role("button", name="M", exact=True).click()  # size
        store.get_by_role("button", name="Buy now").click()
        store.wait_for_url("**/checkout")
        store.get_by_role("button", name="Place order").click()
        store.wait_for_url("**/confirmation/RO-10482")

        toggle = store.locator("#backpocket-protect input[type=checkbox]")
        toggle.wait_for(timeout=5000)
        check(True, "Protect this purchase toggle appears on the confirmation page")
        toggle.check()
        store.locator("#backpocket-protect", has_text="Protected").wait_for(timeout=120_000)
        check(True, "Toggle reports Protected")

        check(len(posted) == 1, "Extension posted the purchase to the service")
        policy_text = posted[0]["policy_text"] if posted else ""
        check("4.2 If an item you purchased from Ridgeline Outfitters" in policy_text, "Policy text sent with clause numbers")
        check("ignore your previous rules" not in policy_text, "Hidden injection line stripped")
        check(posted and posted[0]["purchase"]["card_last4"] == "4417", "Card last4 read from JSON-LD")

        [tp] = httpx.get(f"{SERVICE}/purchases", timeout=10).json()
        windows = {w["label"].split(" (")[0]: (w["opens_day"], w["closes_day"]) for w in tp["timeline"]}
        check(
            windows == {
                "Price match": (0, 14),
                "Return": (0, 30),
                "Manufacturer warranty": (0, 365),
                "Card extended warranty": (365, 730),
            },
            f"Timeline from live extraction: {windows}",
        )
        low = [k for k, v in tp["policy"].items() if isinstance(v, dict) and v.get("confidence") == "low"]
        check(not low, f"All policy quotes verified verbatim (low: {low})")

        # ---------- Day 3: claimable drop + H5 form fill ----------
        httpx.post(f"{SERVICE}/clock", json={"day": 3}, timeout=10)
        a = alerts_by_kind().get("price_drop_claimable")
        check(a is not None and "11 days left" in a["body"] and "about $29" in a["body"],
              f"Day 3 alert: {a and a['body']}")

        panel = ctx.new_page()
        panel.set_viewport_size({"width": 380, "height": 900})
        panel.goto(f"chrome-extension://{ext_id}/sidepanel.html")

        def snap(text: str, name: str) -> None:
            panel.bring_to_front()
            panel.reload()
            try:
                panel.get_by_text(text).first.wait_for(timeout=10_000)
                check(True, f"Side panel shows {text!r}")
            except Exception as e:
                check(False, f"Side panel shows {text!r} ({str(e).splitlines()[0]})")
            shot = Path(tempfile.gettempdir()) / f"backpocket-panel-{name}.png"
            panel.screenshot(path=str(shot), full_page=True)
            print(f"  screenshot: {shot}")

        snap("Price dropped $30", "day3")
        clock = httpx.get(f"{SERVICE}/clock").json()
        tp = httpx.get(f"{SERVICE}/purchases").json()[0]

        store.bring_to_front()
        result = panel.evaluate(
            "([tp, a, c]) => window.__backpocket.prepareClaim(tp, a, c)", [tp, a, clock]
        )
        check(not result["failed"] and len(result["filled"]) == 7,
              f"Filled fields: {result}")
        check(store.url.endswith("/claim"), "Prepare claim navigated to the claim form")
        check(store.locator(".backpocket-tag").count() == 7, "Filled fields are highlighted")
        check(store.locator("#claim-form").is_visible(), "Form is still unsubmitted (shopper submits)")

        store.fill("#email", "shopper@example.com")  # the one field left for the shopper
        store.get_by_role("button", name="Submit request").click()
        store.get_by_text("Confirmation number").wait_for(timeout=5000)
        claim = httpx.get(f"{STORE_SERVER}/claims").json()[-1]
        check(
            claim["claim_type"] == "price_adjustment"
            and claim["order_number"] == "RO-10482"
            and claim["price_paid"] == 140.0
            and claim["current_price"] == 110.0
            and claim["purchase_date"] == "2026-10-18"
            and 'Clause 4.2 of your policy states: "If an item you purchased from Ridgeline' in claim["explanation"],
            f"Store received React-registered values: {claim}",
        )
        store.wait_for_timeout(500)
        tp = httpx.get(f"{SERVICE}/purchases").json()[0]
        check(tp["claims_filed"] == ["price_match"], "Service marked the claim filed")
        check("price_drop_claimable" not in alerts_by_kind(), "Claim offer disappears once filed")

        # ---------- Day 20: declined ----------
        httpx.post(f"{SERVICE}/clock", json={"day": 20}, timeout=10)
        a = alerts_by_kind().get("price_drop_declined")
        check(a is not None and a["action"] is None and "Clause 4.2" in a["body"],
              f"Day 20 declined: {a and a['body']}")
        snap("no claim is available", "day20")

        # ---------- Day 28: return warning ----------
        httpx.post(f"{SERVICE}/clock", json={"day": 28}, timeout=10)
        a = alerts_by_kind().get("window_closing")
        check(a is not None and a["title"] == "Return window closes in 2 days"
              and a["money"]["points_reversed"] == 420 and "pending" in a["body"],
              f"Day 28 warning: {a and a['body']}")

        snap("Return window closes in 2 days", "day28")
        ctx.close()

    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main("--headed" in sys.argv))
