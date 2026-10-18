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

function sameOrigin(a: string | undefined, b: string): boolean {
  try {
    return !!a && new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

// `alreadyLoading`: a tab just created with the URL may finish before we listen,
// so check its status once. Not for a tab we're about to navigate: it still
// reports the old page as "complete".
function waitForLoad(tabId: number, alreadyLoading = false): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") done()
    }
    chrome.tabs.onUpdated.addListener(listener)
    if (alreadyLoading) chrome.tabs.get(tabId).then((t) => t.status === "complete" && done(), () => {})
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
  const url = tp.purchase.claim_form_url
  const current = await activeTab()
  // Reuse the active tab only if it's already on the store's site; otherwise
  // open the form in a new tab rather than navigating away from what the
  // shopper is looking at (e.g. the BackPocket website).
  let tabId: number
  if (sameOrigin(current.url, url)) {
    tabId = current.id!
    // Always load a fresh copy of the form (the tab may be showing an earlier
    // request's confirmation screen at the same URL).
    const loaded = waitForLoad(tabId)
    if (current.url === url) await chrome.tabs.reload(tabId)
    else await chrome.tabs.update(tabId, { url })
    await loaded
  } else {
    const created = await chrome.tabs.create({ url, active: true })
    tabId = created.id!
    await waitForLoad(tabId, true)
  }
  const tab = { id: tabId }
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
