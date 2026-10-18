// Reads the policy text from the shopper's open tab, on any store's site.
// Runs in the page, so it sees the rendered page (works on single-page apps
// and pages that block plain fetches) and can use computed styles to drop
// text the shopper can't see.

export interface TabText {
  url: string
  title: string
  siteName: string | null
  text: string
}

// Injected with chrome.scripting.executeScript: must be self-contained.
function collectVisibleText(): TabText {
  const MAX_CHARS = 60000
  const BLOCKS = "h1, h2, h3, h4, h5, p, li, dt, dd, td, th, summary, blockquote"

  const root =
    document.querySelector<HTMLElement>("[data-backpocket=policy]") ??
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("article") ??
    document.body

  const hidden = (el: Element): boolean => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute("aria-hidden") === "true" || (n as HTMLElement).hidden) return true
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true
    }
    const r = el.getBoundingClientRect()
    return r.width === 0 || r.height === 0
  }

  const seen = new Set<string>()
  const lines: string[] = []
  root.querySelectorAll(BLOCKS).forEach((el) => {
    // Skip blocks nested in another collected block (avoids duplicates).
    if (el.parentElement?.closest(BLOCKS) && root.contains(el.parentElement.closest(BLOCKS))) return
    if (el.closest("nav, header, footer, script, style, noscript, template")) return
    if (hidden(el)) return
    const t = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()
    if (t.length < 2 || seen.has(t)) return
    seen.add(t)
    lines.push(t)
  })
  let text = lines.join("\n")
  if (text.length < 200) text = root.innerText.replace(/\n{3,}/g, "\n\n").trim()

  const siteName =
    document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim() || null
  return { url: location.href, title: document.title, siteName, text: text.slice(0, MAX_CHARS) }
}

export async function readActiveTab(): Promise<TabText> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    throw new Error("Open a store's return or price-adjustment policy page first.")
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectVisibleText
  })
  const page = result?.result as TabText | undefined
  if (!page) throw new Error("Couldn't read this page.")
  return page
}
