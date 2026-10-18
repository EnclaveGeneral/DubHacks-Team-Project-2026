import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import ProductPage from './pages/ProductPage'
import ConfirmationPage from './pages/ConfirmationPage'
import PolicyPage from './pages/PolicyPage'
import ClaimPage from './pages/ClaimPage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/product/rj-140">Ridgeline Outfitters</Link>
        <nav>
          <Link to="/policy">Policies</Link>
          <Link to="/claim">Price adjustments &amp; returns</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ProductPage />} />
          <Route path="/product/rj-140" element={<ProductPage />} />
          <Route path="/confirmation/:orderId" element={<ConfirmationPage />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="/claim" element={<ClaimPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
