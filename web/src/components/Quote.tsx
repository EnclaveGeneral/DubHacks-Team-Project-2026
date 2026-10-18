import { useState } from 'react'
import type { Cited } from '../../../shared/ui/types'

// A sentence from the store's policy or the card's guide, with where it came from.
// The fictional stores' policy pages don't exist (their text is in /content), so
// the "Open" link only shows for a real, reachable page.

function linkable(policyUrl?: string): boolean {
  try {
    const host = new URL(policyUrl ?? '').hostname
    return !host.endsWith('.example')
  } catch {
    return false
  }
}

export default function Quote({ c, policyUrl }: { c: Cited<unknown>; policyUrl?: string }) {
  const [full, setFull] = useState(false)
  if (!c.quote) return null
  const isCard = c.clause?.startsWith('§')
  const source = isCard ? 'Card benefits guide' : 'Store policy'
  // A quote from a multi-page retailer policy links to its own page; otherwise
  // link to the clause on the purchase's policy page.
  const href = isCard
    ? undefined
    : c.source_url && linkable(c.source_url)
      ? c.source_url
      : c.clause && linkable(policyUrl)
        ? `${policyUrl}#clause-${c.clause}`
        : undefined
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
      <blockquote
        className={full ? '' : 'clamp'}
        onClick={() => setFull((f) => !f)}
        title={full ? '' : 'Show full clause'}
      >
        “{c.quote}”
      </blockquote>
      {c.confidence === 'low' && <span className="confirm">Please double-check this</span>}
    </figure>
  )
}
