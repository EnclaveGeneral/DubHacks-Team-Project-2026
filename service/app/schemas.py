"""Data contracts shared by the service and the extension.

This file is the source of truth. Example JSON for each model lives in
/shared/fixtures so the extension can be built before the service is done.
See IMPLEMENTATION.md section 3.
"""

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

Confidence = Literal["high", "low"]


class Cited(BaseModel, Generic[T]):
    """An extracted value plus the exact sentence it came from.

    A field that is genuinely absent from the document is
    value=None, quote=None, clause=None, confidence="high".
    """

    value: T | None = None
    quote: str | None = None
    clause: str | None = None
    confidence: Confidence = "high"


# ---------- Merchant policy ----------


class PriceMatch(BaseModel):
    allowed: Cited[bool]
    window_days: Cited[int]
    conditions: list[Cited[str]] = []


class MerchantPolicy(BaseModel):
    merchant: str
    source_url: str
    return_window_days: Cited[int]
    exchange_window_days: Cited[int]
    price_match: PriceMatch
    manufacturer_warranty_months: Cited[int]
    claim_form_url: str  # "" when the store has no web form (claims go by chat, phone, or email)
    how_to_request: Cited[str] = Cited()  # e.g. "chat online or call 1-800-..."


# ---------- Card benefits ----------

ReversalRule = Literal["proportional", "full", "none", "threshold"]
ProtectionType = Literal["extended_warranty", "return_protection"]


class Protection(BaseModel):
    type: ProtectionType
    extends_months: Cited[int] = Cited()
    max_original_warranty_months: Cited[int] = Cited()
    window_days: Cited[int] = Cited()
    max_amount_dollars: Cited[float] = Cited()


class CardBenefits(BaseModel):
    card_id: str
    display_name: str
    earn_rate_points_per_dollar: Cited[float]
    point_value_cents: Cited[float]
    reversal_rule: Cited[ReversalRule]
    reversal_threshold_dollars: Cited[float] = Cited()
    protections: list[Protection] = []


class CardCatalogEntry(BaseModel):
    card_id: str
    display_name: str
    product_name: str
    last4: str
    guide_path: str


# ---------- Purchase ----------


class Purchase(BaseModel):
    order_id: str
    merchant: str
    sku: str
    item_name: str
    price_paid: float
    card_last4: str
    purchase_day: int
    policy_url: str
    claim_form_url: str


class NewPurchaseRequest(BaseModel):
    purchase: Purchase
    policy_text: str  # cleaned by the extension
    manual: bool = False  # entered by the shopper: keep their purchase_day instead of "today"


class ReadPolicyRequest(BaseModel):
    url: str
    text: str  # visible text of the shopper's open tab
    site_name: str | None = None


class ReportPrice(BaseModel):
    price: float


# ---------- Engine output ----------

WindowStatus = Literal["open", "closing_soon", "closed", "claimed"]
AlertKind = Literal[
    "price_drop_claimable", "price_drop_declined", "window_closing", "card_protection"
]


class TimelineWindow(BaseModel):
    label: str
    source: Literal["merchant", "card"]
    opens_day: int
    closes_day: int
    status: WindowStatus
    long_term: bool = False  # true for warranty windows (shown in the separate row)
    citation: Cited[str | int | float | bool]


class Money(BaseModel):
    refund: float
    points_reversed: int
    net_estimate: float
    is_estimate: bool = True


class Alert(BaseModel):
    id: str
    purchase_id: str
    kind: AlertKind
    title: str
    body: str
    money: Money | None = None
    citations: list[Cited[str | int | float | bool]] = []
    action: Literal["prepare_claim"] | None = None
    created_day: int


class TrackedPurchase(BaseModel):
    purchase: Purchase
    policy: MerchantPolicy
    timeline: list[TimelineWindow]
    lowest_seen: float
    price_history: dict[int, float] = {}  # sim day -> store price observed that day
    claims_filed: list[str] = []  # claim types, e.g. "price_match"


class SelectedCard(BaseModel):
    card_id: str
    last4: str
    benefits: CardBenefits


class ClaimFiled(BaseModel):
    claim_type: Literal["price_match", "return"]
    confirmation: str | None = None


# ---------- Form drafting ----------


class FormFieldOption(BaseModel):
    value: str
    text: str


class FormField(BaseModel):
    key: str
    label: str
    type: str  # text | email | number | date | select | textarea
    options: list[FormFieldOption] = []


class DraftRequest(BaseModel):
    purchase_id: str
    claim_type: Literal["price_match", "return"]
    fields: list[FormField]


class DraftValue(BaseModel):
    key: str
    value: str
    reason: str


class DraftResponse(BaseModel):
    values: list[DraftValue]
    justification: str
    unfilled: list[str] = []


# ---------- Clock ----------


class ClockState(BaseModel):
    day: int
    base_date: str  # ISO date of day 0; UI shows base_date + day


class PanelState(BaseModel):
    """Everything the side panel shows, in one poll."""

    clock: ClockState
    purchases: list["TrackedPurchase"]
    alerts: list["Alert"]
    selected_card: "SelectedCard | None"
