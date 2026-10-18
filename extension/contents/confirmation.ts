import type { PlasmoCSConfig } from "plasmo"

import { getClock, trackPurchase } from "~lib/api"
import { dayOf, orderDateFromJsonLd, purchaseFromJsonLd } from "~lib/orders"
import { extractPolicyText } from "~lib/policy"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:5173/*"]
}

// The store is a single-page app: watch for the confirmation page's order
// data to appear instead of relying on a page load.
const BAR_ID = "backpocket-protect"

function render() {
  const existing = document.getElementById(BAR_ID)
  const purchase = purchaseFromJsonLd(document)
  if (!purchase) {
    existing?.remove()
    return
  }
  if (existing?.dataset.order === purchase.order_id) return
  existing?.remove()

  const bar = document.createElement("div")
  bar.id = BAR_ID
  bar.dataset.order = purchase.order_id
  bar.setAttribute(
    "style",
    [
      "position:fixed", "right:20px", "bottom:20px", "z-index:2147483647",
      "display:flex", "gap:10px", "align-items:center", "padding:12px 16px",
      "background:#fff", "border:1px solid #d6ddd9", "border-radius:10px",
      "box-shadow:0 6px 24px rgba(0,0,0,.15)", "font:14px system-ui,sans-serif",
      "color:#1d2a24"
    ].join(";")
  )
  bar.innerHTML = `
    <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
      <input type="checkbox" style="width:18px;height:18px;accent-color:#24473a">
      <span><strong>BackPocket</strong> · Protect this purchase</span>
    </label>
    <span data-status style="color:#5b6b63"></span>`
  document.body.appendChild(bar)

  const box = bar.querySelector("input")!
  const status = bar.querySelector<HTMLElement>("[data-status]")!

  box.addEventListener("change", async () => {
    if (!box.checked) return
    box.disabled = true
    // Open the panel inside the click's user gesture.
    chrome.runtime.sendMessage({ type: "open-side-panel" })
    status.textContent = "Reading the store's policy…"
    try {
      const res = await fetch(purchase.policy_url)
      const policyText = extractPolicyText(await res.text())
      if (!policyText) throw new Error("No policy text found on the policy page.")
      // Date the purchase by the order itself, not by whatever day it is when
      // the shopper turns on protection.
      const orderDate = orderDateFromJsonLd(document)
      if (orderDate) {
        const { base_date } = await getClock()
        await trackPurchase({ ...purchase, purchase_day: dayOf(base_date, orderDate) }, policyText, true)
      } else {
        await trackPurchase(purchase, policyText)
      }
      status.textContent = "Protected. See the BackPocket panel."
    } catch (e) {
      status.textContent = `Couldn't protect this purchase: ${(e as Error).message}`
      box.checked = false
      box.disabled = false
    }
  })
}

render()
new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
