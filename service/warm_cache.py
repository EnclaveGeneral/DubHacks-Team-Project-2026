"""Builds the extraction cache for the demo documents (`make warm`).

service/app/cache/ is not committed, so a fresh checkout has to ask Claude to
read the demo documents once: both card benefits guides and the Ridgeline
policy. Run this ahead of time (it needs ANTHROPIC_API_KEY) so the live demo
never waits on, or fails because of, a network call.

    .venv/Scripts/python service/warm_cache.py            # fill what's missing
    .venv/Scripts/python service/warm_cache.py --fresh    # re-extract everything

Needs no running servers. Documents that are already cached are skipped.
"""

import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from app import cards, extract  # noqa: E402  (after load_dotenv so the key is set)

RIDGELINE_POLICY = cards.CONTENT_DIR / "ridgeline-policy.md"
RIDGELINE_URL = "http://localhost:5173/policy.html"


def ridgeline_policy_text() -> str:
    """The text the extension sends for the Ridgeline policy.

    Mirrors store/scripts/build-policy.mjs (md -> policy.html) followed by
    extension/lib/policy.ts (policy section -> one line per block). The cache is
    keyed on this text, so it has to match what the extension sends. If either
    of those files changes how the policy is rendered, update this too.
    """
    lines: list[str] = []
    for raw in RIDGELINE_POLICY.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("# "):  # the title sits outside the policy section
            continue
        if line.startswith("## "):
            line = line[3:]
        lines.append(re.sub(r"\s+", " ", line).strip())
    return "\n".join(lines)


def cache_files() -> set[Path]:
    return set(extract.CACHE_DIR.glob("*.json")) if extract.CACHE_DIR.exists() else set()


def warm(label: str, run) -> bool:
    before = cache_files()
    start = time.monotonic()
    try:
        run()
    except Exception as e:  # noqa: BLE001  (report and keep going so one failure doesn't hide the rest)
        print(f"FAIL   {label}: {e}")
        return False
    took = time.monotonic() - start
    created = cache_files() - before
    if created:
        print(f"BUILT  {label} ({took:.0f}s) -> {', '.join(sorted(p.name for p in created))}")
    else:
        print(f"cached {label}")
    return True


def main(fresh: bool) -> int:
    if not os.environ.get("ANTHROPIC_API_KEY") and (fresh or not _everything_cached()):
        print("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.")
        return 1

    results = [
        warm(
            f"card: {card.product_name}",
            lambda card=card: extract.card_benefits(
                cards.guide_text(card), card.card_id, card.display_name, fresh=fresh
            ),
        )
        for card in cards.CATALOG
    ]
    results.append(
        warm(
            "policy: Ridgeline Outfitters",
            lambda: extract.merchant_policy(
                ridgeline_policy_text(), "Ridgeline Outfitters", RIDGELINE_URL, "", fresh=fresh
            ),
        )
    )

    failed = results.count(False)
    print(f"\n{'Cache is ready.' if not failed else f'{failed} of {len(results)} failed.'}")
    return 1 if failed else 0


def _everything_cached() -> bool:
    """True if a no-key run would be served entirely from the cache."""
    # Cheap check: try each document with a client that fails if it's ever called.
    original = extract._call

    def no_call(*_a, **_k):
        raise RuntimeError("not cached")

    extract._call = no_call
    try:
        for card in cards.CATALOG:
            extract.card_benefits(cards.guide_text(card), card.card_id, card.display_name)
        extract.merchant_policy(ridgeline_policy_text(), "Ridgeline Outfitters", RIDGELINE_URL, "")
        return True
    except RuntimeError:
        return False
    finally:
        extract._call = original


if __name__ == "__main__":
    sys.exit(main("--fresh" in sys.argv))
