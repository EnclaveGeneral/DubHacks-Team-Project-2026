import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PRIORITY, actionable, currentPrice, fmtDate, isoDate, nextDeadline, plural, usd } from '../../../shared/ui/format'
import { alertIcon, alertTone, explainAlert } from '../../../shared/ui/explain'
import type { Alert, ClockState, TrackedPurchase } from '../../../shared/ui/types'
import { useBackPocket } from '../state.tsx'

interface Row {
  tp: TrackedPurchase
  alerts: Alert[]
}

export default function Dashboard() {
  const { state } = useBackPocket()
  const [store, setStore] = useState<string>('all')

  const rows = useMemo<Row[]>(() => {
    if (!state) return []
    const all = state.purchases.map((tp) => ({ tp, alerts: actionable(state.alerts, tp.purchase.order_id) }))
    // Things to act on first (most valuable kind first), then the rest by newest purchase.
    return all.sort((a, b) => {
      const ra = a.alerts[0] ? PRIORITY[a.alerts[0].kind] : 99
      const rb = b.alerts[0] ? PRIORITY[b.alerts[0].kind] : 99
      return ra - rb || b.tp.purchase.purchase_day - a.tp.purchase.purchase_day
    })
  }, [state])

  if (!state) return <p className="muted">Loading your purchases…</p>

  const { clock } = state
  const merchants = [...new Set(state.purchases.map((tp) => tp.purchase.merchant))]
  const shown = rows.filter((r) => store === 'all' || r.tp.purchase.merchant === store)
  const needAttention = rows.filter((r) => r.alerts.length > 0)
  // Estimates from the top alert on each purchase.
  const recoverable = needAttention.reduce((sum, r) => sum + Math.max(0, r.alerts[0].money?.net_estimate ?? 0), 0)

  if (state.purchases.length === 0) {
    return (
      <div className="empty">
        <strong>No purchases yet</strong>
        <p>
          Buy something at a store BackPocket knows and turn on “Protect this purchase”, or use “Read this page”
          in the extension on any store's policy. For sample data, press Reset in the bar below.
        </p>
      </div>
    )
  }

  return (
    <>
      <section className="summary" aria-label="Summary">
        <div className="stat">
          <span className="stat-num">{state.purchases.length}</span>
          <span className="stat-label">
            {state.purchases.length === 1 ? 'purchase' : 'purchases'} from {plural(merchants.length, 'store')}
          </span>
        </div>
        <div className="stat">
          <span className="stat-num">{needAttention.length}</span>
          <span className="stat-label">{needAttention.length === 1 ? 'needs' : 'need'} a look</span>
        </div>
        <div className="stat">
          <span className="stat-num">{usd(recoverable)}</span>
          <span className="stat-label">possible savings (estimate)</span>
        </div>
      </section>

      <div className="filters" role="group" aria-label="Filter by store">
        {['all', ...merchants].map((m) => (
          <button key={m} className={`chip ${store === m ? 'on' : ''}`} onClick={() => setStore(m)}>
            {m === 'all' ? 'All stores' : m}
          </button>
        ))}
      </div>

      <div className="purchase-grid">
        {shown.map(({ tp, alerts }) => (
          <PurchaseCard key={tp.purchase.order_id} tp={tp} alerts={alerts} clock={clock} />
        ))}
      </div>
    </>
  )
}

function PurchaseCard({ tp, alerts, clock }: { tp: TrackedPurchase; alerts: Alert[]; clock: ClockState }) {
  const p = tp.purchase
  const now = currentPrice(tp, clock.day)
  const next = nextDeadline(tp, clock.day)
  const [top] = alerts
  const detail = top ? explainAlert(top, tp, clock).detail : null
  const filed = tp.claims_filed.length > 0
  return (
    <article className="purchase-card" data-order={p.order_id}>
      <header>
        <h2>
          <Link to={`/purchases/${encodeURIComponent(p.order_id)}`}>{p.item_name}</Link>
        </h2>
        <p className="muted small">
          {p.merchant} · paid {usd(p.price_paid)} on {fmtDate(isoDate(clock.base_date, p.purchase_day))}
          {now < p.price_paid && (
            <>
              {' '}
              · <strong className="now-price">now {usd(now)}</strong>
            </>
          )}
        </p>
      </header>

      {top ? (
        <div className={`alert ${alertTone(top)}`}>
          <div className="alert-head">
            <span className={`alert-icon ${alertTone(top)}`} aria-hidden="true">
              {alertIcon(top)}
            </span>
            <span className="alert-title">{top.title}</span>
          </div>
          {detail && <p className="detail">{detail}</p>}
        </div>
      ) : (
        <p className="all-clear">
          <span className="ok-dot" aria-hidden="true" />
          {filed ? 'Request filed. Waiting on the store.' : 'Nothing to do right now.'}
        </p>
      )}

      <footer>
        <span className="small muted">
          {next
            ? `${next.label}: ${next.left === 0 ? 'closes today' : `${plural(next.left, 'day')} left`}`
            : 'No short-term deadlines open'}
        </span>
        <Link className="more" to={`/purchases/${encodeURIComponent(p.order_id)}`}>
          More details →
        </Link>
      </footer>
    </article>
  )
}
