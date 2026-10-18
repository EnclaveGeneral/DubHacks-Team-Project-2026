# BackPocket

Post-purchase agent for DubHacks 2026 (Visa track). It reads the store's policy and your card's benefits guide, alerts you to price drops and closing windows, and pre-fills claim forms you submit yourself.

- [PLAN.md](PLAN.md): what we're building and why
- [IMPLEMENTATION.md](IMPLEMENTATION.md): contracts, demo numbers, hour-by-hour plan

## Layout

| Folder | What | Port |
| --- | --- | --- |
| `store/` | Mock Ridgeline Outfitters store (Vite + React) | 5173 |
| `store-server/` | Store prices + claim intake (FastAPI) | 8001 |
| `service/` | BackPocket service: extraction, rules engine, drafter (FastAPI) | 8000 |
| `web/` | BackPocket website: every tracked purchase, price charts, deadlines, cited clauses, message drafting (Vite + React) | 5174 |
| `extension/` | Chrome extension (Plasmo, MV3): the side panel summarizes the current store and links to the website | n/a |
| `content/` | Store policies (Ridgeline, plus fictional Fjord & Pine and Hearthside Home) and fictional card benefits guides | n/a |
| `shared/ui/` | Types, date/money helpers, alert explanations, and message drafting used by both the extension and the website | n/a |
| `shared/fixtures/` | Example API responses (checked against schemas by tests) | n/a |

## One-time setup

```sh
# Python (one venv for both servers)
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r service/requirements.txt -r store-server/requirements.txt

# Node
cd store && npm install && cd ..
cd web && npm install && cd ..
cd extension && npm install && cd ..

# API key
cp .env.example .env   # then paste your ANTHROPIC_API_KEY
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

## Run the demo

`service/app/cache/` (Claude's extraction results) is not committed. On a new machine, build it once before the demo so nothing waits on the API live:

```sh
make warm      # reads both card guides and the Ridgeline policy; needs ANTHROPIC_API_KEY
```

It skips anything already cached (`make warm ARGS=--fresh` re-extracts), and needs no servers running. Without `make`: `.venv/Scripts/python service/warm_cache.py`.

From the repo root, one terminal:

```sh
make demo      # same as: npm run dev
```

This starts the store server (8001), the service (8000), the store (5173), the website (5174), and the extension build, with each line of output tagged by process. It keeps them running:

- A process that exits is restarted automatically (with backoff if it keeps crashing).
- A server that stops answering its health check three times in a row is restarted.
- A port still held by a process from an earlier run is freed before starting.
- Ctrl+C stops everything.

While it runs, type a command and press Enter: `r` restarts everything, `r service` (or `store-server`, `store`, `web`, `extension`) restarts one, `s` shows status, `q` quits. Each process's output is also saved to `.logs/<name>.log`.

<details>
<summary>Running the five processes by hand instead</summary>

```sh
cd store-server && ../.venv/Scripts/python -m uvicorn main:app --port 8001 --reload
cd service      && ../.venv/Scripts/python -m uvicorn app.main:app --port 8000 --reload
cd store        && npm run dev
cd web          && npm run dev
cd extension    && npm run dev
```

</details>

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/build/chrome-mv3-dev`. Click the BackPocket icon to open the side panel.

Open http://localhost:5173 for the store and http://localhost:5174 for the BackPocket website. Reset everything with the **Reset** button in the side panel or the website's demo bar (or `POST localhost:8000/demo/reset`). Reset also adds five sample purchases from two fictional stores (Fjord & Pine Outdoor Co. and Hearthside Home) so the website has more than one store to show; they have no store pages, and their prices follow the demo clock. `POST localhost:8000/demo/reset?seed=true` does the same; a plain `POST /demo/reset` leaves the list empty (the e2e scripts rely on that), and `POST /demo/seed` adds or restores just the sample purchases.

### Extension and website

The side panel is the in-the-moment view: it shows purchases from the store in the current tab, the one thing to act on, and the next deadline. **More details** opens that purchase on the website, which has the price chart, every deadline, the quoted clauses, the card's terms, and **Draft a request message** (copy it, then **I've sent it** marks the claim filed). For stores with a web form, **Prepare claim form** on either one opens the store's form and the extension fills it in; you review and submit it yourself.

Demo flow: open the **Ridgeline Rain Jacket**, pick a size, **Buy now** → **Place order** → on the confirmation page tick **Protect this purchase** → skip to day **3** in the panel → **Prepare claim form** → add an email and submit the form yourself → skip to days **20** and **28**.

### Real stores

BackPocket also reads policies on real retailers' sites. Open a store's return or price-adjustment policy page (for example [Target's Price Match Guarantee](https://www.target.com/help/articles/policies-guidelines/price-match-guarantee)) and choose **Read this page** in the panel. It shows the windows, how to ask, and the conditions, each with the page's own wording. From there, **Track a purchase** adds an order by hand. BackPocket can't check prices on real sites, so use **Saw a lower price?** on the purchase's page on the website when you spot a drop; for stores without a web form, **Draft a request message** (there, or from the panel's button, which opens it there) writes a message citing the policy for you to send through the store's chat or email.

For the 20 largest US retailers (by the NRF Top 100 list, skipping grocery, pharmacy, and convenience chains), BackPocket already has the full policy: **Read this page** anywhere on, say, nordstrom.com returns Nordstrom's terms merged from its returns page and its pricing policy page, each term quoted and linked to the page it came from. See [Retailer policy dataset](#retailer-policy-dataset).

Reading any page needs the extension's `<all_urls>` host permission. It only reads a page when you click **Read this page**.

## Retailer policy dataset

`data/retailers.json` lists each retailer's official policy pages (returns, price adjustment). `service/ingest.py` turns it into `data/policies/<id>.json`:

1. Renders each page in Chromium (most help centers are JavaScript-rendered or block plain fetches) and reads the visible text, opening collapsed sections.
2. If a page moved (404, empty), follows a same-site link whose text names the topic; if a page points to a fuller policy ("View our Pricing Policy for details"), reads that too.
3. Extracts each page with Claude, checks every quote word for word against that page, and merges the pages field by field (returns terms from the returns page, adjustment terms from the adjustment page), keeping the source page on every term.

```sh
cd service
../.venv/Scripts/python ingest.py                     # all retailers (re-uses page snapshots and the extraction cache)
../.venv/Scripts/python ingest.py --only macys --refetch   # re-render one retailer's pages
../.venv/Scripts/python ingest.py --headed            # visible browser, for sites that block headless
```

It prints a coverage table. Retailers whose pages block automated browsers are reported as blocked and fall back to reading the open page live. `GET /retailers` on the service lists what's ingested.

## Tests

```sh
cd service && ../.venv/Scripts/python -m pytest -q
cd store-server && ../.venv/Scripts/python -m pytest -q
```

`service/tests/test_fixtures.py` fails if a fixture drifts from the schemas or quotes text that isn't in `/content`.

### Full demo walk in a real browser

Drives the demo in Chromium with the extension loaded: protect the purchase, check the timeline, fill and submit the claim form on day 3, then check days 20 and 28. Run it with the three servers up.

```sh
.venv/Scripts/python -m pip install -r e2e/requirements.txt
.venv/Scripts/python -m playwright install chromium
cd extension && npx plasmo build && cd ..
.venv/Scripts/python e2e/demo_walk.py            # add --headed to watch
```

It resets the demo first. The first run on a new policy text calls Claude (about 15 s); later runs use `service/app/cache/`.

`e2e/web_walk.py` walks the website with the extension loaded: the five sample purchases on the dashboard and the store filter, drafting a message and marking it sent, the website's **Prepare claim form** button filling the Ridgeline form through the extension, and the panel's **More details** links. It needs the store, store server, service, and website running (`make demo`), and it resets the demo with the sample purchases first, so run `demo_walk.py` and `web_walk.py` one at a time.

```sh
.venv/Scripts/python e2e/web_walk.py             # add --headed to watch
```

`e2e/chart_overlaps.py` renders every purchase's price chart on the website for days 0-30 at desktop and phone widths and fails if any label touches a line, the end dot, or another label.

`e2e/real_policy.py` runs the same extension against Target's live price-match page (needs internet; one Claude call per new version of the page text).
