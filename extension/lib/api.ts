import alertsFixture from "../../shared/fixtures/alerts.json"
import purchasesFixture from "../../shared/fixtures/purchases.json"
import type { Alert, CardCatalogEntry, ClockState, TrackedPurchase } from "./types"

export const SERVICE = "http://localhost:8000"

// Until B's routes land, purchases and alerts come from /shared/fixtures.
// Flip to false once GET /purchases and GET /alerts return real data.
export const USE_FIXTURES = true

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVICE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

export const getClock = () => call<ClockState>("/clock")

export const setDay = (day: number) =>
  call<ClockState>("/clock", { method: "POST", body: JSON.stringify({ day }) })

export const resetDemo = () => call<ClockState>("/demo/reset", { method: "POST" })

export const getCards = () => call<CardCatalogEntry[]>("/cards")

export async function getPurchases(): Promise<TrackedPurchase[]> {
  if (USE_FIXTURES) return purchasesFixture as TrackedPurchase[]
  return call<TrackedPurchase[]>("/purchases")
}

export async function getAlerts(day: number): Promise<Alert[]> {
  if (USE_FIXTURES) {
    const byDay = alertsFixture as Record<string, Alert[]>
    const key = Object.keys(byDay)
      .map(Number)
      .filter((d) => d <= day)
      .sort((a, b) => b - a)[0]
    return key === undefined ? [] : byDay[String(key)]
  }
  return call<Alert[]>("/alerts")
}
