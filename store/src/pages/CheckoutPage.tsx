import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePrices } from '../api'
import { placeOrder, useCart, type LineItem } from '../cart'
import { findSku, usd } from '../catalog'
import ProductArt from '../components/ProductArt'

export default function CheckoutPage() {
  const cart = useCart()
  const { prices, day } = usePrices()
  const navigate = useNavigate()
  const buyNow = (useLocation().state as { buyNow?: LineItem } | null)?.buyNow
  const items = buyNow ? [buyNow] : cart.items
  const [placing, setPlacing] = useState(false)

  if (!items.length) {
    return (
      <div className="wrap section narrow">
        <h1 className="page-title">Nothing to check out</h1>
        <Link to="/collections/new">Keep shopping</Link>
      </div>
    )
  }

  const subtotal = items.reduce((s, i) => s + prices[i.sku] * i.qty, 0)
  const shipping = subtotal >= 75 ? 0 : 8

  const submit = () => {
    setPlacing(true)
    const order = placeOrder({
      day,
      items: items.map((i) => ({ ...i, price: prices[i.sku] })),
      email: 'alex.rivera@example.com',
      name: 'Alex Rivera',
      card: 'Visa ending 4417',
    })
    if (!buyNow) cart.clear()
    setTimeout(() => navigate(`/confirmation/${order.id}`), 600)
  }

  return (
    <div className="wrap section">
      <h1 className="page-title">Checkout</h1>
      <div className="checkout-grid">
        <div className="checkout-steps">
          <section className="step">
            <h2>Contact</h2>
            <p>alex.rivera@example.com</p>
          </section>
          <section className="step">
            <h2>Shipping address</h2>
            <p>
              Alex Rivera
              <br />
              1410 NE Campus Pkwy
              <br />
              Seattle, WA 98195
            </p>
            <p className="muted small">Standard shipping · arrives in 3–5 business days · {shipping ? usd(shipping) : 'Free'}</p>
          </section>
          <section className="step">
            <h2>Payment</h2>
            <label className="saved-card">
              <input type="radio" name="card" defaultChecked />
              <span className="card-brand">VISA</span>
              <span>Visa ending 4417</span>
              <span className="muted small">Expires 09/29</span>
            </label>
          </section>
        </div>

        <aside className="summary">
          <h2>Order summary</h2>
          {items.map((i) => {
            const p = findSku(i.sku)!
            const color = p.colors.find((c) => c.name === i.color) ?? p.colors[0]
            return (
              <div key={`${i.sku}-${i.color}-${i.size}`} className="line-item compact">
                <div className="line-thumb">
                  <ProductArt garment={p.garment} color={color.hex} label="" />
                </div>
                <div>
                  <strong>{p.name}</strong>
                  <p className="muted small">
                    {i.color} · {i.size}
                    {i.qty > 1 && ` · Qty ${i.qty}`}
                  </p>
                </div>
                <span>{usd(prices[i.sku] * i.qty)}</span>
              </div>
            )
          })}
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{usd(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Shipping</span>
            <span>{shipping ? usd(shipping) : 'Free'}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{usd(subtotal + shipping)}</span>
          </div>
          <button className="btn primary block" onClick={submit} disabled={placing}>
            {placing ? 'Placing order…' : 'Place order'}
          </button>
          <p className="muted small">By placing your order you agree to our <a href="/policy.html">return and warranty policy</a>.</p>
        </aside>
      </div>
    </div>
  )
}
