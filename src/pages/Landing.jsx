import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, CheckCircle2, ListChecks, Search, Smartphone, BarChart3, Gauge, Music, PenLine } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Logo, DemoBanner } from '../components/ui'

const FEATURES = [
  { icon: ListChecks, t: 'ABC, Prawda/Fałsz, wielokrotny wybór', d: 'Trzy typy pytań, do 6 odpowiedzi, obrazki.' },
  { icon: PenLine, t: 'Kreator quizów', d: 'Szybka edycja, walidacja, zapis jednym skrótem.' },
  { icon: Search, t: 'Biblioteka i wyszukiwarka', d: 'Twoje quizy + publiczne quizy innych nauczycieli.' },
  { icon: Smartphone, t: 'Telefony bez logowania', d: 'PIN albo kod QR i gramy. Uczeń nie zakłada konta.' },
  { icon: Gauge, t: 'Własna punktacja', d: 'Mnożnik, bonus za szybkość i za serię poprawnych.' },
  { icon: BarChart3, t: 'Statystyki gry', d: 'Wyniki pytań, czasy odpowiedzi, eksport do CSV.' },
  { icon: Music, t: 'Soundtrack', d: 'Generowany na żywo synth — poczekalnia, napięcie, finał.' },
]

export default function Landing() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [pin, setPin] = useState('')

  const go = (e) => {
    e.preventDefault()
    if (pin.length === 6) nav(`/join/${pin}`)
  }

  return (
    <div className="landing">
      <DemoBanner />
      <header className="landing-top">
        <Logo />
        <div className="row">
          {user
            ? <Link to="/app" className="btn btn-primary btn-sm">Mój panel <ArrowRight /></Link>
            : <>
                <Link to="/login" className="btn btn-ghost btn-sm">Zaloguj się</Link>
                <Link to="/login?mode=signup" className="btn btn-primary btn-sm">Załóż konto</Link>
              </>}
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Quizy na żywo, prościej</span>
          <h1 className="h1" style={{ marginTop: 20 }}>
            Cała klasa w grze.<br /><span className="dim">Bez zakładania kont.</span>
          </h1>
          <p className="lead">
            Twórz quizy, uruchom grę na projektorze, a uczniowie dołączają telefonem
            kodem PIN. Punkty, serie i podium liczą się same.
          </p>
          <div className="row wrap">
            <Link to={user ? '/app/new' : '/login?mode=signup'} className="btn btn-primary btn-lg">
              Stwórz quiz <ArrowRight />
            </Link>
            <a href="#jak" className="btn btn-ghost btn-lg">Jak to działa</a>
          </div>
          <p className="small muted row" style={{ marginTop: 18 }}>
            <CheckCircle2 size={15} /> Konto potrzebne tylko nauczycielowi.
          </p>
        </div>

        <form className="join-card" onSubmit={go}>
          <div className="row between" style={{ padding: '4px 6px 14px' }}>
            <span className="row small" style={{ color: 'var(--text-2)' }}><Smartphone size={16} /> Dołącz do gry</span>
            <span className="badge">Bez konta</span>
          </div>
          <div className="card-cream stack" style={{ gap: 16 }}>
            <div className="small muted">Kod PIN z ekranu nauczyciela</div>
            <input className="pin-input" inputMode="numeric" autoComplete="off" placeholder="000000"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-label="Kod PIN" />
            <div style={{ height: 1, background: 'var(--cream-2)' }} />
            <div className="small muted">Następny krok: wybierasz nick — i grasz.</div>
          </div>
          <div className="row between" style={{ padding: '14px 6px 2px' }}>
            <span className="row small muted"><CheckCircle2 size={16} /> {pin.length === 6 ? 'Gotowe do dołączenia' : 'Wpisz 6 cyfr'}</span>
            <button type="submit" className="icon-btn" disabled={pin.length !== 6} aria-label="Dalej"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)', borderColor: 'var(--accent-line)' }}>
              <ArrowRight />
            </button>
          </div>
        </form>
      </section>

      <section id="jak">
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px 22px' }} className="hide-sm">
          <h2 className="h2">Jak to działa</h2>
        </div>
        <div className="how">
          {[
            ['Stwórz quiz', 'W kreatorze albo skopiuj gotowy z biblioteki publicznych quizów.'],
            ['Uruchom grę', 'Ustaw punktację, pokaż PIN i kod QR na projektorze.'],
            ['Grajcie', 'Uczniowie odpowiadają na telefonach. Na koniec podium i statystyki.'],
          ].map(([t, d], i) => (
            <div key={t} className="card">
              <span className="num">0{i + 1}</span>
              <div className="h3">{t}</div>
              <p className="muted" style={{ margin: '6px 0 0' }}>{d}</p>
            </div>
          ))}
        </div>
        <div className="feature-list">
          {FEATURES.map(({ icon: Icon, t, d }) => (
            <div key={t} className="feature">
              <Icon />
              <div><div style={{ fontWeight: 600 }}>{t}</div><div className="small muted">{d}</div></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
