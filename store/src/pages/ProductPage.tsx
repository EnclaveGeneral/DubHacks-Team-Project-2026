import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPrice } from '../api'

// TODO(A): real product page (image, sizes, colors).
export default function ProductPage() {
  const [price, setPrice] = useState<number | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getPrice('RJ-140').then(setPrice).catch(() => setPrice(null))
  }, [])

  return (
    <section>
      <h1>Ridgeline Rain Jacket</h1>
      <p>{price === null ? 'Price unavailable (is the store server running?)' : `$${price.toFixed(2)}`}</p>
      <button onClick={() => navigate('/confirmation/RO-10482')}>Buy now</button>
    </section>
  )
}
