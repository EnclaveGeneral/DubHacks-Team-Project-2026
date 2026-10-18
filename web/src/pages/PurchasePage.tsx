import { Link, useParams, useSearchParams } from 'react-router-dom'
import { actionable, currentPrice, fmtDate, isoDate, usd } from '../../../shared/ui/format'
import type { Cited, TrackedPurchase } from '../../../shared/ui/types'
import AlertCard from '../components/AlertCard.tsx'
import Deadlines from '../components/Deadlines.tsx'
import LowerPrice from '../components/LowerPrice.tsx'
import PriceChart from '../components/PriceChart.tsx'
import Quote from '../components/Quote.tsx'
import { useBackPocket } from '../state.tsx'

export default function PurchasePage() {
  const { orderId = '' } = useParams()
  const [params] = useSearchParams()
  const { state } = useBackPocket()
  if (!state) return <p className="muted">Loading…</p>

  const tp = state.purchases.find((t) => t.purchase.order_id === orderId)
  if (!tp) {
    return (
      <div className="empty">
        <strong>We can't find that purchase</strong>
        <p>
          It may have been cleared by a reset. <Link to="/">Back to all purchases</Link>
        </p>
      </div>
    )
  }

  const { clock } = state
  const p = tp.purchase
  const now = currentPrice(tp, clock.day)
  const alerts = actionable(state.alerts, orderId)
  const protections = state.alerts.filter((a) => a.purchase_id === orderId && a.kind === 'card_protection')
  const openAlert = params.get('alert')

  return (
    <>
      <p className="crumbs small">
        <Link to="/">← All purchases</Link>
      </p>

      <header className="detail-head">
        <div>
          <h1>{p.item_name}</h1>
          <p className="muted">
            {p.merchant} · order {p.order_id.startsWith('M-') ? 'added by hand' : p.order_id} · bought{' '}
            {fmtDate(isoDate(clock.base_date, p.purchase_day), true)}
          </p>
        </div>
        <div className="price-block">
          <span className="price-now">{usd(now)}</span>
          <span className="muted small">
            {now < p.price_paid ? `you paid ${usd(p.price_paid)}` : `you paid ${usd(p.price_paid)}, no drop yet`}
          </span>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card-block" aria-label="What to do">
            <h2>What to do</h2>
            {alerts.length ? (
              alerts.map((a) => (
                <AlertCard key={a.id} alert={a} tp={tp} clock={clock} autoDraft={openAlert === a.id} />
              ))
            ) : (
              <p className="all-clear">
                <span className="ok-dot" aria-hidden="true" />
                {tp.claims_filed.length
                  ? 'You filed a request. BackPocket keeps watching the price and your deadlines.'
                  : 'Nothing to do. BackPocket is watching the price and your deadlines.'}
              </p>
            )}
          </section>

          <section className="card-block" aria-label="Price since you bought it">
            <h2>Price since you bought it</h2>
            <PriceChart tp={tp} today={clock.day} baseDate={clock.base_date} />
            {!p.sku && <LowerPrice tp={tp} />}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card-block" aria-label="Deadlines">
            <h2>Deadlines</h2>
            <Deadlines tp={tp} clock={clock} />
          </section>

          {protections.length > 0 && (
            <section className="card-block" aria-label="Your card">
              <h2>Your card may help</h2>
              {protections.map((a) => (
                <div key={a.id} className="protection">
                  <p>{a.body}</p>
                  {a.citations.map((c, i) => (
                    <Quote key={i} c={c} />
                  ))}
                </div>
              ))}
              <Link className="small" to="/card">
                See your card's terms
              </Link>
            </section>
          )}

          <PolicyTerms tp={tp} />
        </aside>
      </div>
    </>
  )
}

function PolicyTerms({ tp }: { tp: TrackedPurchase }) {
  const pol = tp.policy
  const pm = pol.price_match
  const months = pol.manufacturer_warranty_months.value
  const rows: { label: string; value: string; cite: Cited<unknown> }[] = [
    {
      label: 'Price adjustment',
      value:
        pm.allowed.value === false
          ? 'Not offered'
          : pm.window_days.value != null
            ? `Within ${pm.window_days.value} days`
            : 'Not stated',
      cite: pm.window_days.quote ? pm.window_days : pm.allowed,
    },
    {
      label: 'Returns',
      value: pol.return_window_days.value != null ? `Within ${pol.return_window_days.value} days` : 'Not stated',
      cite: pol.return_window_days,
    },
    {
      label: 'Warranty',
      value:
        months != null
          ? months % 12 === 0
            ? `${months / 12} year${months === 12 ? '' : 's'}`
            : `${months} months`
          : 'Not stated',
      cite: pol.manufacturer_warranty_months,
    },
    { label: 'How to ask', value: pol.how_to_request.value ?? 'Not stated', cite: pol.how_to_request },
  ]
  return (
    <section className="card-block" aria-label="Store policy">
      <h2>What {pol.merchant} says</h2>
      <dl className="terms">
        {rows.map((r) => (
          <div key={r.label} className="term-row">
            <dt>{r.label}</dt>
            <dd>
              {r.value}
              <Quote c={r.cite} policyUrl={pol.source_url} />
            </dd>
          </div>
        ))}
      </dl>
      {pm.conditions.length > 0 && (
        <details>
          <summary>
            {pm.conditions.length} condition{pm.conditions.length === 1 ? '' : 's'} on price adjustments
          </summary>
          <ul className="conditions">
            {pm.conditions.map((c, i) => (
              <li key={i}>{String(c.value)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
