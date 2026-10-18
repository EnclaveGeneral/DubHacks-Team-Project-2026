// Date, money, and deadline helpers shared by the extension's side panel and
// the BackPocket website, so both describe a purchase the same way.
// Pure TypeScript only: no React, no chrome.* APIs.

import type { Alert, ClockState, TimelineWindow, TrackedPurchase } from "./types"

export const usd = (n: number) => `$${n.toFixed(2)}`
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** ISO date for demo day `day` (day 0 is `baseDate`). */
export function isoDate(baseDate: string, day: number): string {
  const d = new Date(`${baseDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day)
  return d.toISOString().slice(0, 10)
}

/** Demo day number for an ISO date (the inverse of isoDate). */
export function dayFromIso(baseDate: string, iso: string): number {
  const ms = Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${baseDate}T12:00:00Z`)
  return Math.round(ms / 86400000)
}

export const fmtDate = (iso: string, withYear = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC"
  })

export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })

/** What the shopper should look at first. Lower is more important. */
export const PRIORITY: Record<Alert["kind"], number> = {
  price_drop_claimable: 0,
  return_rebuy: 1,
  window_closing: 2,
  card_protection: 3
}

/** Alerts the shopper can act on (card protections are background info), most valuable first. */
export function actionable(alerts: Alert[], orderId: string): Alert[] {
  return alerts
    .filter((a) => a.purchase_id === orderId && a.kind !== "card_protection")
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
}

export function pointsPhrase(lost: number): string {
  if (lost > 0) return `after ${lost} points are taken back`
  if (lost < 0) return `and earn about ${-lost} more points`
  return ""
}

/** Latest observed store price on or before `day` (what was paid if none). */
export function currentPrice(tp: TrackedPurchase, day: number): number {
  const seen = Object.keys(tp.price_history)
    .map(Number)
    .filter((d) => d <= day)
  return seen.length ? tp.price_history[String(Math.max(...seen))] : tp.purchase.price_paid
}

/** Windows the shopper can still use (merchant and card), soonest to close first. */
export function openWindows(tp: TrackedPurchase, day: number): TimelineWindow[] {
  return tp.timeline
    .filter((w) => w.status !== "closed" && w.status !== "claimed" && w.opens_day <= day)
    .sort((a, b) => a.closes_day - b.closes_day)
}

/** The nearest deadline that matters day to day (not a long-term warranty). */
export function nextDeadline(tp: TrackedPurchase, day: number): { label: string; left: number } | null {
  const w = openWindows(tp, day).find((w) => !w.long_term)
  return w ? { label: w.label.split(" (")[0], left: Math.max(0, w.closes_day - day) } : null
}

export function deadlineRow(w: TimelineWindow, clock: ClockState) {
  const left = w.closes_day - clock.day
  const end = fmtDate(isoDate(clock.base_date, w.closes_day), w.long_term)
  const isCard = w.source === "card"
  let label = w.label.split(" (")[0]
  if (label === "Card extended warranty") label = "Extra warranty from your card"
  if (label === "Card return protection") label = "Return protection from your card"

  let when: string
  if (w.status === "claimed") when = label === "Return" ? "Return requested ✓" : "Claim filed ✓"
  else if (w.status === "closed") when = "Closed"
  else if (w.long_term) when = `Until ${end}`
  else when = left === 0 ? "Closes today" : `${plural(left, "day")} left`

  return {
    key: w.label,
    label,
    sub: isCard ? "May cover. Confirm with your issuer." : undefined,
    when,
    source: w.source,
    urgent: w.status === "closing_soon",
    dim: w.status === "closed"
  }
}
