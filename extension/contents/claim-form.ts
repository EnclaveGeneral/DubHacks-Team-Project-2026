import type { PlasmoCSConfig } from "plasmo"

import { markClaimFiled } from "~lib/api"
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
  tag.textContent = "Filled by BackPocket · check and edit"
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
