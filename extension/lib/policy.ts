// Reads only the policy section of a fetched store page and strips anything a
// shopper can't see. A DOMParser document has no layout or computed styles,
// so hidden content is detected by attribute only (IMPLEMENTATION.md §5.6).

const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden)/i
const REMOVE_TAGS = "script, style, template, noscript, iframe, object, embed"

export function extractPolicyText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const root =
    doc.querySelector<HTMLElement>("[data-backpocket=policy]") ?? largestBlock(doc)
  if (!root) return ""

  root.querySelectorAll(REMOVE_TAGS).forEach((el) => el.remove())
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (
      el.hasAttribute("hidden") ||
      el.getAttribute("aria-hidden") === "true" ||
      HIDDEN_STYLE.test(el.getAttribute("style") ?? "")
    ) {
      el.remove()
    }
  })

  // One line per block so clause numbers stay next to their sentences.
  const blocks = root.querySelectorAll("h1, h2, h3, h4, p, li, dt, dd")
  const lines = blocks.length
    ? Array.from(blocks, (el) => el.textContent ?? "")
    : [root.textContent ?? ""]
  return lines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function largestBlock(doc: Document): HTMLElement | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>("main, article"))
  return candidates.sort(
    (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0)
  )[0] ?? null
}
