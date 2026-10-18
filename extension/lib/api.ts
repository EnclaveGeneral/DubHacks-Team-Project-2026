import type {
  Alert,
  CardCatalogEntry,
  ClockState,
  Purchase,
  SelectedCard,
  TrackedPurchase
} from "./types"

export const SERVICE = "http://localhost:8000"

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVICE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init
    })
  } catch {
    throw new Error("Can't reach the BackPocket service on localhost:8000.")
  }
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      detail = (await res.json()).detail ?? detail
    } catch {}
    throw new Error(detail)
  }
  return res.json()
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body)
})

export const getClock = () => call<ClockState>("/clock")
export const setDay = (day: number) => call<ClockState>("/clock", post({ day }))
export const resetDemo = () => call<ClockState>("/demo/reset", post())

export const getCards = () => call<CardCatalogEntry[]>("/cards")
export const getSelectedCard = () => call<SelectedCard | null>("/cards/selected")
export const selectCard = (cardId: string) =>
  call<SelectedCard>(`/cards/${cardId}/select`, post())

export const getPurchases = () => call<TrackedPurchase[]>("/purchases")
export const getAlerts = () => call<Alert[]>("/alerts")

export const trackPurchase = (purchase: Purchase, policyText: string) =>
  call<TrackedPurchase>("/purchases", post({ purchase, policy_text: policyText }))

export const markClaimFiled = (orderId: string, claimType: "price_match" | "return") =>
  call<TrackedPurchase>(`/purchases/${orderId}/claims`, post({ claim_type: claimType }))
