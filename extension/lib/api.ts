// The BackPocket service client lives in shared/ui/api.ts, shared with the
// website. Only extension-specific helpers are defined here.
export * from "../../shared/ui/api"

// The BackPocket website (web/). "More details" links go here.
export const SITE = "http://localhost:5174"

export const openSite = (path = "/") => chrome.tabs.create({ url: `${SITE}${path}` })
