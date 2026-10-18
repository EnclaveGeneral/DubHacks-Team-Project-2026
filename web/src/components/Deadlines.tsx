import { deadlineRow } from '../../../shared/ui/format'
import type { ClockState, TrackedPurchase } from '../../../shared/ui/types'

export default function Deadlines({ tp, clock }: { tp: TrackedPurchase; clock: ClockState }) {
  const rows = tp.timeline.map((w) => deadlineRow(w, clock))
  if (!rows.length) return <p className="muted small">No deadlines found in this store's policy.</p>
  return (
    <ul className="deadlines">
      {rows.map((r) => (
        <li key={r.key} className={r.dim ? 'dim' : ''}>
          <span className={`dot ${r.source}`} aria-hidden="true" />
          <span className="dl-label">
            {r.label}
            {r.sub && <span className="dl-sub">{r.sub}</span>}
          </span>
          <span className={`dl-when ${r.urgent ? 'urgent' : ''}`}>{r.when}</span>
        </li>
      ))}
    </ul>
  )
}
