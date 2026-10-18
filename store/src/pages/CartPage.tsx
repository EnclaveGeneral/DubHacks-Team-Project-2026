import { Link, useNavigate } from 'react-router-dom'
import { usePrices } from '../api'
import { useCart } from '../cart'
import { findSku, usd } from '../catalog'
import ProductArt from '../components/ProductArt'

export default function CartPage() {
  const cart = useCart()
  const { prices } = usePrices()
  const navigate = useNavigate()
  const subtotal = cart.items.reduce((s, i) => s + prices[i.sku] * i.qty, 0)

  if (!cart.items.length) {
    return (
      <div className="wrap section narrow">
        <h1 className="page-title">Your bag is empty</h1>
        <p className="muted">Rain season is here. The Ridgeline Rain Jacket is a good place to start.</p>
        <Link to="/product/rj-140" className="btn primary">
          Shop the Rain Jacket
        </Link>
      </div>
    )
  }

  return (
    <div className="wrap section">
      <h1 className="page-title">Your bag</h1>
      <div className="checkout-grid">
        <div>
          {cart.items.map((item, i) => {
            const p = findSku(item.sku)!
            const color = p.colors.find((c) => c.name === item.color) ?? p.colors[0]
            return (
              <div key={`${item.sku}-${item.color}-${item.size}`} className="line-item">
                <div className="line-thumb">
                  <ProductArt garment={p.garment} color={color.hex} label="" />
                </div>
                <div>
                  <strong>{p.name}</strong>
                  <p className="muted small">
                    {item.color} · {item.size} · Qty {item.qty}
                  </p>
                  <button className="link small" onClick={() => cart.remove(i)}>
                    Remove
                  </button>
                </div>
                <span>{usd(prices[item.sku] * item.qty)}</span>
              </div>
            )
          })}
        </div>
        <aside className="summary">
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{usd(subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Shipping</span>
            <span>{subtotal >= 75 ? 'Free' : usd(8)}</span>
          </div>
          <button className="btn dark block" onClick={() => navigate('/checkout')}>
            Check out
          </button>
        </aside>
      </div>
    </div>
  )
}
