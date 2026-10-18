import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { STORE_SERVER } from '../api'

// Controlled React inputs on purpose: the extension must fire input/change
// events for these to register (IMPLEMENTATION.md §5.6). Keep every
// <label htmlFor>, the field ids, and the "Submit request" button text: the
// extension and e2e/demo_walk.py rely on them.
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
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof EMPTY) =>
    (e: { target: { value: string } }) => {
      const value = e.target.value
      // Functional update so rapid events from the extension's fill loop can't overwrite each other.
      setForm((f) => ({ ...f, [key]: value }))
    }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch(`${STORE_SERVER}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price_paid: form.price_paid ? Number(form.price_paid) : null,
          current_price: form.current_price ? Number(form.current_price) : null,
        }),
      })
      if (!res.ok) throw new Error()
      setConfirmation((await res.json()).confirmation)
    } catch {
      setError("We couldn't send your request. Please try again.")
    }
  }

  return (
    <div className="wrap section">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <span>Customer service</span> / <span>Returns &amp; refunds</span>
      </nav>
      <div className="help-grid">
        <aside className="help-aside">
          <h1 className="page-title">Returns &amp; refunds</h1>
          <p className="help-intro">
            Unworn items with tags can be returned within 30 days for a full refund to your original
            payment method.
          </p>
          <h2 className="faq-title">Common questions</h2>
          <details className="faq">
            <summary>When will I get my refund?</summary>
            <p>Within 3–5 business days after we receive and process your return, to your original form of payment.</p>
          </details>
          <details className="faq">
            <summary>What can't be returned?</summary>
            <p>Items marked Final Sale, and anything worn, washed, or missing its tags.</p>
          </details>
          <details className="faq">
            <summary>Do you offer price adjustments?</summary>
            <p>
              Once per item, if we lower our own price within 14 days after your purchase. We don't match other retailers. Choose
              “Price adjustment” as the request type.
            </p>
          </details>
          <details className="faq">
            <summary>Is my item under warranty?</summary>
            <p>Outerwear is covered for 1 year against defects in materials and workmanship.</p>
          </details>
          <p className="small">
            <a href="/policy.html">Full return &amp; warranty policy</a>
          </p>
        </aside>

        <div className="form-card">
          {confirmation ? (
            <div className="claim-done">
              <span className="check" aria-hidden="true">✓</span>
              <h2>Request received</h2>
              <p>Confirmation number {confirmation}.</p>
              <p className="muted small">We'll email you when it's been reviewed.</p>
            </div>
          ) : (
            <form id="claim-form" onSubmit={onSubmit}>
              <h2>Start a request</h2>
              <p className="muted small form-note">We reply to most requests within 2 business days.</p>

              <label htmlFor="claim_type">Request type</label>
              <select id="claim_type" value={form.claim_type} onChange={set('claim_type')} required>
                <option value="">Choose one</option>
                <option value="price_adjustment">Price adjustment</option>
                <option value="return">Return</option>
              </select>

              <div className="field-row">
                <div>
                  <label htmlFor="order_number">Order number</label>
                  <input id="order_number" value={form.order_number} onChange={set('order_number')} placeholder="RO-00000" required />
                </div>
                <div>
                  <label htmlFor="email">Email address</label>
                  <input id="email" type="email" value={form.email} onChange={set('email')} required />
                </div>
              </div>

              <label htmlFor="item">Item name</label>
              <input id="item" value={form.item} onChange={set('item')} />

              <div className="field-row three">
                <div>
                  <label htmlFor="price_paid">Price paid</label>
                  <input id="price_paid" type="number" step="0.01" value={form.price_paid} onChange={set('price_paid')} />
                </div>
                <div>
                  <label htmlFor="current_price">Current price</label>
                  <input id="current_price" type="number" step="0.01" value={form.current_price} onChange={set('current_price')} />
                </div>
                <div>
                  <label htmlFor="purchase_date">Date of purchase</label>
                  <input id="purchase_date" type="date" value={form.purchase_date} onChange={set('purchase_date')} />
                </div>
              </div>

              <label htmlFor="explanation">Reason for request</label>
              <textarea id="explanation" rows={5} value={form.explanation} onChange={set('explanation')} />

              {error && <p className="error small">{error}</p>}
              <button type="submit" className="btn dark">
                Submit request
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
