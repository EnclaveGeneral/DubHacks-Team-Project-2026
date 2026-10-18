import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePrices } from '../api'
import { useCart } from '../cart'
import { PRODUCTS, SIZES, findProduct } from '../catalog'
import Price from '../components/Price'
import ProductArt from '../components/ProductArt'
import ProductCard from '../components/ProductCard'

const VIEWS = ['front', 'detail', 'hem'] as const

interface Review {
  stars: number
  title: string
  body: string
  by: string
}

const REVIEWS: Record<string, Review[]> = {
  'RJ-140': [
    {
      stars: 5,
      title: 'Kept me dry through a full day in the Olympics',
      body: 'Hood fits over a helmet, pit zips are a must on the climbs. Runs true to size.',
      by: 'Jordan, Seattle',
    },
    {
      stars: 4,
      title: 'Great shell, sleeves a touch long',
      body: "Light and packable. I'm between sizes and the sleeves are a bit long on me.",
      by: 'Sam, Portland',
    },
  ],
}

const GENERIC_REVIEWS: Review[] = [
  {
    stars: 5,
    title: 'Exactly what I wanted',
    body: 'Well made, true to size, and the color matches the photos.',
    by: 'Riley, Tacoma',
  },
  {
    stars: 4,
    title: 'Solid everyday piece',
    body: 'Comfortable on the trail and around town. Would buy again.',
    by: 'Casey, Bellingham',
  },
]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5 stars`}>
      {'★★★★★'.split('').map((s, i) => (
        <span key={i} className={i < Math.round(rating) ? 'on' : ''}>
          {s}
        </span>
      ))}
    </span>
  )
}

export default function ProductPage() {
  const { slug = 'rj-140' } = useParams()
  const product = findProduct(slug)
  const { prices } = usePrices()
  const cart = useCart()
  const navigate = useNavigate()
  const sizes = product ? SIZES[product.category] : []
  const [colorIdx, setColorIdx] = useState(0)
  const [view, setView] = useState<(typeof VIEWS)[number]>('front')
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0] : '')
  const [added, setAdded] = useState(false)
  const [sizeError, setSizeError] = useState(false)

  if (!product) {
    return (
      <div className="wrap section">
        <h1 className="page-title">We couldn't find that product.</h1>
        <Link to="/collections/new">Keep shopping</Link>
      </div>
    )
  }

  const color = product.colors[colorIdx]
  const price = prices[product.sku]
  const line = () => ({ sku: product.sku, color: color.name, size: size || 'M', qty: 1 })

  const requireSize = () => {
    if (size) return true
    setSizeError(true)
    return false
  }

  return (
    <div className="wrap section">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <Link to={`/collections/${product.category.toLowerCase()}`}>{product.category}</Link> /{' '}
        <span>{product.name}</span>
      </nav>

      <div className="pdp">
        <div className="gallery">
          <div className="gallery-main">
            <ProductArt garment={product.garment} color={color.hex} view={view} label={`${product.name} in ${color.name}`} />
          </div>
          <div className="gallery-thumbs">
            {VIEWS.map((v) => (
              <button key={v} className={v === view ? 'thumb on' : 'thumb'} onClick={() => setView(v)} aria-label={`${v} view`}>
                <ProductArt garment={product.garment} color={color.hex} view={v} label="" />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp-info">
          {product.badge && <p className="eyebrow">{product.badge}</p>}
          <h1>{product.name}</h1>
          <p className="rating">
            <Stars rating={product.rating} /> {product.rating} · <a href="#reviews">{product.reviews} reviews</a>
          </p>
          <Price price={price} listPrice={product.listPrice} large />
          <p className="muted small">or 4 interest-free payments of ${(price / 4).toFixed(2)}</p>

          <div className="option">
            <span className="option-label">
              Color: <strong>{color.name}</strong>
            </span>
            <div className="swatches">
              {product.colors.map((c, i) => (
                <button
                  key={c.name}
                  className={i === colorIdx ? 'swatch on' : 'swatch'}
                  style={{ background: c.hex }}
                  aria-label={c.name}
                  onClick={() => setColorIdx(i)}
                />
              ))}
            </div>
          </div>

          {sizes.length > 1 && (
            <div className="option">
              <span className="option-label">
                Size{size && <>: <strong>{size}</strong></>}
                <a href="#fit" className="size-guide">
                  Size guide
                </a>
              </span>
              <div className="sizes">
                {sizes.map((s) => (
                  <button
                    key={s}
                    className={s === size ? 'size on' : 'size'}
                    onClick={() => {
                      setSize(s)
                      setSizeError(false)
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              {sizeError && <p className="error small">Choose a size.</p>}
            </div>
          )}

          <div className="buy-row">
            <button
              className="btn primary block"
              onClick={() => {
                if (!requireSize()) return
                cart.add(line())
                setAdded(true)
              }}>
              Add to bag
            </button>
            <button
              className="btn dark block"
              onClick={() => {
                if (!requireSize()) return
                navigate('/checkout', { state: { buyNow: line() } })
              }}>
              Buy now
            </button>
          </div>
          {added && (
            <p className="added small">
              Added to your bag. <Link to="/cart">View bag</Link>
            </p>
          )}

          <ul className="perks small">
            <li>Free shipping, arrives in 3–5 business days</li>
            <li>
              Free returns within 30 days (<a href="/policy.html">details</a>)
            </li>
          </ul>

          <p>{product.blurb}</p>

          <details open>
            <summary>Features</summary>
            <ul>
              {product.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
          <details id="fit">
            <summary>Fit &amp; materials</summary>
            <p>Regular fit with room for a midlayer. Model is 6'1" wearing size M.</p>
            <p>{product.materials}</p>
          </details>
          <details>
            <summary>Shipping, returns &amp; warranty</summary>
            <p>
              Free standard shipping on orders over $75. Return unworn items with tags within 30
              days for a full refund. Outerwear carries a 1-year warranty against defects.{' '}
              <a href="/policy.html">Read the full policy</a>.
            </p>
          </details>
        </div>
      </div>

      <section id="reviews" className="section reviews">
        <h2 className="section-title">Reviews</h2>
        <div className="review-summary">
          <span className="big">{product.rating}</span>
          <Stars rating={product.rating} />
          <span className="muted">Based on {product.reviews} reviews</span>
        </div>
        {(REVIEWS[product.sku] ?? GENERIC_REVIEWS).map((r) => (
          <blockquote key={r.title} className="review">
            <Stars rating={r.stars} />
            <strong>{r.title}</strong>
            <p>{r.body}</p>
            <cite>{r.by} · Verified buyer</cite>
          </blockquote>
        ))}
      </section>

      <section className="section">
        <h2 className="section-title">You might also like</h2>
        <div className="product-grid">
          {PRODUCTS.filter((p) => p.sku !== product.sku)
            .slice(0, 4)
            .map((p) => (
              <ProductCard key={p.sku} product={p} price={prices[p.sku]} />
            ))}
        </div>
      </section>
    </div>
  )
}
