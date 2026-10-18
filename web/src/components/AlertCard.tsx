import { useState } from 'react'
import { draftMessage } from '../../../shared/ui/draft'
import { actionLabel, alertIcon, alertTone, explainAlert } from '../../../shared/ui/explain'
import type { Alert, ClockState, TrackedPurchase } from '../../../shared/ui/types'
import { createHandoff, markClaimFiled } from '../api.ts'
import { useBackPocket } from '../state.tsx'
import Quote from './Quote.tsx'

interface Props {
  alert: Alert
  tp: TrackedPurchase
  clock: ClockState
  /** Open the drafted message straight away (the panel sends people here to draft one). */
  autoDraft?: boolean
}

export default function AlertCard({ alert, tp, clock, autoDraft = false }: Props) {
  const { refresh } = useBackPocket()
  const [message, setMessage] = useState<string | null>(() =>
    autoDraft && alert.action && !tp.purchase.claim_form_url ? draftMessage(tp, alert, clock) : null,
  )
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { detail, steps, result, notes } = explainAlert(alert, tp, clock)
  const tone = alertTone(alert)
  const label = actionLabel(alert, tp)
  const formUrl = tp.purchase.claim_form_url
  const claimType = alert.action === 'prepare_return' ? 'return' : 'price_match'

  // The extension fills the store's own form; the shopper reviews it and submits.
  // The form opens with a single-use code from the service, so only this button
  // (not any link to the form) can make the extension fill it.
  const openForm = async () => {
    if (!formUrl) return
    setErr(null)
    // Open the tab now, inside the click, so popup blockers allow it; point it
    // at the form once the code arrives.
    const tab = window.open('about:blank', '_blank')
    try {
      const { token } = await createHandoff(tp.purchase.order_id, alert.id)
      const url = `${formUrl}#backpocket-handoff=${encodeURIComponent(token)}`
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else {
        window.open(url, '_blank', 'noreferrer')
      }
    } catch (e) {
      tab?.close()
      setErr((e as Error).message)
    }
  }

  const markSent = async () => {
    setBusy(true)
    setErr(null)
    try {
      await markClaimFiled(tp.purchase.order_id, claimType)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      // refresh() swallows its own errors, and the card may stay mounted.
      setBusy(false)
    }
  }

  return (
    <div className={`alert ${tone}`} data-kind={alert.kind}>
      <div className="alert-head">
        <span className={`alert-icon ${tone}`} aria-hidden="true">
          {alertIcon(alert)}
        </span>
        <span className="alert-title">{alert.title}</span>
      </div>
      <div className="alert-body">
        {detail && <p className="detail">{detail}</p>}
        {steps.length > 0 && (
          <ol className="steps">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {result && <p className="result">{result}</p>}
        {notes.length > 0 && <p className="small muted">{notes.join(' ')}</p>}

        {alert.citations.map((c, i) => (
          <Quote key={i} c={c} policyUrl={tp.policy.source_url} />
        ))}

        {label && formUrl && (
          <>
            <button className="primary" onClick={openForm}>
              {label}
            </button>
            <p className="small muted">
              Opens the store's form and fills it in with the BackPocket extension. Check the highlighted fields,
              then submit it yourself.
            </p>
            {err && message === null && <p className="error small">{err}</p>}
          </>
        )}

        {label && !formUrl && !message && (
          <button className="primary" onClick={() => setMessage(draftMessage(tp, alert, clock))}>
            {label}
          </button>
        )}

        {message !== null && (
          <div className="message">
            <p className="small">
              <strong>How to send it:</strong> {tp.policy.how_to_request.value ?? 'contact customer service'}.
              Review the message, then send it yourself.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              aria-label="Message to the store"
            />
            <div className="message-actions">
              <button
                className="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(message)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy message'}
              </button>
              <button className="secondary" onClick={markSent} disabled={busy}>
                {busy ? 'Saving…' : "I've sent it"}
              </button>
            </div>
            {tp.policy.how_to_request.quote && <Quote c={tp.policy.how_to_request} policyUrl={tp.policy.source_url} />}
            {err && <p className="error small">{err}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
