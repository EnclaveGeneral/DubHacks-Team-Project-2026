import type { Purchase } from "./types"

// Builds a Purchase from a schema.org Order JSON-LD block. Returns null if the
// page has no usable order data.
export function purchaseFromJsonLd(doc: Document): Purchase | null {
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: any
    try {
      data = JSON.parse(el.textContent ?? "")
    } catch {
      continue
    }
    if (data?.["@type"] !== "Order") continue

    const offer = Array.isArray(data.acceptedOffer) ? data.acceptedOffer[0] : data.acceptedOffer
    const actions: any[] = data.potentialAction ?? []
    const target = (name: string) => actions.find((a) => a?.name === name)?.target ?? ""
    const last4 = String(data.paymentMethod ?? "").match(/(\d{4})\s*$/)?.[1] ?? ""

    if (!data.orderNumber || !offer?.price) return null
    return {
      order_id: String(data.orderNumber),
      merchant: String(data.seller?.name ?? location.hostname),
      sku: String(offer.itemOffered?.sku ?? ""),
      item_name: String(offer.itemOffered?.name ?? "Item"),
      price_paid: Number(offer.price),
      card_last4: last4,
      purchase_day: 0, // set from orderDate by the caller (see orderDateFromJsonLd)
      policy_url: target("policy"),
      claim_form_url: target("claim")
    }
  }
  return null
}

// The order's own date (YYYY-MM-DD) from the Order JSON-LD, if present.
export function orderDateFromJsonLd(doc: Document): string | null {
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(el.textContent ?? "")
      if (data?.["@type"] === "Order" && typeof data.orderDate === "string") {
        return data.orderDate.slice(0, 10)
      }
    } catch {
      // not JSON; keep looking
    }
  }
  return null
}

// Whole days from the demo calendar's day 0 to an ISO date.
export function dayOf(baseDate: string, isoDate: string): number {
  return Math.round((Date.parse(`${isoDate}T12:00:00Z`) - Date.parse(`${baseDate}T12:00:00Z`)) / 86400000)
}
