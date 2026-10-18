import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useCart } from '../cart'

const icon = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z',
  bag: 'M7 8V7a5 5 0 0 1 10 0v1h3l-1 13H5L4 8h3Zm2 0h6V7a3 3 0 0 0-6 0v1Z',
}

export function Icon({ d, label }: { d: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label || undefined}>
      <path d={d} fill="currentColor" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Ridgeline Outfitters home">
      <svg viewBox="0 0 32 20" width="34" height="22" aria-hidden="true">
        <path d="M1 19 L11 5 L16 11 L21 3 L31 19 Z" fill="currentColor" />
      </svg>
      <span>
        RIDGELINE <em>OUTFITTERS</em>
      </span>
    </Link>
  )
}

function Header() {
  const { count } = useCart()
  return (
    <>
      <div className="announcement">
        Free shipping over $75 · 30-day returns · 14-day price adjustments
      </div>
      <header className="site-header">
        <div className="wrap header-row">
          <Logo />
          <nav className="main-nav" aria-label="Shop">
            <NavLink to="/collections/new">New</NavLink>
            <NavLink to="/collections/men">Men</NavLink>
            <NavLink to="/collections/women">Women</NavLink>
            <NavLink to="/collections/outerwear">Outerwear</NavLink>
            <NavLink to="/collections/accessories">Gear</NavLink>
          </nav>
          <div className="header-icons">
            <button className="icon-btn" aria-label="Search">
              <Icon d={icon.search} label="" />
            </button>
            <button className="icon-btn" aria-label="Account">
              <Icon d={icon.user} label="" />
            </button>
            <Link to="/cart" className="icon-btn bag" aria-label={`Bag, ${count} items`}>
              <Icon d={icon.bag} label="" />
              {count > 0 && <span className="bag-count">{count}</span>}
            </Link>
          </div>
        </div>
      </header>
    </>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <Logo />
          <p className="footer-note">Gear for wet trails and long weekends. Made to be repaired, not replaced.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <Link to="/collections/men">Men</Link>
          <Link to="/collections/women">Women</Link>
          <Link to="/collections/outerwear">Outerwear</Link>
          <Link to="/collections/accessories">Gear</Link>
        </div>
        <div>
          <h4>Help</h4>
          <Link to="/claim">Price adjustments &amp; returns</Link>
          <a href="/policy.html">Return &amp; warranty policy</a>
          <a href="/policy.html#clause-6.1">Warranty</a>
          <Link to="/cart">Your bag</Link>
        </div>
        <div>
          <h4>Stay in the loop</h4>
          <p className="footer-note">Trail reports and early access to sales.</p>
          <form className="newsletter" onSubmit={(e) => e.preventDefault()}>
            <input type="email" placeholder="Email address" aria-label="Email address" />
            <button type="submit">Sign up</button>
          </form>
        </div>
      </div>
      <div className="wrap footer-legal">
        © 2026 Ridgeline Outfitters (a fictional store for the BackPocket demo)
      </div>
    </footer>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="site-main">{children}</main>
      <Footer />
    </>
  )
}
