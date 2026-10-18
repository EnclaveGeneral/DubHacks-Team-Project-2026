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
| `extension/` | Chrome extension (Plasmo, MV3) | n/a |
| `content/` | Store policy and fictional card benefits guides | n/a |
| `shared/fixtures/` | Example API responses (checked against schemas by tests) | n/a |

## One-time setup

```sh
# Python (one venv for both servers)
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r service/requirements.txt -r store-server/requirements.txt

# Node
cd store && npm install && cd ..
cd extension && npm install && cd ..

# API key
cp .env.example .env   # then paste your ANTHROPIC_API_KEY
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

## Run the demo (four terminals)

```sh
cd store-server && ../.venv/Scripts/python -m uvicorn main:app --port 8001 --reload
cd service      && ../.venv/Scripts/python -m uvicorn app.main:app --port 8000 --reload
cd store        && npm run dev
cd extension    && npm run dev
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/build/chrome-mv3-dev`. Click the BackPocket icon to open the side panel.

Open http://localhost:5173 for the store. Reset everything with the **Reset** button in the side panel (or `POST localhost:8000/demo/reset`).

Demo flow: open the **Ridgeline Rain Jacket**, pick a size, **Buy now** → **Place order** → on the confirmation page tick **Protect this purchase** → skip to day **3** in the panel → **Prepare claim form** → add an email and submit the form yourself → skip to days **20** and **28**.

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
