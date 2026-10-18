import { localDraft } from "../../shared/ui/draft"
import type { Alert, ClockState, FormField, TrackedPurchase } from "./types"

// H5 fill spike: maps the form's fields to values in code from the order and
// the alert. TODO(B/C, hours 12–15): replace localDraft() with POST
// /claims/draft (LLM maps unfamiliar labels and writes the justification);
// keep this as the fallback when the service is unreachable.
//
// The text-drafting helpers are shared with the website (shared/ui/); this
// file keeps what needs chrome.* APIs.

export { draftMessage, localDraft } from "../../shared/ui/draft"
export { isoDate } from "../../shared/ui/format"

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
  // Always load a fresh copy of the form (the tab may be showing an earlier
  // request's confirmation screen at the same URL).
  const url = tp.purchase.claim_form_url
  const loaded = waitForLoad(tab.id!)
  if (tab.url === url) await chrome.tabs.reload(tab.id!)
  else await chrome.tabs.update(tab.id!, { url })
  await loaded
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
