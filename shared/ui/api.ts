import type {
  Alert,
  CardCatalogEntry,
  ClockState,
  MerchantPolicy,
  PanelState,
  Purchase,
  SelectedCard,
  TrackedPurchase
} from "./types"

// The BackPocket service client, shared by the extension and the website so
// the two can't drift apart. Plain fetch only (no chrome.* APIs here).

export const SERVICE = "http://localhost:8000"

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVICE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init
    })
  } catch {
    throw new ServiceUnreachable()
  }
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      // keep the status code
    }
    throw new ServiceError(res.status, detail)
  }
  return res.json()
}

/** The service didn't answer at all (not running, network down). */
export class ServiceUnreachable extends Error {
  constructor() {
    super("Can't reach the BackPocket service on localhost:8000.")
  }
}

/** The service answered with an error status. */
export class ServiceError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body)
})

// ---------- Clock + demo ----------

export const getClock = () => call<ClockState>("/clock")
export const setDay = (day: number) => call<ClockState>("/clock", post({ day }))
// Reset the demo and re-add the fictional-store purchases the website shows.
export const resetDemo = () => call<ClockState>("/demo/reset?seed=true", post())

// ---------- Cards ----------

export const getCards = () => call<CardCatalogEntry[]>("/cards")
export const getSelectedCard = () => call<SelectedCard | null>("/cards/selected")
export const selectCard = (cardId: string) => call<SelectedCard>(`/cards/${cardId}/select`, post())

// ---------- Purchases + alerts ----------

// Everything the side panel and website show, in one request.
export const getState = () => call<PanelState>("/state")

export const getPurchases = () => call<TrackedPurchase[]>("/purchases")
export const getPurchase = (orderId: string) =>
  call<TrackedPurchase>(`/purchases/${encodeURIComponent(orderId)}`)
export const getAlerts = () => call<Alert[]>("/alerts")

export const trackPurchase = (
  purchase: Purchase,
  policyText: string,
  manual = false,
  retailerId: string | null = null
) =>
  call<TrackedPurchase>(
    "/purchases",
    post({ purchase, policy_text: policyText, manual, retailer_id: retailerId })
  )

export const readPolicy = (url: string, text: string, siteName: string | null) =>
  call<MerchantPolicy>("/policies/read", post({ url, text, site_name: siteName }))

export const reportPrice = (orderId: string, price: number) =>
  call<TrackedPurchase>(`/purchases/${encodeURIComponent(orderId)}/price`, post({ price }))

export const markClaimFiled = (orderId: string, claimType: "price_match" | "return") =>
  call<TrackedPurchase>(
    `/purchases/${encodeURIComponent(orderId)}/claims`,
    post({ claim_type: claimType })
  )

// ---------- Website -> store form hand-off ----------

/** A single-use code the website puts in the store form's URL. Only pages the
 * service accepts requests from (the website, the store, the extension) can
 * get one, so an arbitrary link can't make the extension fill a form. */
export const createHandoff = (orderId: string, alertId: string) =>
  call<{ token: string }>("/handoffs", post({ order_id: orderId, alert_id: alertId }))

/** Exchanges the code for the purchase and alert to prepare (once). */
export const redeemHandoff = (token: string) =>
  call<{ order_id: string; alert_id: string }>(`/handoffs/${encodeURIComponent(token)}/redeem`, post())
