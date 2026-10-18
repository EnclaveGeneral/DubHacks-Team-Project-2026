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
  const pending = alert.body.includes("pending")

  let detail: string | null = null
  let steps: string[] = []
  let result: string | null = null
  if (alert.kind === "price_drop_claimable") {
    const left = pm ? Math.max(0, pm.closes_day - clock.day) : null
    detail =
      (left !== null ? `${plural(left, "day")} left to claim. ` : "") +
      (m ? `About ${usd(m.net_estimate)} back ${pointsPhrase(m.points_reversed)} (estimate).` : "")
  } else if (alert.kind === "return_rebuy" && m) {
    // First sentence of the engine's explanation: why no price adjustment.
    detail = alert.body.split(/(?<=\.)\s/)[0]
    const current = currentPrice(tp, clock.day)
    steps = [
      `Buy it again at ${usd(current)}.`,
      `Return the original for a ${usd(current + m.refund)} refund` +
        (returnLeft !== null ? (returnLeft === 0 ? " by today." : ` within ${plural(returnLeft, "day")}.`) : ".")
    ]
    result = `You come out about ${usd(m.net_estimate)} ahead ${pointsPhrase(m.points_reversed)} (estimate).`
  } else if (alert.kind === "window_closing" && m) {
    detail =
      `Returning refunds ${usd(m.refund)}` +
      (m.points_reversed ? ` and takes back about ${m.points_reversed} points (estimate)` : "") +
      "."
  } else if (alert.kind === "card_protection") {
    detail = alert.body
  }

  const notes = [
    pending && alert.kind !== "card_protection" && "Assumes your pending price adjustment is approved.",
    alert.kind === "return_rebuy" && "Check that the new order isn't marked Final Sale."
  ].filter((n): n is string => Boolean(n))

  return { detail, steps, result, notes }
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
