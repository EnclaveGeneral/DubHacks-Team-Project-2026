import { useCallback, useEffect, useState, type FormEvent } from "react"

import { actionLabel, alertIcon, alertTone, explainAlert } from "../shared/ui/explain"
import {
  actionable,
  currentPrice,
  dayFromIso,
  fmtDate,
  isoDate,
  nextDeadline,
  plural,
  usd
} from "../shared/ui/format"
import {
  SITE,
  getCards,
  getState,
  openSite,
  readPolicy,
  resetDemo,
  selectCard,
  setDay,
  trackPurchase
} from "~lib/api"
import { draftMessage, prepareClaim } from "~lib/claim"
import { readActiveTab, type TabText } from "~lib/readTab"
import type {
  Alert,
  CardCatalogEntry,
  Cited,
  ClockState,
  MerchantPolicy,
  SelectedCard,
  TrackedPurchase
} from "~lib/types"

import "./sidepanel.css"

// The panel is the in-the-moment view: what's tracked from the store in the
// current tab, the one thing to act on, and the next deadline. Price charts,
// every deadline, the quoted clauses and the card terms live on the BackPocket
// website ("More details").

// ---------- Which store is this tab? ----------

const bare = (host: string) => host.replace(/^www\./, "")

/**
 * Which site a URL belongs to, for "this store's purchases". Local dev servers
 * keep their port (localhost:5173 is the store, localhost:5174 is the BackPocket
 * site); real sites compare by registrable domain, so help.store.com and
 * www.store.com are the same store.
 */
function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    const host = bare(u.hostname)
    if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return u.host
    const labels = host.split(".")
    // example.com -> example.com; shop.example.co.uk -> example.co.uk
    const keep = labels.length > 2 && labels[labels.length - 1].length === 2 && labels[labels.length - 2].length <= 3 ? 3 : 2
    return labels.slice(-keep).join(".")
  } catch {
    return null
  }
}

/** Hostname of the active tab, or null when it isn't a web page (then the panel shows everything). */
function useActiveHost(): string | null {
  const [host, setHost] = useState<string | null>(null)
  useEffect(() => {
    const update = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        setHost(tab?.url && /^https?:/.test(tab.url) ? hostOf(tab.url) : null)
      } catch {
        setHost(null)
      }
    }
    update()
    chrome.tabs.onActivated.addListener(update)
    chrome.tabs.onUpdated.addListener(update)
    return () => {
      chrome.tabs.onActivated.removeListener(update)
      chrome.tabs.onUpdated.removeListener(update)
    }
  }, [])
  return host
}

function SidePanel() {
  const [clock, setClock] = useState<ClockState | null>(null)
  const [cards, setCards] = useState<CardCatalogEntry[]>([])
  const [card, setCard] = useState<SelectedCard | null>(null)
  const [cardLoaded, setCardLoaded] = useState(false)
  const [purchases, setPurchases] = useState<TrackedPurchase[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "done"; page: TabText; policy: MerchantPolicy } | null
  >(null)
  const host = useActiveHost()

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

  // This store's purchases first; on a page that isn't a store BackPocket knows, say so.
  const mine = host ? purchases.filter((tp) => hostOf(tp.purchase.policy_url) === host) : purchases
  const others = purchases.length - mine.length
  const stores = new Set(purchases.map((tp) => tp.purchase.merchant)).size
  const urgent = new Set(
    alerts.filter((a) => a.kind !== "card_protection").map((a) => a.purchase_id)
  ).size

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
            <button className="card-chip" onClick={() => openSite("/card")} title="Card terms on BackPocket">
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

      {needsCard && (
        <CardPicker
          cards={cards}
          onPicked={(c) => {
            setCard(c)
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

      {host && purchases.length > 0 && mine.length === 0 && (
        <div className="empty">
          <strong>Nothing tracked from {host}</strong>
          <p>
            You're tracking {plural(purchases.length, "purchase")} from {plural(stores, "store")}
            {urgent ? `, and ${urgent} ${urgent === 1 ? "needs" : "need"} a look` : ""}.
          </p>
        </div>
      )}

      {clock &&
        [...mine].reverse().map((tp) => (
          <PurchaseSummary
            key={tp.purchase.order_id}
            tp={tp}
            clock={clock}
            alerts={actionable(alerts, tp.purchase.order_id)}
          />
        ))}

      {purchases.length > 0 && (
        <p className="all-link">
          <button className="link" onClick={() => openSite("/")}>
            {host && others > 0 && mine.length > 0
              ? `${plural(others, "more purchase")} from other stores. Open BackPocket →`
              : "Open BackPocket to see all purchases →"}
          </button>
        </p>
      )}

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

// First-run setup only. Card terms and switching cards live on the website.
function CardPicker({ cards, onPicked }: { cards: CardCatalogEntry[]; onPicked: (c: SelectedCard) => void }) {
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

  return (
    <section className="sheet">
      <h2>Which card do you use?</h2>
      <p className="small muted">BackPocket reads the card's public benefits guide. No card number or login.</p>
      <div className="card-options">
        {cards.map((c) => (
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
  // A stored retailer policy covers several pages, so "not on this page" would mislead.
  const missing = policy.retailer_id ? "Not stated" : "Not on this page"
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
      value:
        policy.return_window_days.value != null
          ? `Within ${policy.return_window_days.value} days`
          : policy.returns_unlimited?.value
            ? "No time limit"
            : missing,
      cite:
        policy.return_window_days.value == null && policy.returns_unlimited?.value
          ? policy.returns_unlimited
          : policy.return_window_days
    },
    {
      label: "Warranty",
      value: months != null ? (months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`) : missing,
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
          <p className="eyebrow">
            {policy.retailer_id ? `From ${policy.merchant}'s policy pages` : "What this page says"}
          </p>
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

// "https://www.nordstrom.com/browse/customer-service/price-adjustments" -> "price adjustments page"
function pageName(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    const words = decodeURIComponent(last).replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").trim()
    return words && !/^\d+$/.test(words) ? `${words.toLowerCase()} page` : "source page"
  } catch {
    return "source page"
  }
}

function SmallQuote({ c }: { c: Cited<unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="small-quote">
      <button className="link small" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide wording" : "See wording"}
      </button>
      {open && <q>{c.quote}</q>}
      {open && c.source_url && (
        <a className="small source-link" href={c.source_url} target="_blank" rel="noreferrer">
          {pageName(c.source_url)}
        </a>
      )}
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
          policy_url: policy.retailer_id ? policy.source_url : page.url,
          claim_form_url: ""
        },
        policy.retailer_id ? "" : page.text,
        true,
        policy.retailer_id ?? null
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

function PurchaseSummary({ tp, clock, alerts }: { tp: TrackedPurchase; clock: ClockState; alerts: Alert[] }) {
  const p = tp.purchase
  const [primary, ...rest] = alerts
  const now = currentPrice(tp, clock.day)
  const next = nextDeadline(tp, clock.day)
  const details = `/purchases/${encodeURIComponent(p.order_id)}`
  return (
    <article className="purchase">
      <header className="purchase-head">
        <div>
          <h1>{p.item_name}</h1>
          <p className="muted small">
            {p.merchant} · paid {usd(p.price_paid)} on {fmtDate(isoDate(clock.base_date, p.purchase_day))}
            {now < p.price_paid && <> · now {usd(now)}</>}
          </p>
        </div>
      </header>

      {primary ? (
        <AlertSummary alert={primary} tp={tp} clock={clock} />
      ) : (
        <p className="all-clear">
          <span className="ok-dot" aria-hidden="true" /> Nothing to do. BackPocket is watching the price and your
          deadlines.
        </p>
      )}

      <p className="next-deadline small muted">
        {next
          ? `Next deadline: ${next.label}, ${next.left === 0 ? "closes today" : `${plural(next.left, "day")} left`}`
          : "No short-term deadlines open"}
        {rest.length > 0 && ` · ${rest.length} more to look at`}
      </p>
      <button className="link more-details" onClick={() => openSite(details)}>
        More details →
      </button>
    </article>
  )
}

// ---------- Alerts ----------

function AlertSummary({ alert, tp, clock }: { alert: Alert; tp: TrackedPurchase; clock: ClockState }) {
  const [error, setError] = useState<string | null>(null)
  const [filled, setFilled] = useState(false)
  const [busy, setBusy] = useState(false)
  const { detail } = explainAlert(alert, tp, clock)
  const tone = alertTone(alert)
  const label = actionLabel(alert, tp)
  const hasForm = Boolean(tp.purchase.claim_form_url)

  const act = async () => {
    // Stores without a web form: the message is drafted (and copied) on the website.
    if (!hasForm) {
      openSite(`/purchases/${encodeURIComponent(tp.purchase.order_id)}?alert=${encodeURIComponent(alert.id)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await prepareClaim(tp, alert, clock)
      setFilled(true)
    } catch (e) {
      setError(`Couldn't prepare the form: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`alert ${tone}`}>
      <div className="alert-head">
        <span className={`alert-icon ${tone}`} aria-hidden="true">
          {alertIcon(alert)}
        </span>
        <span className="alert-title">{alert.title}</span>
      </div>
      <div className="alert-body">
        {detail && <p className="detail">{detail}</p>}
        {label && (
          <button className={`primary ${filled ? "done" : ""}`} onClick={act} disabled={busy}>
            {busy ? "Preparing…" : filled ? "Form filled ✓ Review it, then submit" : label}
          </button>
        )}
        {error && <p className="small error">{error}</p>}
      </div>
    </div>
  )
}

function LowConfidence({ c }: { c: Cited<unknown> }) {
  if (c.confidence !== "low") return null
  return <span className="confirm">Please double-check this</span>
}

// Hooks for e2e/demo_walk.py and e2e/real_policy.py, which drive the panel's actions directly.
;(window as any).__backpocket = { prepareClaim, readActiveTab, readPolicy, trackPurchase, draftMessage, SITE }

export default SidePanel
