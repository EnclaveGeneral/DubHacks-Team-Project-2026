import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import ProductPage from './pages/ProductPage'
import ConfirmationPage from './pages/ConfirmationPage'
import ClaimPage from './pages/ClaimPage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/product/rj-140">Ridgeline Outfitters</Link>
        <nav>
          {/* Static page (public/policy.html), not a router route */}
          <a href="/policy.html">Policies</a>
          <Link to="/claim">Price adjustments &amp; returns</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/product/rj-140" replace />} />
          <Route path="/product/rj-140" element={<ProductPage />} />
          <Route path="/confirmation/:orderId" element={<ConfirmationPage />} />
          <Route path="/claim" element={<ClaimPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
