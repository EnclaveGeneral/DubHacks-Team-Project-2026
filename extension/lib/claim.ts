import type { Alert, ClockState, FormField, TrackedPurchase } from "./types"

// H5 fill spike: maps the form's fields to values in code from the order and
// the alert. TODO(B/C, hours 12–15): replace localDraft() with POST
// /claims/draft (LLM maps unfamiliar labels and writes the justification);
// keep this as the fallback when the service is unreachable.

export function isoDate(baseDate: string, day: number): string {
  const d = new Date(`${baseDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day)
  return d.toISOString().slice(0, 10)
}

function justification(tp: TrackedPurchase, alert: Alert, date: string): string {
  const p = tp.purchase
  const current = p.price_paid - (alert.money?.refund ?? 0)
  const cite = alert.citations[0]
  const clause = cite?.quote
    ? ` Clause ${cite.clause} of your policy states: "${cite.quote}"`
    : ""
  return (
    `I bought the ${p.item_name} (order ${p.order_id}) for $${p.price_paid.toFixed(2)} on ${date}. ` +
    `${p.merchant} now sells the same item for $${current.toFixed(2)}.${clause} ` +
    `I am requesting a price adjustment of $${(alert.money?.refund ?? 0).toFixed(2)}.`
  )
}

export function localDraft(
  fields: FormField[],
  tp: TrackedPurchase,
  alert: Alert,
  clock: ClockState
): { key: string; value: string }[] {
  const p = tp.purchase
  const date = isoDate(clock.base_date, p.purchase_day)
  const current = p.price_paid - (alert.money?.refund ?? 0)
  const values: { key: string; value: string }[] = []

  for (const f of fields) {
    const label = f.label.toLowerCase()
    let value: string | undefined
    if (f.type === "select") {
      value = f.options.find((o) => /price/i.test(o.text))?.value
    } else if (/order/.test(label)) value = p.order_id
    else if (/item|product/.test(label)) value = p.item_name
    else if (/paid/.test(label)) value = p.price_paid.toFixed(2)
    else if (/current|lowest|new price|sale/.test(label)) value = current.toFixed(2)
    else if (/date/.test(label)) value = date
    else if (f.type === "textarea" || /reason|explain|detail/.test(label))
      value = justification(tp, alert, date)
    if (value !== undefined) values.push({ key: f.key, value })
  }
  return values
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id) throw new Error("No active tab.")
  return tab
}

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function sendToTab<T>(tabId: number, msg: unknown, attempts = 20): Promise<T> {
  // The content script may not be listening yet right after navigation.
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg)
    } catch {
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  throw new Error("The claim form page didn't respond.")
}

export async function prepareClaim(
  tp: TrackedPurchase,
  alert: Alert,
  clock: ClockState
): Promise<{ filled: string[]; failed: string[]; unfilled: string[] }> {
  const tab = await activeTab()
  const url = tp.purchase.claim_form_url
  if (tab.url !== url) {
    const loaded = waitForLoad(tab.id!)
    await chrome.tabs.update(tab.id!, { url })
    await loaded
  }
  const { fields } = await sendToTab<{ fields: FormField[] }>(tab.id!, { type: "collect-fields" })
  if (!fields.length) throw new Error("No form found on the claim page.")
  const values = localDraft(fields, tp, alert, clock)
  const result = await sendToTab<{ filled: string[]; failed: string[] }>(tab.id!, {
    type: "fill-fields",
    values
  })
  const touched = new Set(values.map((v) => v.key))
  return { ...result, unfilled: fields.map((f) => f.key).filter((k) => !touched.has(k)) }
}
