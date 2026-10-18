"""Edge-case UX flows: awkward navigation/action combinations against the live
demo (store, website, extension, service). Each scenario starts from a reset
and checks that nothing breaks: no page JS errors, the service answers, the
panel and website render without an error banner, and purchase counts match.

Needs all servers running (npm run dev) and a built extension
(cd extension && npx plasmo build). Resets the demo; puts the clock back and
re-seeds the sample purchases at the end.
Run:  .venv/Scripts/python e2e/edge_flows.py
"""
import sys
import tempfile
import traceback
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension" / "build" / "chrome-mv3-prod"
S = "http://127.0.0.1:8000"
STORE = "http://localhost:5173"
SITE = "http://localhost:5174"

results = []


def svc(path, method="get", **kw):
    return getattr(httpx, method)(f"{S}{path}", timeout=30, **kw)


def scenario(fn):
    results.append(fn)
    return fn


class Ctx:
    def __init__(self, ctx, ext):
        self.ctx, self.ext, self.errors = ctx, ext, []

    def page(self):
        p = self.ctx.new_page()
        p.on("pageerror", lambda e, p=p: self.errors.append(f"{p.url[:60]}: {e}"))
        return p

    def buy(self, p, size="M"):
        p.goto(f"{STORE}/product/rj-140")
        p.get_by_role("button", name=size, exact=True).click()
        p.get_by_role("button", name="Buy now").click()
        p.get_by_role("button", name="Place order").click()
        p.wait_for_url("**/confirmation/**")
        return p.url.rsplit("/", 1)[1]

    def protect(self, p):
        p.locator("#backpocket-protect input[type=checkbox]").check()
        p.locator("#backpocket-protect", has_text="Protected").wait_for(timeout=120_000)

    def panel(self):
        p = self.page()
        p.goto(f"chrome-extension://{self.ext}/sidepanel.html")
        p.wait_for_timeout(1500)
        return p

    def healthy(self, label):
        problems = []
        if svc("/state").status_code != 200:
            problems.append("service /state failed")
        pan = self.panel()
        if pan.locator(".banner.error, p.error").count():
            problems.append("panel error: " + " | ".join(pan.locator(".banner.error, p.error").all_inner_texts()))
        pan.close()
        site = self.page()
        site.goto(f"{SITE}/")
        site.wait_for_timeout(1500)
        if site.locator(".banner.error").count():
            problems.append("website error: " + " | ".join(site.locator(".banner.error").all_inner_texts()))
        site.close()
        if self.errors:
            problems.append("page JS errors: " + " || ".join(self.errors[:3]))
        return problems


def reset():
    svc("/demo/reset", "post").raise_for_status()


def ridgeline_count():
    return sum(1 for t in svc("/purchases").json() if t["purchase"]["merchant"] == "Ridgeline Outfitters")


# ---------------- scenarios ----------------


@scenario
def protect_twice_and_reload(c):
    """Toggle protect, reload the confirmation page, toggle again."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    p.reload()
    c.protect(p)
    n = ridgeline_count()
    return [] if n == 1 else [f"expected 1 tracked purchase, got {n}"]


@scenario
def back_button_rebuy(c):
    """Buy, go back to checkout, place the order again: two orders, both protectable."""
    p = c.page()
    first = c.buy(p)
    c.protect(p)
    p.go_back()
    p.wait_for_timeout(800)
    if "/checkout" in p.url and p.get_by_role("button", name="Place order").count():
        p.get_by_role("button", name="Place order").click()
        p.wait_for_url("**/confirmation/**")
    else:
        c.buy(p)
    second = p.url.rsplit("/", 1)[1]
    c.protect(p)
    n = ridgeline_count()
    out = []
    if first == second:
        out.append(f"second order reused the order number {first}")
    if n != 2:
        out.append(f"expected 2 tracked purchases, got {n}")
    return out


@scenario
def claim_then_time_travel_back(c):
    """File the day-3 claim, then jump back to day 0 and forward to 28."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    svc("/clock", "post", json={"day": 3})
    svc("/purchases/RO-10482/claims", "post", json={"claim_type": "price_match"})
    out = []
    for d in (0, 1, 28, 3):
        r = svc("/clock", "post", json={"day": d})
        if r.status_code != 200:
            out.append(f"day {d}: {r.status_code}")
        if svc("/state").status_code != 200:
            out.append(f"state failed at day {d}")
    return out


@scenario
def reset_with_filled_form_then_submit(c):
    """Prepare the claim form, Reset the demo, then the shopper submits anyway."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    svc("/clock", "post", json={"day": 3})
    pan = c.panel()
    p.bring_to_front()
    tp = svc("/purchases/RO-10482").json()
    a = next(x for x in svc("/alerts").json() if x["purchase_id"] == "RO-10482" and x["action"])
    pan.evaluate("([tp, a, c]) => window.__backpocket.prepareClaim(tp, a, c)", [tp, a, svc("/clock").json()])
    reset()
    p.fill("#email", "x@example.com")
    p.get_by_role("button", name="Submit request").click()
    p.get_by_text("Confirmation number").wait_for(timeout=5000)
    p.wait_for_timeout(800)
    return []  # healthy() checks for errors


@scenario
def handoff_code_after_reset(c):
    """Website hand-off code created, demo reset, then the link is opened."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    svc("/clock", "post", json={"day": 3})
    a = next(x for x in svc("/alerts").json() if x["purchase_id"] == "RO-10482" and x["action"])
    token = svc("/handoffs", "post", json={"order_id": "RO-10482", "alert_id": a["id"]}).json()["token"]
    reset()
    f = c.page()
    f.goto(f"{STORE}/claim#backpocket-handoff={token}")
    f.wait_for_timeout(3000)
    filled = f.locator(".backpocket-tag").count()
    return [] if filled == 0 else [f"filled {filled} fields for a purchase that no longer exists"]


@scenario
def prepare_claim_while_on_website_tab(c):
    """Panel's 'Prepare claim form' while the active tab is the BackPocket website."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    svc("/clock", "post", json={"day": 3})
    site = c.page()
    site.goto(f"{SITE}/")
    pan = c.panel()
    site.bring_to_front()
    tp = svc("/purchases/RO-10482").json()
    a = next(x for x in svc("/alerts").json() if x["purchase_id"] == "RO-10482" and x["action"])
    pan.evaluate("([tp, a, c]) => window.__backpocket.prepareClaim(tp, a, c)", [tp, a, svc("/clock").json()])
    c.ctx.pages  # noqa
    out = []
    if site.url.startswith(SITE) is False:
        out.append(f"the website tab was navigated away to {site.url[:60]}")
    if not any("/claim" in pg.url for pg in c.ctx.pages):
        out.append("no tab ended up on the claim form")
    return out


@scenario
def switch_card_mid_flow(c):
    """Protect with card 4417, switch to the 9021 card, check numbers still render."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    svc("/clock", "post", json={"day": 3})
    r = svc("/cards/cascade-9021/select", "post")
    out = [] if r.status_code == 200 else [f"card switch {r.status_code}"]
    alerts = [a for a in svc("/alerts").json() if a["purchase_id"] == "RO-10482"]
    if not alerts:
        out.append("no alert after switching cards")
    svc("/cards/northwind-4417/select", "post")
    return out


@scenario
def rapid_day_clicks_on_website(c):
    """Click +1 ten times fast on the website; the clock and page must agree."""
    site = c.page()
    site.goto(f"{SITE}/")
    site.wait_for_timeout(1200)
    btn = site.get_by_role("button", name="Next day")
    for _ in range(10):
        btn.click()
    site.wait_for_timeout(2500)
    day = svc("/clock").json()["day"]
    shown = site.locator(".demo-label").inner_text()
    return [] if f"Demo day {day}" in shown else [f"clock is day {day} but page shows '{shown}'"]


@scenario
def far_future_day(c):
    """Jump to day 800 (past every warranty) and back."""
    p = c.page()
    c.buy(p)
    c.protect(p)
    out = []
    for d in (800, 0):
        if svc("/clock", "post", json={"day": d}).status_code != 200:
            out.append(f"day {d} failed")
    site = c.page()
    svc("/clock", "post", json={"day": 800})
    site.goto(f"{SITE}/purchases/RO-10482")
    site.wait_for_timeout(1500)
    if not site.locator(".price-chart svg").count():
        out.append("chart missing at day 800")
    svc("/clock", "post", json={"day": 0})
    return out


@scenario
def read_this_page_on_non_policy_pages(c):
    """'Read this page' on the store's product page and on the BackPocket website."""
    out = []
    pan = c.panel()
    for url in (f"{STORE}/product/rj-140", f"{SITE}/"):
        t = c.page()
        t.goto(url)
        t.wait_for_timeout(1000)
        t.bring_to_front()
        try:
            page = pan.evaluate("() => window.__backpocket.readActiveTab()")
            res = pan.evaluate(
                "async ([p]) => { try { await window.__backpocket.readPolicy(p.url, p.text, p.siteName); return 'ok' } catch (e) { return 'error: ' + e.message } }",
                [page],
            )
            if res == "ok" and url.startswith(SITE):
                out.append("treated the BackPocket website as a store policy")
        except Exception as e:  # noqa: BLE001
            # Refusing BackPocket's own site with a clear message is correct.
            if not (url.startswith(SITE) and "This is BackPocket itself" in str(e)):
                out.append(f"{url}: {str(e)[:120]}")
        t.close()
    return out


@scenario
def confirmation_page_opened_directly(c):
    """Open a confirmation URL with no order in this browser, then protect it."""
    p = c.page()
    p.goto(f"{STORE}/confirmation/RO-99999")
    c.protect(p)
    ids = [t["purchase"]["order_id"] for t in svc("/purchases").json()]
    return [] if "RO-99999" in ids else ["direct confirmation page couldn't be protected"]


@scenario
def protect_with_service_down(c):
    """Turn on protect while the service is unreachable: clear error, box unchecked, retry works."""
    p = c.page()
    c.buy(p)
    p.route("http://localhost:8000/**", lambda r: r.abort())
    p.locator("#backpocket-protect input[type=checkbox]").check()
    p.wait_for_timeout(2500)
    msg = p.locator("#backpocket-protect").inner_text()
    checked = p.locator("#backpocket-protect input[type=checkbox]").is_checked()
    p.unroute("http://localhost:8000/**")
    out = []
    if "Couldn't protect" not in msg:
        out.append(f"no clear error: {msg!r}")
    if checked:
        out.append("box stayed checked after failing")
    c.protect(p)
    return out


def main():
    start_day = svc("/clock").json()["day"]
    report = []
    with sync_playwright() as pw:
        for fn in results:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
                ctx = pw.chromium.launch_persistent_context(
                    prof, channel="chromium", headless=True, viewport={"width": 1280, "height": 900},
                    args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
                )
                w = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
                c = Ctx(ctx, w.url.split("/")[2])
                reset()
                try:
                    problems = fn(c) + c.healthy(fn.__name__)
                except Exception as e:  # noqa: BLE001
                    problems = [f"crashed: {type(e).__name__}: {str(e).splitlines()[0][:160]}"]
                    traceback.print_exc(limit=1)
                report.append((fn.__name__, fn.__doc__.strip(), problems))
                ctx.close()
    svc("/demo/reset?seed=true", "post")
    svc("/clock", "post", json={"day": start_day})
    bad = 0
    for name, doc, problems in report:
        print(f"{'OK  ' if not problems else 'FAIL'} {name}: {doc}")
        for pr in problems:
            print(f"       - {pr}")
        bad += bool(problems)
    print(f"\n{len(report) - bad}/{len(report)} scenarios clean")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
