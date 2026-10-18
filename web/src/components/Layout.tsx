import { NavLink, Outlet } from 'react-router-dom'
import { fmtDate, isoDate } from '../../../shared/ui/format'
import { useBackPocket } from '../state.tsx'

export default function Layout() {
  const { state, error, jump, reset } = useBackPocket()
  const clock = state?.clock
  const card = state?.selected_card

  return (
    <div className="site">
      <header className="site-top">
        <div className="wrap site-top-row">
          <NavLink to="/" className="brand" end>
            <span className="mark" aria-hidden="true" />
            BackPocket
          </NavLink>
          <nav className="site-nav" aria-label="Main">
            <NavLink to="/" end>
              Purchases
            </NavLink>
            <NavLink to="/card">Your card</NavLink>
          </nav>
          {card && (
            <NavLink to="/card" className="card-chip" title="Card terms">
              <span className="visa">VISA</span> ···· {card.last4}
            </NavLink>
          )}
        </div>
      </header>

      <main className="wrap site-main">
        {error && <p className="banner error">{error}</p>}
        <Outlet />
      </main>

      <footer className="demo-bar" aria-label="Demo clock">
        <div className="wrap demo-row">
          <span className="demo-label">
            Demo day {clock?.day ?? '–'}
            {clock && <span className="muted"> · {fmtDate(isoDate(clock.base_date, clock.day))}</span>}
          </span>
          <div className="demo-buttons">
            {[0, 3, 20, 28].map((d) => (
              <button key={d} className={clock?.day === d ? 'on' : ''} onClick={() => jump(d)}>
                {d}
              </button>
            ))}
            <button onClick={() => clock && jump(clock.day + 1)} aria-label="Next day">
              +1
            </button>
            <button className="reset" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
