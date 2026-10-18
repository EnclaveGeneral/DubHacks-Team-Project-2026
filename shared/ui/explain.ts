import { currentPrice, plural, pointsPhrase, usd } from "./format"
import type { Alert, ClockState, TrackedPurchase } from "./types"

// How an alert is explained to the shopper: one detail line, the steps for a
// return-and-rebuy, and the caveats. Shared by the side panel (summary) and
// the website (full card) so they never disagree.

export interface AlertExplanation {
  detail: string | null
  steps: string[]
  result: string | null
  notes: string[]
}

export function explainAlert(alert: Alert, tp: TrackedPurchase, clock: ClockState): AlertExplanation {
  const m = alert.money
  const pm = tp.timeline.find((w) => w.label === "Price match")
  const ret = tp.timeline.find((w) => w.label === "Return")
  const returnLeft = ret ? Math.max(0, ret.closes_day - clock.day) : null
  // A filed price adjustment the store hasn't answered yet. Later return
  // offers count it as approved (the engine's effective_paid), so say so.
  const pending =
    tp.claims_filed.includes("price_match") && (alert.kind === "return_rebuy" || alert.kind === "window_closing")

  // What the shopper ends up with, after card points are taken back.
  const outcome = (mm: NonNullable<typeof m>, verb: "get" | "save") =>
    `You'd ${verb} about ${usd(mm.net_estimate)}${verb === "get" ? " back" : ""}${pointsPhrase(mm.points_reversed)}.`
  const pendingNote = pending ? " Assumes your pending adjustment is approved." : ""

  let detail: string | null = null
  let steps: string[] = []
  if (alert.kind === "price_drop_claimable") {
    const left = pm ? Math.max(0, pm.closes_day - clock.day) : null
    detail = [left !== null && `${plural(left, "day")} left to claim.`, m && outcome(m, "get")].filter(Boolean).join(" ")
  } else if (alert.kind === "return_rebuy" && m) {
    const why = tp.claims_filed.includes("price_match")
      ? "You've used your one price adjustment"
      : pm
        ? `Price adjustments end after ${pm.closes_day - pm.opens_day} days`
        : "This store doesn't adjust prices"
    detail = `${why}, but you can still return it. ${outcome(m, "save")}${pendingNote}`
    const current = currentPrice(tp, clock.day)
    const by =
      ret?.open_ended || returnLeft === null ? "" : returnLeft === 0 ? " today" : ` within ${plural(returnLeft, "day")}`
    steps = [`Buy it again at ${usd(current)}.`, `Return the original${by} for ${usd(current + m.refund)}.`]
  } else if (alert.kind === "window_closing" && m) {
    detail =
      `Refunds ${usd(m.refund)}` +
      (m.points_reversed ? `, takes back about ${m.points_reversed} points` : "") +
      "." +
      pendingNote
  } else if (alert.kind === "card_protection") {
    detail = alert.body
  }

  // The outcome and any pending-adjustment note are part of `detail` now.
  return { detail, steps, result: null, notes: [] }
}

/** Label of the alert's main button, or null when it has no action. */
export function actionLabel(alert: Alert, tp: TrackedPurchase): string | null {
  const hasForm = Boolean(tp.purchase.claim_form_url)
  if (alert.action === "prepare_claim") return hasForm ? "Prepare claim form" : "Draft a request message"
  if (alert.action === "prepare_return") return hasForm ? "Prepare return form" : "Draft a return message"
  return null
}

export function alertTone(alert: Alert): "good" | "warn" {
  return alert.kind === "window_closing" ? "warn" : "good"
}

export function alertIcon(alert: Alert): string {
  return alert.kind === "return_rebuy" ? "↺" : alertTone(alert) === "warn" ? "!" : "↓"
}
