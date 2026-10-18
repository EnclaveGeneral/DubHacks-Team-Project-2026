import { Link } from 'react-router-dom'
import type { Product } from '../catalog'
import ProductArt from './ProductArt'
import Price from './Price'

export default function ProductCard({ product, price }: { product: Product; price: number }) {
  const onSale = price < product.listPrice
  return (
    <Link to={`/product/${product.slug}`} className="product-card">
      <div className="card-media">
        <ProductArt garment={product.garment} color={product.colors[0].hex} label={product.name} />
        {(onSale || product.badge) && (
          <span className={`badge ${onSale ? 'sale' : ''}`}>{onSale ? 'Sale' : product.badge}</span>
        )}
      </div>
      <div className="card-body">
        <div className="swatches small">
          {product.colors.map((c) => (
            <span key={c.name} className="swatch-dot" style={{ background: c.hex }} title={c.name} />
          ))}
        </div>
        <h3>{product.name}</h3>
        <p className="muted">{product.gender === 'Unisex' ? 'Unisex' : `${product.gender}'s`} {product.category.toLowerCase()}</p>
        <Price price={price} listPrice={product.listPrice} />
      </div>
    </Link>
  )
}
