import { Link, useParams } from 'react-router-dom'

// TODO(A): full confirmation layout. Keep the JSON-LD block: the extension reads it.
export default function ConfirmationPage() {
  const { orderId = 'RO-10482' } = useParams()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Order',
    orderNumber: orderId,
    orderDate: '2026-10-18',
    seller: { '@type': 'Organization', name: 'Ridgeline Outfitters' },
    acceptedOffer: {
      '@type': 'Offer',
      itemOffered: { '@type': 'Product', name: 'Ridgeline Rain Jacket', sku: 'RJ-140' },
      price: 140.0,
      priceCurrency: 'USD',
    },
    paymentMethod: 'Visa ending 4417',
    potentialAction: [
      { '@type': 'ViewAction', name: 'policy', target: `${location.origin}/policy` },
      { '@type': 'ViewAction', name: 'claim', target: `${location.origin}/claim` },
    ],
  }

  return (
    <section>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <h1>Thanks for your order</h1>
      <p>Order {orderId}: Ridgeline Rain Jacket, $140.00, paid with Visa ending 4417.</p>
      <p>
        <Link to="/policy">Returns and price adjustment policy</Link>
      </p>
    </section>
  )
}
