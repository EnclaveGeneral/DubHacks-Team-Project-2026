import { useState, type FormEvent } from 'react'
import type { TrackedPurchase } from '../../../shared/ui/types'
import { reportPrice } from '../api.ts'
import { useBackPocket } from '../state.tsx'

// For items BackPocket can't price-check itself (tracked by hand from a real store).
export default function LowerPrice({ tp }: { tp: TrackedPurchase }) {
  const { refresh } = useBackPocket()
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
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
    if (!(v > 0)) return setErr('Enter the price you saw.')
    try {
      await reportPrice(tp.purchase.order_id, v)
      await refresh()
      setOpen(false)
      setPrice('')
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
