import { Link, useParams } from 'react-router-dom'

// The extension reads the JSON-LD block below. Keep its shape stable.
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
      { '@type': 'ViewAction', name: 'policy', target: `${location.origin}/policy.html` },
      { '@type': 'ViewAction', name: 'claim', target: `${location.origin}/claim` },
    ],
  }

  return (
    <section className="confirmation">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <h1>Thanks for your order</h1>
      <p className="muted">A receipt has been sent to your email.</p>

      <table className="order">
        <tbody>
          <tr><th>Order number</th><td>{orderId}</td></tr>
          <tr><th>Date</th><td>October 18, 2026</td></tr>
          <tr><th>Item</th><td>Ridgeline Rain Jacket, Spruce, M</td></tr>
          <tr><th>Total</th><td>$140.00</td></tr>
          <tr><th>Paid with</th><td>Visa ending 4417</td></tr>
        </tbody>
      </table>

      <p>
        <a href="/policy.html">Returns and price adjustment policy</a>
        {' · '}
        <Link to="/claim">Request a price adjustment or return</Link>
      </p>
    </section>
  )
}
