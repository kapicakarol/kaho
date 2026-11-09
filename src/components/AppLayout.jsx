import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router'
import { LayoutGrid, Library, PenLine, BarChart3, SlidersHorizontal, ArrowUpRight, Hash } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isDemo } from '../lib/api'
import { Logo, DemoBanner, initials } from './ui'

const NAV = [
  { to: '/app', label: 'Przegląd', icon: LayoutGrid, end: true },
  { to: '/app/library', label: 'Biblioteka', icon: Library },
  { to: '/app/new', label: 'Kreator', icon: PenLine },
  { to: '/app/stats', label: 'Statystyki', icon: BarChart3 },
  { to: '/app/settings', label: 'Ustawienia', icon: SlidersHorizontal },
]

const TitleCtx = createContext(() => {})
export function usePageTitle(title) {
  const set = useContext(TitleCtx)
  useEffect(() => { set(title) }, [set, title])
}

export default function AppLayout() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')

  return (
    <TitleCtx.Provider value={setTitle}>
      <DemoBanner />
      <div className="shell">
        <aside className="sidebar">
          <Link to="/app"><Logo /></Link>
          <div>
            <div className="nav-title">Twoja przestrzeń</div>
            <nav className="nav">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}><Icon />{label}</NavLink>
              ))}
            </nav>
          </div>
          <div className="spacer" />
          <div className="side-quote">
            <ArrowUpRight />
            <div>Mniej klikania.</div>
            <div style={{ color: 'var(--text)' }}>Więcej grania.</div>
          </div>
          <Link to="/app/settings" className="account">
            <span className="avatar">{initials(user?.username)}</span>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.username}</div>
              <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
            </span>
          </Link>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="crumbs">
              <span className="hide-sm">Twoja przestrzeń</span>
              <span className="hide-sm">/</span>
              <b>{title}</b>
            </div>
            <div className="row">
              <span className="badge hide-sm" title={isDemo ? 'Dane zapisane lokalnie' : 'Połączono z Supabase'}>
                <span className={`dot ${isDemo ? '' : 'on'}`} />
                {isDemo ? 'Tryb demo' : 'Supabase'}
              </span>
              <Link to="/join" className="btn btn-sm" target="_blank" rel="noreferrer">
                <Hash /> Dołącz do gry
              </Link>
            </div>
          </header>
          <Outlet />
        </div>
      </div>

      <nav className="mobile-nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon />{label}</NavLink>
        ))}
      </nav>
    </TitleCtx.Provider>
  )
}
