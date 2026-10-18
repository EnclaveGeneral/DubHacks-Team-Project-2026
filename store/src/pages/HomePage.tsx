import { Link } from 'react-router-dom'
import { usePrices } from '../api'
import { PRODUCTS, findSku } from '../catalog'
import ProductArt from '../components/ProductArt'
import ProductCard from '../components/ProductCard'

const TILES = [
  { to: '/collections/outerwear', label: 'Outerwear', sku: 'RJ-140', color: '#b5482b' },
  { to: '/collections/layers', label: 'Layers', sku: 'BF-078', color: '#5b6b3a' },
  { to: '/collections/bottoms', label: 'Trail pants', sku: 'SP-085', color: '#2d3446' },
  { to: '/collections/accessories', label: 'Gear', sku: 'LP-058', color: '#4b5a66' },
]

export default function HomePage() {
  const { prices } = usePrices()
  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Fall 2026 · Rain season</p>
            <h1>Built for the wet half of the year.</h1>
            <p>
              The Ridgeline Rain Jacket is back in three new colors. Fully taped, pit-zipped,
              and light enough to forget it's in your pack.
            </p>
            <div className="hero-ctas">
              <Link to="/product/rj-140" className="btn primary">
                Shop the Rain Jacket
              </Link>
              <Link to="/collections/outerwear" className="btn ghost">
                All outerwear
              </Link>
            </div>
          </div>
          <div className="hero-art">
            <ProductArt garment="shell" color="#2f5d4a" label="Ridgeline Rain Jacket in Spruce" />
          </div>
        </div>
      </section>

      <section className="wrap section">
        <h2 className="section-title">Shop by category</h2>
        <div className="tiles">
          {TILES.map((t) => {
            const p = findSku(t.sku)!
            return (
              <Link key={t.to} to={t.to} className="tile">
                <ProductArt garment={p.garment} color={t.color} label="" />
                <span>{t.label}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2 className="section-title">New this season</h2>
          <Link to="/collections/new">View all</Link>
        </div>
        <div className="product-grid">
          {PRODUCTS.slice(0, 4).map((p) => (
            <ProductCard key={p.sku} product={p} price={prices[p.sku]} />
          ))}
        </div>
      </section>

      <section className="wrap section promise">
        <div>
          <strong>Free shipping &amp; returns</strong>
          <span>Free shipping over $75. Free returns within 30 days.</span>
        </div>
        <div>
          <strong>Built to be repaired</strong>
          <span>Every jacket carries a 1-year warranty. We fix tears and zippers.</span>
        </div>
        <div>
          <strong>Made with recycled materials</strong>
          <span>Most of our shells and fleece use recycled nylon and polyester.</span>
        </div>
      </section>
    </>
  )
}
