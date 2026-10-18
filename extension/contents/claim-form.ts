import type { PlasmoCSConfig } from "plasmo"

import { localDraft } from "../../shared/ui/draft"
import { getAlerts, getClock, getPurchase, markClaimFiled } from "~lib/api"
import type { FormField } from "~lib/types"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:5173/*"]
}

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

// Sets a value on a React-controlled field so React registers it.
// IMPLEMENTATION.md §5.6. Fill one field at a time; never submit.
export function setFieldValue(el: Fillable, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

function findForm(): HTMLFormElement | null {
  return document.querySelector("form")
}

function fieldsOf(form: HTMLFormElement): Fillable[] {
  return Array.from(form.querySelectorAll<Fillable>("input, select, textarea")).filter(
    (el) => !["hidden", "submit", "button"].includes((el as HTMLInputElement).type)
  )
}

function keyOf(el: Fillable, i: number): string {
  return el.id || el.name || `field-${i}`
}

function labelOf(el: Fillable): string {
  const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null
  const text = byFor?.textContent ?? el.closest("label")?.textContent ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? ""
  return text.replace(/\s+/g, " ").trim()
}

export function collectFields(): FormField[] {
  const form = findForm()
  if (!form) return []
  return fieldsOf(form).map((el, i) => ({
    key: keyOf(el, i),
    label: labelOf(el),
    type: el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el.type,
    options:
      el instanceof HTMLSelectElement
        ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
        : []
  }))
}

function highlight(el: Fillable) {
  el.style.outline = "2px solid #e0a400"
  el.style.background = "#fff8db"
  if (el.nextElementSibling?.classList.contains("backpocket-tag")) return
  const tag = document.createElement("span")
  tag.className = "backpocket-tag"
  tag.textContent = "Filled by BackPocket"
  tag.setAttribute("style", "font:12px system-ui,sans-serif;color:#8a6a00;margin-top:2px")
  el.insertAdjacentElement("afterend", tag)
}

export interface FillResult {
  filled: string[]
  failed: string[]
}

function fill(values: { key: string; value: string }[]): FillResult {
  const form = findForm()
  const result: FillResult = { filled: [], failed: [] }
  if (!form) return { filled: [], failed: values.map((v) => v.key) }
  const els = fieldsOf(form)
  for (const { key, value } of values) {
    try {
      const el = els.find((e, i) => keyOf(e, i) === key)
      if (!el) throw new Error("not found")
      setFieldValue(el, value)
      highlight(el)
      result.filled.push(key)
    } catch {
      result.failed.push(key)
    }
  }
  watchSubmit(form)
  return result
}

// After the shopper submits, tell the service the claim was filed. The
// extension never submits the form itself.
// TODO(hours 12–15): the ids below only fit Ridgeline's form. When the drafter
// lands, keep the purchase id and claim type from the "fill-fields" message
// instead, so submit detection works on the second store too.
let watching = false
function watchSubmit(form: HTMLFormElement) {
  if (watching) return
  watching = true
  form.addEventListener("submit", () => {
    const get = (id: string) => (form.querySelector<Fillable>(`#${id}`)?.value ?? "").trim()
    const orderId = get("order_number")
    const type = get("claim_type") === "return" ? "return" : "price_match"
    if (orderId) markClaimFiled(orderId, type).catch(console.error)
  })
}

async function waitForForm(timeoutMs = 4000): Promise<HTMLFormElement | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const form = findForm()
    if (form && fieldsOf(form).length) return form
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

// Hand-off from the BackPocket website: its "Prepare claim form" button opens
// this page as /claim#backpocket=<order id>&alert=<alert id>. Fill the form the
// same way the side panel does, then leave it for the shopper to review and
// submit. The hash is removed afterward so a reload doesn't fill it again.
function showNote(text: string, ok = true) {
  const note = document.createElement("div")
  note.setAttribute(
    "style",
    [
      "position:fixed", "top:16px", "right:16px", "z-index:2147483647", "max-width:320px",
      "padding:10px 14px", "border-radius:10px", "background:#fff",
      `border:1px solid ${ok ? "#d6ddd9" : "#e0a49a"}`, "box-shadow:0 6px 24px rgba(0,0,0,.15)",
      "font:13px system-ui,sans-serif", `color:${ok ? "#1d2a24" : "#8a2d1d"}`
    ].join(";")
  )
  note.textContent = text
  document.body.appendChild(note)
  setTimeout(() => note.remove(), 12000)
}

async function handoffFromSite() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""))
  const orderId = params.get("backpocket")
  if (!orderId) return
  history.replaceState(null, "", location.pathname + location.search)
  try {
    const [tp, alerts, clock] = await Promise.all([getPurchase(orderId), getAlerts(), getClock()])
    const wanted = params.get("alert")
    const mine = alerts.filter((a) => a.purchase_id === orderId && a.action)
    const alert = mine.find((a) => a.id === wanted) ?? mine[0]
    if (!alert) throw new Error("There's nothing to claim for this purchase right now.")
    if (!(await waitForForm())) throw new Error("No form found on this page.")
    const values = localDraft(collectFields(), tp, alert, clock)
    const result = fill(values)
    const left = result.failed.length
    showNote(
      `BackPocket filled ${result.filled.length} field${result.filled.length === 1 ? "" : "s"}` +
        (left ? `, ${left} couldn't be filled` : "") +
        ". Check the highlighted fields, then submit it yourself."
    )
  } catch (e) {
    showNote(`BackPocket couldn't prepare this form: ${(e as Error).message}`, false)
  }
}

handoffFromSite()

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "collect-fields") {
    waitForForm().then(() => sendResponse({ fields: collectFields() }))
    return true
  }
  if (msg?.type === "fill-fields") {
    waitForForm().then(() => sendResponse(fill(msg.values)))
    return true
  }
})
