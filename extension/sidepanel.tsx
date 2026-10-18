import { useCallback, useEffect, useState } from "react"

import { getAlerts, getCards, getClock, getPurchases, resetDemo, setDay } from "~lib/api"
import type { Alert, CardCatalogEntry, ClockState, TrackedPurchase } from "~lib/types"

import "./sidepanel.css"

// Skeleton. TODO(C): card setup flow, real timeline component, alert cards
// with "Prepare claim", citations expandable to the full policy.
function SidePanel() {
  const [clock, setClock] = useState<ClockState | null>(null)
  const [cards, setCards] = useState<CardCatalogEntry[]>([])
  const [purchases, setPurchases] = useState<TrackedPurchase[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const c = await getClock()
      setClock(c)
      setPurchases(await getPurchases())
      setAlerts(await getAlerts(c.day))
      setError(null)
    } catch (e) {
      setError("Can't reach the BackPocket service on localhost:8000.")
    }
  }, [])

  useEffect(() => {
    getCards().then(setCards).catch(() => {})
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [refresh])

  const jump = async (day: number) => {
    setClock(await setDay(day))
    refresh()
  }

  return (
    <div className="panel">
      <h1>BackPocket</h1>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Card</h2>
        <ul>
          {cards.map((c) => (
            <li key={c.card_id}>
              {c.display_name} <span className="muted">({c.product_name})</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Purchases</h2>
        {purchases.map((p) => (
          <div key={p.purchase.order_id}>
            <strong>{p.purchase.item_name}</strong> ${p.purchase.price_paid.toFixed(2)}
            <ul>
              {p.timeline.map((w) => (
                <li key={w.label}>
                  {w.label}: day {w.opens_day}–{w.closes_day} ({w.source}, {w.status})
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>Alerts</h2>
        {alerts.length === 0 && <p className="muted">Nothing needs your attention.</p>}
        {alerts.map((a) => (
          <div key={a.id} className={`alert ${a.kind}`}>
            <strong>{a.title}</strong>
            <p>{a.body}</p>
            {a.citations.map((c, i) => (
              <blockquote key={i}>
                “{c.quote}” <span className="muted">clause {c.clause}</span>
              </blockquote>
            ))}
            {a.action === "prepare_claim" && <button disabled>Prepare claim</button>}
          </div>
        ))}
      </section>

      <footer>
        <span>Day {clock?.day ?? "–"}</span>
        {[0, 3, 20, 28].map((d) => (
          <button key={d} onClick={() => jump(d)}>
            {d}
          </button>
        ))}
        <button onClick={() => clock && jump(clock.day + 1)}>+1</button>
        <button onClick={async () => { setClock(await resetDemo()); refresh() }}>Reset</button>
      </footer>
    </div>
  )
}

export default SidePanel
