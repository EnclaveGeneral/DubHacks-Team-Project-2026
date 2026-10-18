// Mirrors service/app/schemas.py. If you change one, change the other.

export type Confidence = "high" | "low"

export interface Cited<T> {
  value: T | null
  quote: string | null
  clause: string | null
  confidence: Confidence
}

export interface MerchantPolicy {
  merchant: string
  source_url: string
  return_window_days: Cited<number>
  exchange_window_days: Cited<number>
  price_match: {
    allowed: Cited<boolean>
    window_days: Cited<number>
    conditions: Cited<string>[]
  }
  manufacturer_warranty_months: Cited<number>
  claim_form_url: string
}

export interface Protection {
  type: "extended_warranty" | "return_protection"
  extends_months: Cited<number>
  max_original_warranty_months: Cited<number>
  window_days: Cited<number>
  max_amount_dollars: Cited<number>
}

export interface CardBenefits {
  card_id: string
  display_name: string
  earn_rate_points_per_dollar: Cited<number>
  point_value_cents: Cited<number>
  reversal_rule: Cited<"proportional" | "full" | "none" | "threshold">
  reversal_threshold_dollars: Cited<number>
  protections: Protection[]
}

export interface CardCatalogEntry {
  card_id: string
  display_name: string
  product_name: string
  last4: string
}

export interface Purchase {
  order_id: string
  merchant: string
  sku: string
  item_name: string
  price_paid: number
  card_last4: string
  purchase_day: number
  policy_url: string
  claim_form_url: string
}

export interface TimelineWindow {
  label: string
  source: "merchant" | "card"
  opens_day: number
  closes_day: number
  status: "open" | "closing_soon" | "closed" | "claimed"
  long_term: boolean
  citation: Cited<string | number | boolean>
}

export interface TrackedPurchase {
  purchase: Purchase
  policy: MerchantPolicy
  timeline: TimelineWindow[]
  lowest_seen: number
  price_history: Record<string, number>
  claims_filed: string[]
}

export interface SelectedCard {
  card_id: string
  last4: string
  benefits: CardBenefits
}

export interface Alert {
  id: string
  purchase_id: string
  kind: "price_drop_claimable" | "price_drop_declined" | "window_closing" | "card_protection"
  title: string
  body: string
  money: {
    refund: number
    points_reversed: number
    net_estimate: number
    is_estimate: boolean
  } | null
  citations: Cited<string | number | boolean>[]
  action: "prepare_claim" | null
  created_day: number
}

export interface FormField {
  key: string
  label: string
  type: string
  options: { value: string; text: string }[]
}

export interface DraftResponse {
  values: { key: string; value: string; reason: string }[]
  justification: string
  unfilled: string[]
}

export interface ClockState {
  day: number
  base_date: string
}
