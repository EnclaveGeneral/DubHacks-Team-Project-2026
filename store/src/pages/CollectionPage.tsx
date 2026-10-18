import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePrices } from '../api'
import { PRODUCTS, type Product } from '../catalog'
import ProductCard from '../components/ProductCard'

type Prices = Record<string, number>

const COLLECTIONS: Record<string, { title: string; filter: (p: Product, prices: Prices) => boolean }> = {
  new: { title: 'New arrivals', filter: () => true },
  men: { title: "Men's", filter: (p) => p.gender !== 'Women' },
  women: { title: "Women's", filter: (p) => p.gender !== 'Men' },
  outerwear: { title: 'Outerwear', filter: (p) => p.category === 'Outerwear' },
  layers: { title: 'Layers', filter: (p) => p.category === 'Layers' },
  bottoms: { title: 'Trail pants', filter: (p) => p.category === 'Bottoms' },
  accessories: { title: 'Gear & accessories', filter: (p) => p.category === 'Accessories' },
  sale: { title: 'Sale', filter: (p, prices) => prices[p.sku] < p.listPrice },
}

type Sort = 'featured' | 'low' | 'high'

export default function CollectionPage() {
  const { handle = 'new' } = useParams()
  const { prices } = usePrices()
  const [sort, setSort] = useState<Sort>('featured')
  const collection = COLLECTIONS[handle] ?? COLLECTIONS.new

  const items = PRODUCTS.filter((p) => collection.filter(p, prices))
  if (sort !== 'featured') {
    items.sort((a, b) => (sort === 'low' ? 1 : -1) * (prices[a.sku] - prices[b.sku]))
  }

  return (
    <div className="wrap section">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <span>{collection.title}</span>
      </nav>
      <div className="section-head">
        <h1 className="page-title">{collection.title}</h1>
        <label className="sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="featured">Featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      <p className="muted">
        {items.length} {items.length === 1 ? 'product' : 'products'}
      </p>
      {items.length === 0 && (
        <div className="empty-state">
          <strong>Nothing on sale right now.</strong>
          <p className="muted">New markdowns land often. <Link to="/collections/new">Shop new arrivals</Link></p>
        </div>
      )}
      <h2 className="visually-hidden">Products</h2>
      <div className="product-grid">
        {items.map((p) => (
          <ProductCard key={p.sku} product={p} price={prices[p.sku]} />
        ))}
      </div>
    </div>
  )
}
