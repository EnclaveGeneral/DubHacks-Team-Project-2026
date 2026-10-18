import { useEffect, useState } from 'react'
import type { CardCatalogEntry, Cited, SelectedCard } from '../../../shared/ui/types'
import { getCards, selectCard } from '../api.ts'
import { useBackPocket } from '../state.tsx'

function LowConfidence({ c }: { c: Cited<unknown> }) {
  if (c.confidence !== 'low') return null
  return <span className="confirm">Please double-check this</span>
}

export default function CardPage() {
  const { state, refresh } = useBackPocket()
  const [cards, setCards] = useState<CardCatalogEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getCards().then(setCards).catch((e: Error) => setErr(e.message))
  }, [])

  if (!state) return <p className="muted">Loading…</p>
  const card: SelectedCard | null = state.selected_card
  const b = card?.benefits

  const pick = async (id: string) => {
    setBusy(id)
    setErr(null)
    try {
      await selectCard(id)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className="detail-head">
        <div>
          <h1>{b ? (cards.find((c) => c.card_id === card?.card_id)?.product_name ?? b.display_name) : 'Your card'}</h1>
          <p className="muted">
            BackPocket reads your card's public benefits guide. It never asks for a card number or login, and what
            it shows here is an estimate.
          </p>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          {b ? (
            <section className="card-block" aria-label="Card terms">
              <h2>What the guide says</h2>
              <dl className="terms wide">
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
                    {b.reversal_rule.value === 'proportional'
                      ? 'Points on the refunded amount are taken back'
                      : b.reversal_rule.value === 'none'
                        ? 'You keep your points'
                        : b.reversal_rule.value === 'threshold'
                          ? `Points taken back on refunds over $${b.reversal_threshold_dollars.value}`
                          : 'All points on the purchase are taken back'}
                    <LowConfidence c={b.reversal_rule} />
                  </dd>
                </div>
                {b.protections.map((p) => (
                  <div key={p.type} className="term-row">
                    <dt>{p.type === 'extended_warranty' ? 'Warranty' : 'Returns'}</dt>
                    <dd>
                      {p.type === 'extended_warranty'
                        ? `May add ${p.extends_months.value} months to the maker's warranty`
                        : `May refund returns a store refuses, within ${p.window_days.value} days`}
                      <span className="small muted"> Confirm with your issuer.</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <details>
                <summary>Everything BackPocket read from the benefits guide</summary>
                <pre className="json">{JSON.stringify(b, null, 2)}</pre>
              </details>
            </section>
          ) : (
            <section className="card-block">
              <h2>Which card do you use?</h2>
              <p className="muted small">Pick one below and BackPocket will read its guide.</p>
            </section>
          )}
        </div>

        <aside className="detail-side">
          <section className="card-block" aria-label="Switch card">
            <h2>{card ? 'Switch card' : 'Choose a card'}</h2>
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
            {card && (
              <p className="small muted">
                Card benefits only apply to purchases made with the selected card (ending {card.last4}).
              </p>
            )}
            {err && <p className="error small">{err}</p>}
          </section>
        </aside>
      </div>
    </>
  )
}
