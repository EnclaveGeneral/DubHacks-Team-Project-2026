import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:5173/confirmation/*"]
}

// TODO(C, hours 2–6):
// 1. Parse <script type="application/ld+json"> into a Purchase.
// 2. Fetch the policy URL, DOMParser it, read only [data-backpocket=policy],
//    strip by attribute (script/style/template, [hidden], [aria-hidden=true],
//    inline display:none / visibility:hidden), take textContent.
// 3. Inject the "Protect this purchase" toggle; on toggle POST /purchases and
//    chrome.runtime.sendMessage({ type: "open-side-panel" }).

const ld = document.querySelector('script[type="application/ld+json"]')
console.log("[BackPocket] confirmation page", ld ? JSON.parse(ld.textContent ?? "{}") : "no JSON-LD")
