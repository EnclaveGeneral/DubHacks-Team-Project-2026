import { Link, useParams } from 'react-router-dom'
import { loadOrder, type Order } from '../cart'
import { dateForDay, findSku, fmtDate, usd } from '../catalog'
import ProductArt from '../components/ProductArt'

// Shown when the page is opened directly (no order saved in this browser).
const DEMO_ORDER: Order = {
  id: 'RO-10482',
  day: 0,
  items: [{ sku: 'RJ-140', color: 'Spruce', size: 'M', qty: 1, price: 140 }],
  email: 'alex.rivera@example.com',
  name: 'Alex Rivera',
  card: 'Visa ending 4417',
}

export default function ConfirmationPage() {
  const { orderId = 'RO-10482' } = useParams()
  const order = loadOrder(orderId) ?? { ...DEMO_ORDER, id: orderId }
  const date = dateForDay(order.day)
  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0)
  const shipping = subtotal >= 75 ? 0 : 8

  // The extension reads this JSON-LD block. Keep its shape stable.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Order',
    orderNumber: order.id,
    orderDate: date.toISOString().slice(0, 10),
    seller: { '@type': 'Organization', name: 'Ridgeline Outfitters' },
    customer: { '@type': 'Person', name: order.name },
    acceptedOffer: order.items.map((i) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Product', name: findSku(i.sku)!.name, sku: i.sku, color: i.color, size: i.size },
      price: i.price,
      priceCurrency: 'USD',
    })),
    paymentMethod: order.card,
    potentialAction: [
      { '@type': 'ViewAction', name: 'policy', target: `${location.origin}/policy.html` },
      { '@type': 'ViewAction', name: 'claim', target: `${location.origin}/claim` },
    ],
  }

  return (
    <div className="wrap section narrow">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <div className="confirm-head">
        <span className="check" aria-hidden="true">✓</span>
        <div>
          <p className="muted small">Order {order.id}</p>
          <h1 className="page-title">Thanks for your order, {order.name.split(' ')[0]}!</h1>
        </div>
      </div>
      <p>
        We've emailed a receipt to <strong>{order.email}</strong>. Your order should arrive in 3–5
        business days.
      </p>

      <div className="confirm-card">
        {order.items.map((i) => {
          const p = findSku(i.sku)!
          const color = p.colors.find((c) => c.name === i.color) ?? p.colors[0]
          return (
            <div key={`${i.sku}-${i.color}-${i.size}`} className="line-item">
              <div className="line-thumb">
                <ProductArt garment={p.garment} color={color.hex} label="" />
              </div>
              <div>
                <strong>{p.name}</strong>
                <p className="muted small">
                  {i.color} · {i.size} · Qty {i.qty}
                </p>
              </div>
              <span>{usd(i.price * i.qty)}</span>
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
      </div>

      <div className="confirm-details">
        <div>
          <h2>Order date</h2>
          <p>{fmtDate(date)}</p>
        </div>
        <div>
          <h2>Paid with</h2>
          <p>{order.card}</p>
        </div>
        <div>
          <h2>Ship to</h2>
          <p>
            {order.name}
            <br />
            Seattle, WA 98195
          </p>
        </div>
      </div>

      <p className="muted small">
        Changed your mind? Returns are free within 30 days, and we'll refund the difference if our
        price drops within 14 days. <a href="/policy.html">Read the policy</a> ·{' '}
        <Link to="/claim">Request a price adjustment or return</Link>
      </p>
    </div>
  )
}
