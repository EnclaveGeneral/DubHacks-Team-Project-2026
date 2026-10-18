import { isoDate, longDate } from "./format"
import type { Alert, ClockState, FormField, TrackedPurchase } from "./types"

// Text BackPocket writes for the shopper to review and send. Pure functions of
// the order, the alert, and the clock; nothing here is sent anywhere.

// The alert's first citation is the clause the request relies on: the price
// adjustment clause for a price drop, the return clause for a return.
const isReturn = (alert: Alert) => alert.action === "prepare_return"

function justification(tp: TrackedPurchase, alert: Alert, date: string): string {
  const p = tp.purchase
  const cite = alert.citations[0]
  const clause = cite?.quote
    ? ` ${cite.clause ? `Clause ${cite.clause} of your policy` : "Your policy"} states: "${cite.quote}"`
    : ""
  if (isReturn(alert)) {
    return (
      `I'd like to return the ${p.item_name} (order ${p.order_id}), bought for $${p.price_paid.toFixed(2)} ` +
      `on ${longDate(date)}. It's unworn with the original tags attached and within the return window.${clause}`
    )
  }
  const current = p.price_paid - (alert.money?.refund ?? 0)
  return (
    `I bought the ${p.item_name} (order ${p.order_id}) for $${p.price_paid.toFixed(2)} on ${longDate(date)}. ` +
    `${p.merchant} now sells the same item for $${current.toFixed(2)}.${clause} ` +
    `I am requesting a price adjustment of $${(alert.money?.refund ?? 0).toFixed(2)}.`
  )
}

/** Maps a store form's fields to values from the order and the alert. */
export function localDraft(
  fields: FormField[],
  tp: TrackedPurchase,
  alert: Alert,
  clock: ClockState
): { key: string; value: string }[] {
  const p = tp.purchase
  const date = isoDate(clock.base_date, p.purchase_day)
  const ret = isReturn(alert)
  const current = p.price_paid - (alert.money?.refund ?? 0)
  const values: { key: string; value: string }[] = []

  for (const f of fields) {
    const label = f.label.toLowerCase()
    let value: string | undefined
    if (f.type === "select") {
      value = f.options.find((o) => (ret ? /return/i : /price/i).test(o.text))?.value
    } else if (/order/.test(label)) value = p.order_id
    else if (/item|product/.test(label)) value = p.item_name
    else if (/paid/.test(label)) value = p.price_paid.toFixed(2)
    else if (/current|lowest|new price|sale/.test(label)) value = ret ? undefined : current.toFixed(2)
    else if (/date/.test(label)) value = date
    else if (f.type === "textarea" || /reason|explain|detail/.test(label))
      value = justification(tp, alert, date)
    if (value !== undefined) values.push({ key: f.key, value })
  }
  return values
}

// For stores without a web form: a message to paste into the store's chat or
// email, quoting the clause it relies on.
export function draftMessage(tp: TrackedPurchase, alert: Alert, clock: ClockState): string {
  const p = tp.purchase
  const date = longDate(isoDate(clock.base_date, p.purchase_day))
  const order = p.order_id && !p.order_id.startsWith("M-") ? ` (order ${p.order_id})` : ""
  const cite = alert.citations[0]
  const policyRef = cite?.quote
    ? `Your policy${cite.clause ? ` (section ${cite.clause})` : ""} says: "${cite.quote}"`
    : ""
  if (isReturn(alert)) {
    return [
      "Hi,",
      "",
      `I'd like to return the ${p.item_name} I bought on ${date} for $${p.price_paid.toFixed(2)}${order}. ` +
        "It's unworn with the original tags attached.",
      policyRef,
      "",
      "Could you tell me how to send it back for a refund to my original form of payment?",
      "",
      "Thank you!"
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n")
  }
  const refund = alert.money?.refund ?? 0
  const current = p.price_paid - refund
  return [
    "Hi,",
    "",
    `I bought the ${p.item_name} on ${date} for $${p.price_paid.toFixed(2)}${order}.`,
    `It's now listed at $${current.toFixed(2)}. ${policyRef}`.trim(),
    "",
    `Could you please adjust my purchase by the $${refund.toFixed(2)} difference? I can provide my receipt or order confirmation.`,
    "",
    "Thank you!"
  ].join("\n")
}
