import { useEffect, useState } from 'react'
import { PRODUCTS } from './catalog'

export const STORE_SERVER = 'http://localhost:8001'

export interface PriceState {
  day: number
  prices: Record<string, number>
  live: boolean // false when the store server is unreachable (list prices shown)
}

const FALLBACK: PriceState = {
  day: 0,
  prices: Object.fromEntries(PRODUCTS.map((p) => [p.sku, p.listPrice])),
  live: false,
}

let cache: PriceState = FALLBACK

async function fetchPrices(): Promise<PriceState> {
  try {
    const res = await fetch(`${STORE_SERVER}/prices`)
    const body = await res.json()
    cache = { day: body.day, prices: { ...FALLBACK.prices, ...body.prices }, live: true }
  } catch {
    cache = { ...cache, live: false }
  }
  return cache
}

// Live prices follow the demo calendar, so poll while the tab is visible and
// refresh as soon as it's shown again. Background tabs make no requests.
export function usePrices(): PriceState {
  const [state, setState] = useState<PriceState>(cache)
  useEffect(() => {
    let alive = true
    const tick = () => fetchPrices().then((s) => alive && setState(s))
    tick()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, 3000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return state
}
