import { useState, type FormEvent } from 'react'
import { STORE_SERVER } from '../api'

// Controlled React inputs on purpose: the extension must fire input/change
// events for these to register (IMPLEMENTATION.md §5.6). Keep every <label for>.
// TODO(A): styling. Build this page first (hours 2–4) so C can run the fill spike.
const EMPTY = {
  claim_type: '',
  order_number: '',
  email: '',
  item: '',
  price_paid: '',
  current_price: '',
  purchase_date: '',
  explanation: '',
}

export default function ClaimPage() {
  const [form, setForm] = useState(EMPTY)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const set = (key: keyof typeof EMPTY) =>
    (e: { target: { value: string } }) => {
      const value = e.target.value
      // Functional update so rapid events from the extension's fill loop can't overwrite each other.
      setForm((f) => ({ ...f, [key]: value }))
    }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const res = await fetch(`${STORE_SERVER}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        price_paid: form.price_paid ? Number(form.price_paid) : null,
        current_price: form.current_price ? Number(form.current_price) : null,
      }),
    })
    setConfirmation((await res.json()).confirmation)
  }

  if (confirmation) {
    return <p>Request received. Confirmation number {confirmation}.</p>
  }

  return (
    <form id="claim-form" onSubmit={onSubmit}>
      <h1>Price Adjustment and Returns</h1>

      <label htmlFor="claim_type">Request type</label>
      <select id="claim_type" value={form.claim_type} onChange={set('claim_type')}>
        <option value="">Choose one</option>
        <option value="price_adjustment">Price adjustment</option>
        <option value="return">Return</option>
      </select>

      <label htmlFor="order_number">Order number</label>
      <input id="order_number" value={form.order_number} onChange={set('order_number')} />

      <label htmlFor="email">Email address</label>
      <input id="email" type="email" value={form.email} onChange={set('email')} />

      <label htmlFor="item">Item name</label>
      <input id="item" value={form.item} onChange={set('item')} />

      <label htmlFor="price_paid">Price paid</label>
      <input id="price_paid" type="number" step="0.01" value={form.price_paid} onChange={set('price_paid')} />

      <label htmlFor="current_price">Current price</label>
      <input id="current_price" type="number" step="0.01" value={form.current_price} onChange={set('current_price')} />

      <label htmlFor="purchase_date">Date of purchase</label>
      <input id="purchase_date" type="date" value={form.purchase_date} onChange={set('purchase_date')} />

      <label htmlFor="explanation">Reason for request</label>
      <textarea id="explanation" rows={4} value={form.explanation} onChange={set('explanation')} />

      <button type="submit">Submit request</button>
    </form>
  )
}
