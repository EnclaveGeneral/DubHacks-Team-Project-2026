"""Mock card catalog. Guides are fictional and live in /content."""

from pathlib import Path

from .schemas import CardCatalogEntry

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"

CATALOG = [
    CardCatalogEntry(
        card_id="northwind-4417",
        display_name="Visa ending 4417",
        product_name="Northwind Rewards Visa",
        last4="4417",
        guide_path="northwind-rewards-visa-4417.md",
    ),
    CardCatalogEntry(
        card_id="cascade-9021",
        display_name="Visa ending 9021",
        product_name="Cascade Cash Visa",
        last4="9021",
        guide_path="cascade-cash-visa-9021.md",
    ),
]


def find(card_id: str) -> CardCatalogEntry | None:
    return next((c for c in CATALOG if c.card_id == card_id), None)


def guide_text(card: CardCatalogEntry) -> str:
    return (CONTENT_DIR / card.guide_path).read_text(encoding="utf-8")
