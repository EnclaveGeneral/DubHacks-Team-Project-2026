import type {
  CardCatalogEntry,
  ClockState,
  PanelState,
  SelectedCard,
  TrackedPurchase
} from '../../shared/ui/types'

// The BackPocket service. Everything the website shows comes from here.
export const SERVICE = 'http://localhost:8000'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVICE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new Error("Can't reach the BackPocket service on localhost:8000.")
  }
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      // keep the status code
    }
    throw new Error(detail)
  }
  return res.json()
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const getState = () => call<PanelState>('/state')
export const getCards = () => call<CardCatalogEntry[]>('/cards')
export const selectCard = (cardId: string) => call<SelectedCard>(`/cards/${cardId}/select`, post())

export const setDay = (day: number) => call<ClockState>('/clock', post({ day }))
// Reset the demo and re-add the fictional-store purchases.
export const resetDemo = () => call<ClockState>('/demo/reset?seed=true', post())

export const reportPrice = (orderId: string, price: number) =>
  call<TrackedPurchase>(`/purchases/${encodeURIComponent(orderId)}/price`, post({ price }))

export const markClaimFiled = (orderId: string, claimType: 'price_match' | 'return') =>
  call<TrackedPurchase>(
    `/purchases/${encodeURIComponent(orderId)}/claims`,
    post({ claim_type: claimType }),
  )
