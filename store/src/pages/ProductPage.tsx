import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPrice } from '../api'

const SIZES = ['XS', 'S', 'M', 'L', 'XL']

export default function ProductPage() {
  const [price, setPrice] = useState<number | null>(null)
  const [size, setSize] = useState('M')
  const navigate = useNavigate()

  useEffect(() => {
    getPrice('RJ-140').then(setPrice).catch(() => setPrice(null))
  }, [])

  return (
    <section className="product">
      <div className="product-image" aria-label="Ridgeline Rain Jacket in Spruce green" />
      <div className="product-info">
        <p className="eyebrow">Outerwear</p>
        <h1>Ridgeline Rain Jacket</h1>
        <p className="price">
          {price === null ? 'Price unavailable (is the store server running?)' : `$${price.toFixed(2)}`}
        </p>
        <p>
          Fully seamed, 2.5-layer waterproof shell with pit zips and an adjustable hood.
          Color: Spruce.
        </p>

        <fieldset className="sizes">
          <legend>Size</legend>
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={s === size ? 'size selected' : 'size'}
              onClick={() => setSize(s)}
            >
              {s}
            </button>
          ))}
        </fieldset>

        <button className="buy" onClick={() => navigate('/confirmation/RO-10482')}>
          Buy now with Visa ending 4417
        </button>
        <p className="fine-print">
          30-day returns. 14-day price adjustments. <a href="/policy.html">See policy</a>
        </p>
      </div>
    </section>
  )
}
