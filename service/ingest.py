"""Ingest major retailers' return and price-adjustment policies.

Reads data/retailers.json (each retailer's official policy pages), renders each
page in Chromium (most help centers are JavaScript-rendered or block plain
fetches), extracts each page with Claude, merges the pages field by field, and
writes data/policies/<id>.json. The service serves those files, so "Read this
page" on a known retailer gets the full policy, not just the open page.

    cd service
    ../.venv/Scripts/python ingest.py                 # all retailers
    ../.venv/Scripts/python ingest.py --only target,nordstrom
    ../.venv/Scripts/python ingest.py --refetch       # re-render pages even if a snapshot exists
    ../.venv/Scripts/python ingest.py --fresh         # re-run extraction, ignoring the cache
    ../.venv/Scripts/python ingest.py --headed        # visible browser (some sites block headless)

Page snapshots go to data/policies/raw/ (not committed). Extraction results are
cached in app/cache/ like every other extraction.
"""

import argparse
import json
import re
from html.parser import HTMLParser

import httpx
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from app import extract
from app.extract import PolicyExtraction

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "data" / "retailers.json"
OUT = ROOT / "data" / "policies"
RAW = OUT / "raw"

MIN_CHARS = 300
BLOCKED = re.compile(
    r"access denied|robot or human|are you a (human|robot)|captcha|press (&|and) hold|"
    r"unusual traffic|request unsuccessful|verify you are human|pardon our interruption",
    re.I,
)
# Link text that points to each topic's page, for finding a page whose URL moved.
TOPIC_LINKS = {
    "returns": re.compile(r"\breturn(s| policy| & exchange|s & exchange)|refund policy", re.I),
    "price_adjustment": re.compile(r"price (adjust|match|protection|guarantee)", re.I),
    "warranty": re.compile(r"warrant|guarantee", re.I),
}
# A link from a topic page to the fuller policy behind it ("View our Pricing
# Policy for details and exclusions").
DEEPER_LINKS = {
    "returns": re.compile(r"return polic(y|ies)|full (return )?policy", re.I),
    "price_adjustment": re.compile(r"(pricing|price adjustment|price match(ing)?) polic(y|ies)|details and exclusions", re.I),
    "warranty": re.compile(r"warranty (polic|terms|details)", re.I),
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

# Same rules as extension/lib/readTab.ts (keep in sync): the policy section or
# main content, visible blocks only, judged by computed style.
COLLECT_JS = r"""
() => {
  // Open collapsed help-center sections so their text counts as visible.
  document.querySelectorAll("details").forEach((d) => (d.open = true))
  document.querySelectorAll('main button[aria-expanded="false"], [role="main"] button[aria-expanded="false"]')
    .forEach((b, i) => { if (i < 60) { try { b.click() } catch (e) {} } })

  const BLOCKS = "h1, h2, h3, h4, h5, p, li, dt, dd, td, th, summary, blockquote"
  const root = document.querySelector("[data-backpocket=policy]") || document.querySelector("main")
    || document.querySelector("[role=main]") || document.querySelector("article") || document.body
  const hidden = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute("aria-hidden") === "true" || n.hidden) return true
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true
    }
    const r = el.getBoundingClientRect()
    return r.width === 0 || r.height === 0
  }
  const seen = new Set()
  const lines = []
  root.querySelectorAll(BLOCKS).forEach((el) => {
    const outer = el.parentElement && el.parentElement.closest(BLOCKS)
    if (outer && root.contains(outer)) return
    if (el.closest("nav, header, footer, script, style, noscript, template")) return
    if (hidden(el)) return
    const t = el.innerText.replace(/\s+/g, " ").trim()
    if (t.length < 2 || seen.has(t)) return
    seen.add(t)
    lines.push(t)
  })
  let text = lines.join("\n")
  if (text.length < 200) text = root.innerText.replace(/\n{3,}/g, "\n\n").trim()
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({ text: (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(), href: a.href }))
    .filter((l) => l.text && l.href.startsWith("http"))
    .slice(0, 800)
  return { text: text.slice(0, 60000), title: document.title, url: location.href, links }
}
"""


class _VisibleText(HTMLParser):
    """Visible text of static HTML, judged by attributes (no styles are
    computed here): drops scripts, nav/header/footer, and anything marked
    hidden, aria-hidden, or inline display:none / visibility:hidden.
    Same rules as extension/lib/policy.ts."""

    SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "nav", "header", "footer", "iframe"}
    VOID = {"br", "img", "input", "meta", "link", "hr", "source", "area", "base", "col", "embed", "wbr"}
    BLOCKS = {"p", "li", "h1", "h2", "h3", "h4", "h5", "dt", "dd", "td", "th", "tr", "div", "section",
              "article", "summary", "blockquote", "br"}
    HIDDEN_STYLE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden", re.I)

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip: list[str] = []
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.VOID:
            if tag == "br" and not self.skip:
                self.parts.append("\n")
            return
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.append(tag)
            return
        hidden = (
            tag in self.SKIP_TAGS or "hidden" in a or a.get("aria-hidden") == "true"
            or self.HIDDEN_STYLE.search(a.get("style") or "")
        )
        if hidden:
            self.skip.append(tag)
        elif tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
            return
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

    def text(self) -> str:
        lines = (re.sub(r"[ \t\r\f\v]+", " ", ln).strip() for ln in "".join(self.parts).split("\n"))
        out, seen = [], set()
        for ln in lines:
            if len(ln) >= 2 and ln not in seen:
                seen.add(ln)
                out.append(ln)
        return "\n".join(out)


def _fetch_static(url: str) -> dict:
    """Fallback for sites that block automated browsers but serve plain requests."""
    snap = {"url": url, "status": "ok", "http": None, "text": "", "links": [], "via": "http", "fetched_at": _now()}
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9"},
                      follow_redirects=True, timeout=25)
        snap["http"] = r.status_code
        parser = _VisibleText()
        parser.feed(r.text)
        text = parser.text()
        title = re.search(r"<title[^>]*>(.*?)</title>", r.text, re.S | re.I)
        snap.update(text=text[:60000], final_url=str(r.url), title=(title.group(1).strip() if title else ""))
        if r.status_code in (404, 410):
            snap["status"] = "not_found"
        elif r.status_code >= 400 or BLOCKED.search(snap["title"] + " " + text[:3000]):
            snap["status"] = "blocked"
        elif len(text) < MIN_CHARS:
            snap["status"] = "too_short"
    except Exception as e:
        snap.update(status="error", error=str(e).splitlines()[0][:200])
    return snap


def _render(page, url: str) -> dict:
    snap = {"url": url, "status": "ok", "http": None, "text": "", "links": [], "fetched_at": _now()}
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        snap["http"] = resp.status if resp else None
        try:
            page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass  # some help centers keep long-polling; the content is usually there
        page.wait_for_timeout(1500)
        page.evaluate(COLLECT_JS)  # first pass opens accordions
        page.wait_for_timeout(800)
        got = page.evaluate(COLLECT_JS)
        snap.update(text=got["text"], links=got["links"], final_url=got["url"], title=got["title"])
        http = snap["http"] or 200
        if http in (404, 410):
            snap["status"] = "not_found"
        elif http >= 400 or BLOCKED.search(got["title"] + " " + got["text"][:3000]):
            snap["status"] = "blocked"
        elif len(got["text"]) < MIN_CHARS:
            snap["status"] = "too_short"
    except Exception as e:
        snap.update(status="error", error=str(e).splitlines()[0][:200])
    return snap


def _same_site(url: str, domains: list[str]) -> bool:
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in domains)


def _discover(topic: str, r: dict, snaps: list[dict], tried: set[str]) -> str | None:
    """A same-site link whose text names this topic, from pages we already rendered."""
    pattern = TOPIC_LINKS.get(topic)
    if not pattern:
        return None
    for snap in snaps:
        for link in snap.get("links", []):
            href = link["href"].split("#")[0]
            if href not in tried and _same_site(href, r["domains"]) and pattern.search(link["text"]):
                return href
    return None


def render_pages(retailers: list[dict], refetch: bool, headed: bool) -> None:
    """Render every page that has no snapshot yet (or all, with --refetch)."""
    if refetch:
        for r in retailers:
            for old in (RAW / r["id"]).glob("*.json"):
                old.unlink()
    todo = [
        (r, page) for r in retailers for page in r["pages"]
        if not (RAW / r["id"] / f"{page['topic']}.json").exists()
    ]
    if not todo:
        return
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chromium", headless=not headed)
        ctx = browser.new_context(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900}, locale="en-US")
        page = ctx.new_page()
        rendered: dict[str, list[dict]] = {}
        for r, p in todo:
            snap = _render(page, p["url"])
            if snap["status"] in ("blocked", "too_short", "error"):
                fallback = _fetch_static(p["url"])
                if fallback["status"] == "ok":
                    print(f"    {r['id']}: browser got {snap['status']}; plain request worked")
                    snap = fallback
            rendered.setdefault(r["id"], []).append(snap)
            _save(r, p["topic"], p["topic"], snap)
        # A page that moved (404, error, empty): follow a same-site link that
        # names the topic, found on this retailer's other rendered pages.
        for r, p in todo:
            snap = json.loads((RAW / r["id"] / f"{p['topic']}.json").read_text(encoding="utf-8"))
            if snap["status"] in ("ok", "blocked"):
                continue
            tried = {p["url"]}
            href = _discover(p["topic"], r, rendered.get(r["id"], []) + [snap], tried)
            if href:
                found = _render(page, href)
                found["discovered_from"] = p["url"]
                rendered[r["id"]].append(found)
                print(f"    {r['id']}: {p['topic']} page was {snap['status']}; found link -> {href}")
                if found["status"] == "ok":
                    _save(r, p["topic"], p["topic"], found)
        # One hop deeper: a topic page that points to the fuller policy.
        for r, p in todo:
            snap = json.loads((RAW / r["id"] / f"{p['topic']}.json").read_text(encoding="utf-8"))
            pattern = DEEPER_LINKS.get(p["topic"])
            if snap["status"] != "ok" or not pattern:
                continue
            seen = {s["url"] for s in rendered.get(r["id"], [])} | {snap["url"]}
            href = next(
                (l["href"].split("#")[0] for l in snap.get("links", [])
                 if pattern.search(l["text"]) and _same_site(l["href"], r["domains"])
                 and l["href"].split("#")[0] not in seen),
                None,
            )
            if href:
                deeper = _render(page, href)
                deeper["discovered_from"] = snap["url"]
                print(f"    {r['id']}: {p['topic']} page links to its fuller policy -> {href}")
                if deeper["status"] == "ok":
                    _save(r, f"{p['topic']}-detail", p["topic"], deeper)
        browser.close()


def _save(r: dict, key: str, topic: str, snap: dict) -> None:
    snap["topic"] = topic
    dest = RAW / r["id"] / f"{key}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(snap, indent=2), encoding="utf-8")
    print(f"  rendered {r['id']:<18} {key:<24} {snap['status']:<9} {len(snap['text']):>6} chars")


def ingest(r: dict, fresh: bool) -> dict:
    pages_meta, extracted = [], []
    order = {p["topic"]: i for i, p in enumerate(r["pages"])}
    snaps = [json.loads(f.read_text(encoding="utf-8")) for f in sorted((RAW / r["id"]).glob("*.json"))]
    snaps.sort(key=lambda sn: (order.get(sn.get("topic"), 99), "discovered_from" in sn))
    for snap in snaps:
        p = {"topic": snap.get("topic", "returns")}
        url = snap["url"]
        meta = {"topic": p["topic"], "url": url, "status": snap["status"], "chars": len(snap["text"])}
        if snap.get("discovered_from"):
            meta["registry_url"] = snap["discovered_from"]
        if snap["status"] == "ok":
            try:
                ext: PolicyExtraction = extract.policy_page(snap["text"], url, fresh=fresh)
                extracted.append((p["topic"], ext))
            except Exception as e:  # one bad page shouldn't sink the retailer
                meta.update(status="extract_error", error=str(e)[:200])
        pages_meta.append(meta)

    policy = None
    if extracted:
        merged = extract.merge_pages(extracted)
        main_url = next((m["url"] for m in pages_meta if m["topic"] == "returns" and m["status"] == "ok"),
                        next((m["url"] for m in pages_meta if m["status"] == "ok"), r["pages"][0]["url"]))
        policy = extract.to_merchant_policy(merged, r["name"], main_url, "", retailer_id=r["id"]).model_dump()

    record = {
        "id": r["id"],
        "name": r["name"],
        "domains": r["domains"],
        "notes": r.get("notes", ""),
        "ingested_at": _now(),
        "pages": pages_meta,
        "policy": policy,
    }
    (OUT / f"{r['id']}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return record


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cell(c: dict | None, unit: str = "d") -> str:
    if not c or c.get("value") is None:
        return "-"
    v = c["value"]
    mark = "" if c.get("confidence") == "high" else "?"
    return (f"{v}{unit}" if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v)) + mark


def report(records: list[dict]) -> None:
    print(f"\n{'retailer':<20}{'pages':<8}{'return':<9}{'adjust?':<9}{'adj win':<9}{'warranty':<10}how to ask")
    for rec in records:
        ok = sum(1 for p in rec["pages"] if p["status"] == "ok")
        pol = rec["policy"]
        if not pol:
            print(f"{rec['name'][:19]:<20}{ok}/{len(rec['pages']):<6}(no readable pages: "
                  + ", ".join(f"{p['topic']}={p['status']}" for p in rec["pages"]) + ")")
            continue
        pm = pol["price_match"]
        how = (pol["how_to_request"].get("value") or "-")[:40]
        ret = "none" if pol.get("returns_unlimited", {}).get("value") else _cell(pol["return_window_days"])
        print(f"{rec['name'][:19]:<20}{ok}/{len(rec['pages']):<6}{ret:<9}"
              f"{_cell(pm['allowed'], ''):<9}{_cell(pm['window_days']):<9}"
              f"{_cell(pol['manufacturer_warranty_months'], 'mo'):<10}{how}")
    print("  ? = value found but its quote wasn't verified word for word (shown to shoppers as 'please double-check')")
    print("  return 'none' = no time limit on returns")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated retailer ids")
    ap.add_argument("--refetch", action="store_true")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--registry", type=Path, default=REGISTRY, help="registry JSON (default data/retailers.json)")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env")
    retailers = json.loads(args.registry.read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        retailers = [r for r in retailers if r["id"] in wanted]
        missing = wanted - {r["id"] for r in retailers}
        if missing:
            print(f"unknown retailer ids: {', '.join(sorted(missing))}")
            return 1
    OUT.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    print(f"Rendering pages for {len(retailers)} retailers...")
    render_pages(retailers, args.refetch, args.headed)
    print("Extracting and merging...")
    records = []
    for r in retailers:
        rec = ingest(r, args.fresh)
        records.append(rec)
        print(f"  {r['id']:<18} {'ok' if rec['policy'] else 'NO POLICY'}")
    report(records)
    print(f"\nDone in {time.time() - t0:.0f}s. Wrote {len(records)} files to {OUT.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
