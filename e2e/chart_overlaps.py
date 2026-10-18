"""Checks every purchase chart on the BackPocket website for labels that touch
the price line, the paid line, the end dot, or each other.

Renders each tracked purchase's chart for demo days 0-30 at desktop and phone
widths and measures the real label boxes in the browser. Puts the demo clock
back where it was afterward; doesn't change purchases.

Needs the service (8000) and the website (5174) running.
Run:  .venv/Scripts/python e2e/chart_overlaps.py
"""
import sys

import httpx
from playwright.sync_api import sync_playwright

SERVICE = "http://127.0.0.1:8000"
SITE = "http://localhost:5174"
DAYS = list(range(0, 31))
WIDTHS = [1280, 390]

MEASURE = r"""
() => {
  const out = []
  for (const svg of document.querySelectorAll('.price-chart svg')) {
    const labels = [...svg.querySelectorAll('text.chart-label')].map((t) => {
      const b = t.getBBox(); return { text: t.textContent, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }
    })
    const segs = []
    const d = svg.querySelector('path.series')?.getAttribute('d') || ''
    let cx = 0, cy = 0
    for (const m of d.matchAll(/([MHV])\s*([-\d.]+)(?:,([-\d.]+))?/g)) {
      const [_, op, a, b] = m
      if (op === 'M') { cx = +a; cy = +b; continue }
      if (op === 'H') { segs.push({ kind: 'price', x0: cx, y0: cy, x1: +a, y1: cy }); cx = +a }
      if (op === 'V') { segs.push({ kind: 'price', x0: cx, y0: cy, x1: cx, y1: +a }); cy = +a }
    }
    const paid = svg.querySelector('line.paid')
    if (paid) segs.push({ kind: 'paid line', x0: +paid.getAttribute('x1'), y0: +paid.getAttribute('y1'), x1: +paid.getAttribute('x2'), y1: +paid.getAttribute('y2') })
    const dot = svg.querySelector('circle.end-dot')
    const dotBox = dot && { x0: +dot.getAttribute('cx') - 4.5, x1: +dot.getAttribute('cx') + 4.5, y0: +dot.getAttribute('cy') - 4.5, y1: +dot.getAttribute('cy') + 4.5 }
    out.push({ labels, segs, dotBox })
  }
  return out
}
"""


def hit(b, s, pad=1.0):
    x0, x1 = sorted((s["x0"], s["x1"]))
    y0, y1 = sorted((s["y0"], s["y1"]))
    return b["x0"] - pad < x1 and x0 < b["x1"] + pad and b["y0"] - pad < y1 and y0 < b["y1"] + pad


def boxes_hit(a, b):
    return a["x0"] < b["x1"] and b["x0"] < a["x1"] and a["y0"] < b["y1"] and b["y0"] < a["y1"]


start_day = httpx.get(f"{SERVICE}/clock").json()["day"]
problems, charts = [], 0
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for width in WIDTHS:
            page = b.new_page(viewport={"width": width, "height": 900})
            for day in DAYS:
                httpx.post(f"{SERVICE}/clock", json={"day": day}, timeout=10)
                for tp in httpx.get(f"{SERVICE}/purchases", timeout=10).json():
                    oid = tp["purchase"]["order_id"]
                    page.goto(f"{SITE}/purchases/{oid}")
                    page.locator(".price-chart svg").first.wait_for(timeout=10000)
                    page.wait_for_timeout(250)
                    for chart in page.evaluate(MEASURE):
                        charts += 1
                        labels = chart["labels"]
                        for lb in labels:
                            for s in chart["segs"]:
                                # "Paid" sits next to its own line by design; only the price line matters for it.
                                if lb["text"].startswith("Paid") and s["kind"] == "paid line":
                                    continue
                                if hit(lb, s):
                                    problems.append((width, day, oid, lb["text"], s["kind"]))
                            if chart["dotBox"] and boxes_hit(lb, chart["dotBox"]):
                                problems.append((width, day, oid, lb["text"], "end dot"))
                        for i in range(len(labels)):
                            for j in range(i + 1, len(labels)):
                                if boxes_hit(labels[i], labels[j]):
                                    problems.append((width, day, oid, labels[i]["text"], labels[j]["text"]))
            page.close()
        b.close()
finally:
    httpx.post(f"{SERVICE}/clock", json={"day": start_day}, timeout=10)

print(f"checked {charts} chart renders (days 0-30, widths {WIDTHS})")
for p in sorted(set(problems))[:25]:
    print("  OVERLAP", p)
print("NO OVERLAPS" if not problems else f"{len(set(problems))} overlaps")
sys.exit(1 if problems else 0)
