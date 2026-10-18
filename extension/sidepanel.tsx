import { useCallback, useEffect, useState, type FormEvent } from "react"

import PriceChart from "~components/PriceChart"
import {
  getCards,
  getState,
  readPolicy,
  reportPrice,
  resetDemo,
  selectCard,
  setDay,
  trackPurchase
} from "~lib/api"
import { draftMessage, isoDate, prepareClaim } from "~lib/claim"
import { readActiveTab, type TabText } from "~lib/readTab"
import type {
  Alert,
  CardCatalogEntry,
  Cited,
  ClockState,
  MerchantPolicy,
  SelectedCard,
  TimelineWindow,
  TrackedPurchase
} from "~lib/types"

import "./sidepanel.css"

// Layout, top to bottom: the one thing to act on, the price chart, then
// deadlines. Everything else (card terms, full clauses) is one click away.

const fmtDate = (iso: string, withYear = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC"
  })

const usd = (n: number) => `$${n.toFixed(2)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const PRIORITY: Record<Alert["kind"], number> = {
  price_drop_claimable: 0,
  window_closing: 1,
  price_drop_declined: 2,
  card_protection: 3
}

function SidePanel() {
  const [clock, setClock] = useState<ClockState | null>(null)
  const [cards, setCards] = useState<CardCatalogEntry[]>([])
  const [card, setCard] = useState<SelectedCard | null>(null)
  const [cardLoaded, setCardLoaded] = useState(false)
  const [purchases, setPurchases] = useState<TrackedPurchase[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [reading, setReading] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "done"; page: TabText; policy: MerchantPolicy } | null
  >(null)

  const readThisPage = async () => {
    setReading({ status: "loading" })
    try {
      const page = await readActiveTab()
      const policy = await readPolicy(page.url, page.text, page.siteName)
      setReading({ status: "done", page, policy })
    } catch (e) {
      setReading({ status: "error", message: (e as Error).message })
    }
  }

  const refresh = useCallback(async () => {
    try {
      const s = await getState()
      setClock(s.clock)
      setPurchases(s.purchases)
      setAlerts(s.alerts)
      setCard(s.selected_card)
      setCardLoaded(true)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  // Poll every 2 s only while the panel is visible, and refresh as soon as it
  // becomes visible again. A hidden panel makes no requests.
  useEffect(() => {
    getCards().then(setCards).catch(() => {})
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, 2000)
    const onVisible = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const jump = async (day: number) => {
    setClock(await setDay(Math.max(0, day)))
    refresh()
  }

  const needsCard = cardLoaded && !card

  return (
    <div className="panel">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          BackPocket
        </div>
        <div className="top-actions">
          <button className="read-btn" onClick={readThisPage} disabled={reading?.status === "loading"}>
            {reading?.status === "loading" ? "Reading…" : "Read this page"}
          </button>
          {card && (
            <button className="card-chip" onClick={() => setShowCard((s) => !s)} aria-expanded={showCard}>
              <span className="visa">VISA</span> ···· {card.last4}
            </button>
          )}
        </div>
      </header>

      {reading?.status === "error" && (
        <p className="banner">
          {reading.message}{" "}
          <button className="link" onClick={() => setReading(null)}>
            Dismiss
          </button>
        </p>
      )}
      {reading?.status === "done" && clock && (
        <PolicySheet
          page={reading.page}
          policy={reading.policy}
          clock={clock}
          cardLast4={card?.last4 ?? ""}
          onClose={() => setReading(null)}
          onTracked={() => {
            setReading(null)
            refresh()
          }}
        />
      )}

      {error && <p className="banner error">{error}</p>}

      {(needsCard || showCard) && (
        <CardSheet
          cards={cards}
          card={card}
          onPicked={(c) => {
            setCard(c)
            setShowCard(false)
          }}
        />
      )}

      {!needsCard && purchases.length === 0 && !error && (
        <div className="empty">
          <strong>No purchases yet</strong>
          <p>
            After you buy something, turn on “Protect this purchase” on the order confirmation page. Shopping
            somewhere else? Open that store's return or price-adjustment policy and choose “Read this page”.
          </p>
        </div>
      )}

      {clock &&
        [...purchases].reverse().map((tp) => (
          <PurchaseView
            key={tp.purchase.order_id}
            tp={tp}
            clock={clock}
            alerts={alerts
              .filter((a) => a.purchase_id === tp.purchase.order_id && a.kind !== "card_protection")
              .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])}
          />
        ))}

      <footer className="demo-bar" aria-label="Demo clock">
        <span className="demo-label">
          Demo day {clock?.day ?? "–"}
          {clock && <span className="muted"> · {fmtDate(isoDate(clock.base_date, clock.day))}</span>}
        </span>
        <div className="demo-buttons">
          {[0, 3, 20, 28].map((d) => (
            <button key={d} className={clock?.day === d ? "on" : ""} onClick={() => jump(d)}>
              {d}
            </button>
          ))}
          <button onClick={() => clock && jump(clock.day + 1)} aria-label="Next day">
            +1
          </button>
          <button
            className="reset"
            onClick={async () => {
              setClock(await resetDemo())
              refresh()
            }}>
            Reset
          </button>
        </div>
      </footer>
    </div>
  )
}

// ---------- Card ----------

function CardSheet({
  cards,
  card,
  onPicked
}: {
  cards: CardCatalogEntry[]
  card: SelectedCard | null
  onPicked: (c: SelectedCard) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (id: string) => {
    setBusy(id)
    setErr(null)
    try {
      onPicked(await selectCard(id))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const b = card?.benefits
  return (
    <section className="sheet">
      {b ? (
        <>
          <h2>{cards.find((c) => c.card_id === card.card_id)?.product_name ?? b.display_name}</h2>
          <dl className="terms">
            <div className="term-row">
              <dt>Earns</dt>
              <dd>
                {b.earn_rate_points_per_dollar.value} pts per $1
                <LowConfidence c={b.earn_rate_points_per_dollar} />
              </dd>
            </div>
            <div className="term-row">
              <dt>On refunds</dt>
              <dd>
                {b.reversal_rule.value === "proportional"
                  ? "Points on the refunded amount are taken back"
                  : b.reversal_rule.value === "none"
                    ? "You keep your points"
                    : b.reversal_rule.value === "threshold"
                      ? `Points taken back on refunds over $${b.reversal_threshold_dollars.value}`
                      : "All points on the purchase are taken back"}
                <LowConfidence c={b.reversal_rule} />
              </dd>
            </div>
            {b.protections.map((p) => (
              <div key={p.type} className="term-row">
                <dt>{p.type === "extended_warranty" ? "Warranty" : "Returns"}</dt>
                <dd>
                  {p.type === "extended_warranty"
                    ? `May add ${p.extends_months.value} months to the maker's warranty`
                    : `May refund returns a store refuses, within ${p.window_days.value} days`}
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>Everything BackPocket read from the benefits guide</summary>
            <pre className="json">{JSON.stringify(b, null, 2)}</pre>
          </details>
          <p className="small muted">Switch card</p>
        </>
      ) : (
        <>
          <h2>Which card do you use?</h2>
          <p className="small muted">
            BackPocket reads the card's public benefits guide. No card number or login.
          </p>
        </>
      )}
      <div className="card-options">
        {cards
          .filter((c) => c.card_id !== card?.card_id)
          .map((c) => (
            <button key={c.card_id} className="card-option" disabled={!!busy} onClick={() => pick(c.card_id)}>
              <span className="visa">VISA</span>
              <span>
                <strong>···· {c.last4}</strong> <span className="muted">{c.product_name}</span>
              </span>
              {busy === c.card_id && <span className="muted small">Reading guide…</span>}
            </button>
          ))}
      </div>
      {err && <p className="error small">{err}</p>}
    </section>
  )
}

// ---------- Any store: read a policy page, track a purchase ----------

function dayFromIso(baseDate: string, iso: string): number {
  const ms = Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${baseDate}T12:00:00Z`)
  return Math.round(ms / 86400000)
}

function PolicySheet({
  page,
  policy,
  clock,
  cardLast4,
  onClose,
  onTracked
}: {
  page: TabText
  policy: MerchantPolicy
  clock: ClockState
  cardLast4: string
  onClose: () => void
  onTracked: () => void
}) {
  const [adding, setAdding] = useState(false)
  const pm = policy.price_match
  const months = policy.manufacturer_warranty_months.value

  const terms: { label: string; value: string; cite: Cited<unknown> }[] = [
    {
      label: "Price adjustment",
      value:
        pm.allowed.value === false
          ? "Not offered"
          : pm.window_days.value != null
            ? `Within ${pm.window_days.value} days`
            : pm.allowed.value
              ? "Offered (no deadline stated)"
              : "Not mentioned",
      cite: pm.window_days.quote ? pm.window_days : pm.allowed
    },
    {
      label: "Returns",
      value: policy.return_window_days.value != null ? `Within ${policy.return_window_days.value} days` : "Not on this page",
      cite: policy.return_window_days
    },
    {
      label: "Warranty",
      value: months != null ? (months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`) : "Not on this page",
      cite: policy.manufacturer_warranty_months
    },
    {
      label: "How to ask",
      value: policy.how_to_request.value ?? "Not stated",
      cite: policy.how_to_request
    }
  ]

  return (
    <section className="sheet policy-sheet">
      <div className="sheet-head">
        <div>
          <p className="eyebrow">What this page says</p>
          <h2>{policy.merchant}</h2>
        </div>
        <button className="link small" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="terms">
        {terms.map((t) => (
          <div key={t.label} className="term-row">
            <dt>{t.label}</dt>
            <dd>
              {t.value}
              <LowConfidence c={t.cite} />
              {t.cite.quote && <SmallQuote c={t.cite} />}
            </dd>
          </div>
        ))}
      </dl>
      {pm.conditions.length > 0 && (
        <details>
          <summary>
            {pm.conditions.length} condition{pm.conditions.length === 1 ? "" : "s"} on price adjustments
          </summary>
          <ul className="conditions">
            {pm.conditions.map((c, i) => (
              <li key={i}>{String(c.value)}</li>
            ))}
          </ul>
        </details>
      )}
      {adding ? (
        <AddPurchaseForm page={page} policy={policy} clock={clock} cardLast4={cardLast4} onDone={onTracked} />
      ) : (
        <button className="primary" onClick={() => setAdding(true)}>
          Track a purchase from {policy.merchant}
        </button>
      )}
    </section>
  )
}

function SmallQuote({ c }: { c: Cited<unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="small-quote">
      <button className="link small" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide wording" : "See wording"}
      </button>
      {open && <q>{c.quote}</q>}
    </span>
  )
}

function AddPurchaseForm({
  page,
  policy,
  clock,
  cardLast4,
  onDone
}: {
  page: TabText
  policy: MerchantPolicy
  clock: ClockState
  cardLast4: string
  onDone: () => void
}) {
  const today = isoDate(clock.base_date, clock.day)
  const [item, setItem] = useState("")
  const [price, setPrice] = useState("")
  const [date, setDate] = useState(today)
  const [orderId, setOrderId] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const paid = Number(price)
    if (!item.trim() || !(paid > 0)) {
      setErr("Add the item and what you paid.")
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await trackPurchase(
        {
          order_id: orderId.trim() || `M-${Date.now()}`,
          merchant: policy.merchant,
          sku: "",
          item_name: item.trim(),
          price_paid: paid,
          card_last4: cardLast4,
          purchase_day: dayFromIso(clock.base_date, date),
          policy_url: page.url,
          claim_form_url: ""
        },
        page.text,
        true
      )
      onDone()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <label>
        Item
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Rain jacket" />
      </label>
      <div className="add-row">
        <label>
          Price paid
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </label>
        <label>
          Bought on
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        Order number <span className="muted">(optional)</span>
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
      </label>
      {err && <p className="error small">{err}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Track this purchase"}
      </button>
    </form>
  )
}

// ---------- Purchase ----------

function PurchaseView({ tp, clock, alerts }: { tp: TrackedPurchase; clock: ClockState; alerts: Alert[] }) {
  const p = tp.purchase
  const [primary, ...rest] = alerts
  return (
    <article className="purchase">
      <header className="purchase-head">
        <div>
          <h1>{p.item_name}</h1>
          <p className="muted small">
            {p.merchant} · paid {usd(p.price_paid)} on {fmtDate(isoDate(clock.base_date, p.purchase_day))}
          </p>
        </div>
      </header>

      {primary ? (
        <AlertCard alert={primary} tp={tp} clock={clock} />
      ) : (
        <p className="all-clear">
          <span className="ok-dot" aria-hidden="true" /> Nothing to do. BackPocket is watching the price and your
          deadlines.
        </p>
      )}
      {rest.map((a) => (
        <AlertCard key={a.id} alert={a} tp={tp} clock={clock} compact />
      ))}

      <section className="block">
        <h2>Price since you bought it</h2>
        <PriceChart tp={tp} today={clock.day} baseDate={clock.base_date} />
        {!p.sku && <ReportLowerPrice tp={tp} />}
      </section>

      <section className="block">
        <h2>Deadlines</h2>
        <Deadlines tp={tp} clock={clock} />
      </section>
    </article>
  )
}

function ReportLowerPrice({ tp }: { tp: TrackedPurchase }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState("")
  const [err, setErr] = useState<string | null>(null)

  if (!open) {
    return (
      <button className="link small lower-price" onClick={() => setOpen(true)}>
        Saw a lower price at {tp.purchase.merchant}?
      </button>
    )
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = Number(price)
    if (!(v > 0)) return setErr("Enter the price you saw.")
    try {
      await reportPrice(tp.purchase.order_id, v)
      setOpen(false)
      setPrice("")
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <form className="lower-price-form" onSubmit={submit}>
      <input
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Price you saw today"
        aria-label="Lower price you saw today"
        autoFocus
      />
      <button className="small-btn">Check</button>
      {err && <span className="error small">{err}</span>}
    </form>
  )
}

// ---------- Alerts ----------

function AlertCard({
  alert,
  tp,
  clock,
  compact = false
}: {
  alert: Alert
  tp: TrackedPurchase
  clock: ClockState
  compact?: boolean
}) {
  const [open, setOpen] = useState(!compact)
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const m = alert.money
  const primaryCite = alert.citations[0]
  const pm = tp.timeline.find((w) => w.label === "Price match")

  const prepare = async () => {
    if (!tp.purchase.claim_form_url) {
      setMessage(draftMessage(tp, alert, clock))
      return
    }
    setBusy(true)
    setState({ text: "Opening the store's form…", ok: true })
    try {
      const r = await prepareClaim(tp, alert, clock)
      const left = r.failed.length + r.unfilled.length
      setState({
        text:
          `Filled ${plural(r.filled.length, "field")} on the store's form` +
          (left ? `, ${left} left for you` : "") +
          ". Check the highlighted fields, then submit it yourself.",
        ok: true
      })
    } catch (e) {
      setState({ text: `Couldn't prepare the form: ${(e as Error).message}`, ok: false })
    } finally {
      setBusy(false)
    }
  }

  let detail: string
  if (alert.kind === "price_drop_claimable") {
    const left = pm ? Math.max(0, pm.closes_day - clock.day) : null
    detail =
      (left !== null ? `${plural(left, "day")} left to claim. ` : "") +
      (m && m.points_reversed
        ? `About ${usd(m.net_estimate)} back after ${m.points_reversed} points are taken back (estimate).`
        : "")
  } else if (alert.kind === "window_closing") {
    detail = m
      ? `Returning refunds ${usd(m.refund)}` +
        (m.points_reversed ? ` and takes back about ${m.points_reversed} points (estimate)` : "") +
        "." +
        (tp.claims_filed.length ? " This doesn't count your pending price adjustment." : "")
      : ""
  } else {
    const n = typeof primaryCite?.value === "number" ? primaryCite.value : null
    detail = n
      ? `The ${n}-day price-match window has closed, so there's no claim to file.`
      : "This store's policy doesn't offer price adjustments."
  }

  const tone =
    alert.kind === "price_drop_claimable" ? "good" : alert.kind === "window_closing" ? "warn" : "info"
  const iconChar = tone === "good" ? "↓" : tone === "warn" ? "!" : "i"

  return (
    <div className={`alert ${tone} ${compact ? "compact" : ""}`}>
      <button
        className="alert-head"
        onClick={() => compact && setOpen((o) => !o)}
        aria-expanded={compact ? open : undefined}
        tabIndex={compact ? 0 : -1}>
        <span className={`alert-icon ${tone}`} aria-hidden="true">
          {iconChar}
        </span>
        <span className="alert-title">{alert.title}</span>
        {compact && <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>}
      </button>
      {open && (
        <div className="alert-body">
          {detail && <p className="detail">{detail}</p>}
          {(showAll ? alert.citations : alert.citations.slice(0, 1)).map((c, i) => (
            <Quote key={i} c={c} policyUrl={tp.policy.source_url} />
          ))}
          {!showAll && alert.citations.length > 1 && (
            <button className="link small" onClick={() => setShowAll(true)}>
              Show the card term behind the points
            </button>
          )}
          {alert.action === "prepare_claim" && !message && (
            <button className="primary" onClick={prepare} disabled={busy}>
              {busy ? "Preparing…" : tp.purchase.claim_form_url ? "Prepare claim form" : "Draft a request message"}
            </button>
          )}
          {message && (
            <div className="message">
              <p className="small">
                <strong>How to send it:</strong> {tp.policy.how_to_request.value ?? "contact customer service"}.
                Review the message, then send it yourself.
              </p>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} />
              <button
                className="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(message)
                  setCopied(true)
                }}>
                {copied ? "Copied" : "Copy message"}
              </button>
              {tp.policy.how_to_request.quote && <Quote c={tp.policy.how_to_request} policyUrl={tp.policy.source_url} />}
            </div>
          )}
          {state && <p className={`small ${state.ok ? "muted" : "error"}`}>{state.text}</p>}
        </div>
      )}
    </div>
  )
}

function Quote({ c, policyUrl }: { c: Cited<unknown>; policyUrl?: string }) {
  const [full, setFull] = useState(false)
  if (!c.quote) return null
  const isCard = c.clause?.startsWith("§")
  const source = isCard ? "Card benefits guide" : "Store policy"
  const href = !isCard && policyUrl && c.clause ? `${policyUrl}#clause-${c.clause}` : undefined
  return (
    <figure className="quote">
      <figcaption>
        {source} {c.clause}
        {href && (
          <a href={href} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </figcaption>
      <blockquote className={full ? "" : "clamp"} onClick={() => setFull((f) => !f)} title={full ? "" : "Show full clause"}>
        “{c.quote}”
      </blockquote>
      <LowConfidence c={c} />
    </figure>
  )
}

function LowConfidence({ c }: { c: Cited<unknown> }) {
  if (c.confidence !== "low") return null
  return <span className="confirm">Please double-check this</span>
}

// ---------- Deadlines ----------

function Deadlines({ tp, clock }: { tp: TrackedPurchase; clock: ClockState }) {
  const rows = tp.timeline.map((w) => deadlineRow(w, clock))
  return (
    <ul className="deadlines">
      {rows.map((r) => (
        <li key={r.key} className={r.dim ? "dim" : ""}>
          <span className={`dot ${r.source}`} aria-hidden="true" />
          <span className="dl-label">
            {r.label}
            {r.sub && <span className="dl-sub">{r.sub}</span>}
          </span>
          <span className={`dl-when ${r.urgent ? "urgent" : ""}`}>{r.when}</span>
        </li>
      ))}
    </ul>
  )
}

function deadlineRow(w: TimelineWindow, clock: ClockState) {
  const left = w.closes_day - clock.day
  const end = fmtDate(isoDate(clock.base_date, w.closes_day), w.long_term)
  const isCard = w.source === "card"
  let label = w.label.split(" (")[0]
  if (label === "Card extended warranty") label = "Extra warranty from your card"
  if (label === "Card return protection") label = "Return protection from your card"

  let when: string
  if (w.status === "claimed") when = "Claim filed ✓"
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

// Hooks for e2e/demo_walk.py and e2e/real_policy.py, which drive the panel's actions directly.
;(window as any).__backpocket = { prepareClaim, readActiveTab, readPolicy, trackPurchase, draftMessage }

export default SidePanel
