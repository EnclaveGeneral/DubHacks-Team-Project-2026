import { useCallback, useEffect, useState } from "react"

import {
  getAlerts,
  getCards,
  getClock,
  getPurchases,
  getSelectedCard,
  resetDemo,
  selectCard,
  setDay
} from "~lib/api"
import { isoDate, prepareClaim } from "~lib/claim"
import type {
  Alert,
  CardCatalogEntry,
  Cited,
  ClockState,
  SelectedCard,
  TimelineWindow,
  TrackedPurchase
} from "~lib/types"

import "./sidepanel.css"

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })

const usd = (n: number) => `$${n.toFixed(2)}`

function SidePanel() {
  const [clock, setClock] = useState<ClockState | null>(null)
  const [cards, setCards] = useState<CardCatalogEntry[]>([])
  const [card, setCard] = useState<SelectedCard | null>(null)
  const [purchases, setPurchases] = useState<TrackedPurchase[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [c, p, a, sc] = await Promise.all([
        getClock(),
        getPurchases(),
        getAlerts(),
        getSelectedCard()
      ])
      setClock(c)
      setPurchases(p)
      setAlerts(a)
      setCard(sc)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    getCards().then(setCards).catch(() => {})
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [refresh])

  const jump = async (day: number) => {
    setClock(await setDay(Math.max(0, day)))
    refresh()
  }

  return (
    <div className="panel">
      <header className="top">
        <h1>BackPocket</h1>
        {clock && (
          <span className="muted">
            Day {clock.day} · {fmtDate(isoDate(clock.base_date, clock.day))}
          </span>
        )}
      </header>
      {error && <p className="error">{error}</p>}

      <CardSection cards={cards} card={card} onChange={setCard} />

      <section>
        <h2>Alerts</h2>
        {alerts.length === 0 && <p className="muted">Nothing needs your attention.</p>}
        {alerts.map((a) => (
          <AlertCard
            key={a.id}
            alert={a}
            purchase={purchases.find((p) => p.purchase.order_id === a.purchase_id)}
            clock={clock}
          />
        ))}
      </section>

      <section>
        <h2>Purchases</h2>
        {purchases.length === 0 && (
          <p className="muted">
            No protected purchases yet. Turn on “Protect this purchase” on an order
            confirmation page.
          </p>
        )}
        {purchases.map((p) => (
          <PurchaseCard key={p.purchase.order_id} tp={p} clock={clock} />
        ))}
      </section>

      <footer>
        <span className="muted">Skip to day</span>
        {[0, 3, 20, 28].map((d) => (
          <button key={d} className={clock?.day === d ? "on" : ""} onClick={() => jump(d)}>
            {d}
          </button>
        ))}
        <button onClick={() => clock && jump(clock.day + 1)}>+1</button>
        <button
          className="reset"
          onClick={async () => {
            setClock(await resetDemo())
            refresh()
          }}>
          Reset
        </button>
      </footer>
    </div>
  )
}

// ---------- Card ----------

function CardSection({
  cards,
  card,
  onChange
}: {
  cards: CardCatalogEntry[]
  card: SelectedCard | null
  onChange: (c: SelectedCard) => void
}) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (id: string) => {
    setBusy(id)
    setErr(null)
    try {
      onChange(await selectCard(id))
      setPicking(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (card && !picking) {
    const b = card.benefits
    const product = cards.find((c) => c.card_id === card.card_id)?.product_name
    return (
      <section>
        <h2>Your card</h2>
        <div className="card-chip">
          <div>
            <strong>{b.display_name}</strong>
            {product && <span className="muted"> · {product}</span>}
            <div className="muted small">
              {b.earn_rate_points_per_dollar.value} pts per $1 · points reversed on refunds:{" "}
              {b.reversal_rule.value}
              {b.reversal_rule.confidence === "low" && <Confirm />}
            </div>
          </div>
          <button className="link" onClick={() => setPicking(true)}>
            Change
          </button>
        </div>
        <details>
          <summary className="small">What BackPocket read from the benefits guide</summary>
          <pre className="json">{JSON.stringify(b, null, 2)}</pre>
        </details>
      </section>
    )
  }

  return (
    <section>
      <h2>Pick your card</h2>
      <p className="muted small">
        BackPocket reads the card's public benefits guide. No card number or login needed.
      </p>
      {cards.map((c) => (
        <button key={c.card_id} className="card-option" disabled={!!busy} onClick={() => pick(c.card_id)}>
          <strong>{c.display_name}</strong> <span className="muted">{c.product_name}</span>
          {busy === c.card_id && <span className="muted"> · reading benefits guide…</span>}
        </button>
      ))}
      {err && <p className="error">{err}</p>}
    </section>
  )
}

// ---------- Alerts ----------

function Quote({ c, policyUrl }: { c: Cited<unknown>; policyUrl?: string }) {
  if (!c.quote) return null
  const isCard = c.clause?.startsWith("§")
  const href = !isCard && policyUrl && c.clause ? `${policyUrl}#clause-${c.clause}` : undefined
  return (
    <blockquote>
      “{c.quote}”{" "}
      <span className="muted small">
        {isCard ? "Card benefits guide" : "Store policy"} {c.clause}
        {href && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noreferrer">
              read in full
            </a>
          </>
        )}
      </span>
      {c.confidence === "low" && <Confirm />}
    </blockquote>
  )
}

function Confirm() {
  return <span className="confirm">Please confirm: BackPocket isn't sure it read this correctly</span>
}

function AlertCard({
  alert,
  purchase,
  clock
}: {
  alert: Alert
  purchase?: TrackedPurchase
  clock: ClockState | null
}) {
  const [state, setState] = useState<string | null>(null)

  const prepare = async () => {
    if (!purchase || !clock) return
    setState("Opening the store's form…")
    try {
      const r = await prepareClaim(purchase, alert, clock)
      const missing = r.failed.length + r.unfilled.length
      setState(
        `Filled ${r.filled.length} fields (highlighted).` +
          (missing ? ` ${missing} left for you.` : "") +
          " Review, edit if needed, and submit it yourself."
      )
    } catch (e) {
      setState(`Couldn't prepare the form: ${(e as Error).message}`)
    }
  }

  const m = alert.money
  return (
    <div className={`alert ${alert.kind}`}>
      <strong>{alert.title}</strong>
      <p>{alert.body}</p>
      {m && (
        <p className="money small">
          Refund {usd(m.refund)}
          {m.points_reversed > 0 && <> · −{m.points_reversed} pts</>} · net ≈ {usd(m.net_estimate)}
          {m.is_estimate && <span className="muted"> (estimate)</span>}
        </p>
      )}
      {alert.citations.map((c, i) => (
        <Quote key={i} c={c} policyUrl={purchase?.policy.source_url} />
      ))}
      {alert.action === "prepare_claim" && (
        <button className="primary" onClick={prepare}>
          Prepare claim
        </button>
      )}
      {state && <p className="small muted">{state}</p>}
    </div>
  )
}

// ---------- Purchases + timeline ----------

function PurchaseCard({ tp, clock }: { tp: TrackedPurchase; clock: ClockState | null }) {
  const p = tp.purchase
  const short = tp.timeline.filter((w) => !w.long_term)
  const long = tp.timeline.filter((w) => w.long_term)
  const day = clock?.day ?? 0
  const span = Math.max(30, ...short.map((w) => w.closes_day - p.purchase_day))
  const pct = (d: number) => `${Math.min(100, Math.max(0, ((d - p.purchase_day) / span) * 100))}%`

  return (
    <div className="purchase">
      <div className="purchase-head">
        <strong>{p.item_name}</strong>
        <span>{usd(p.price_paid)}</span>
      </div>
      <div className="muted small">
        {p.merchant} · order {p.order_id} · Visa ending {p.card_last4}
        {tp.lowest_seen < p.price_paid && <> · lowest seen {usd(tp.lowest_seen)}</>}
      </div>

      <div className="timeline">
        {short.map((w) => (
          <div key={w.label} className="row">
            <span className="row-label small">{w.label}</span>
            <div className="track">
              <div
                className={`bar ${w.source} ${w.status}`}
                style={{ left: pct(w.opens_day), width: `calc(${pct(w.closes_day)} - ${pct(w.opens_day)})` }}
                title={w.citation.quote ?? ""}
              />
              <div className="today" style={{ left: pct(day) }} />
            </div>
            <span className="row-status small">
              {statusText(w, day)}
              {w.citation.confidence === "low" && <Confirm />}
            </span>
          </div>
        ))}
      </div>

      {long.length > 0 && clock && (
        <ul className="long-term small">
          {long.map((w) => (
            <li key={w.label} className={w.source}>
              {w.label}: {fmtDate(isoDate(clock.base_date, w.opens_day))} –{" "}
              {fmtDate(isoDate(clock.base_date, w.closes_day))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function statusText(w: TimelineWindow, day: number): string {
  if (w.status === "claimed") return "Claim filed"
  if (w.status === "closed") return "Closed"
  const left = w.closes_day - day
  return left === 0 ? "Closes today" : `${left} day${left === 1 ? "" : "s"} left`
}

// Hook for e2e/demo_walk.py, which drives "Prepare claim" without clicking the panel.
;(window as any).__backpocket = { prepareClaim }

export default SidePanel
