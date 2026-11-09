import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isDemo } from '../lib/api'
import { Logo, Field, ErrorBox, Segmented, DemoBanner } from '../components/ui'

export default function Login() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState('')
  const next = params.get('next') || '/app'

  if (user) return <Navigate to={next} replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo('')
    try {
      if (mode === 'signup') {
        const r = await signUp(email, password, username)
        if (r?.needsConfirmation) {
          setInfo('Konto utworzone. Potwierdź adres e-mail (link w skrzynce), potem się zaloguj.')
          setMode('signin')
          return
        }
      } else {
        await signIn(email, password)
      }
      nav(next, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DemoBanner />
      <div className="auth-wrap">
        <div className="auth-card stack lg">
          <Link to="/"><Logo /></Link>
          <div>
            <span className="eyebrow">Dla nauczycieli i twórców</span>
            <h1 className="h2" style={{ marginTop: 14 }}>
              {mode === 'signup' ? 'Załóż konto.' : 'Witaj ponownie.'}
              <br /><span className="dim">Uczniowie nie potrzebują konta.</span>
            </h1>
          </div>
          <Segmented value={mode} onChange={(m) => { setMode(m); setError(null) }}
            options={[{ value: 'signin', label: 'Logowanie' }, { value: 'signup', label: 'Rejestracja' }]} />
          <form className="stack" onSubmit={submit}>
            {mode === 'signup' && (
              <Field label="Nazwa (widoczna przy publicznych quizach)">
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)}
                  maxLength={30} placeholder="np. pani_ania" autoComplete="nickname" />
              </Field>
            )}
            <Field label="E-mail">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" placeholder="nauczyciel@szkola.pl" />
            </Field>
            <Field label="Hasło" hint={mode === 'signup' ? 'Minimum 6 znaków.' : null}>
              <input className="input" type="password" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Field>
            <ErrorBox error={error} />
            {info && <div className="info-box">{info}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Chwila…' : mode === 'signup' ? 'Utwórz konto' : 'Zaloguj się'} <ArrowRight />
            </button>
            {isDemo && (
              <p className="small muted" style={{ margin: 0 }}>
                Tryb demo: konto zapisuje się tylko w tej przeglądarce.
              </p>
            )}
          </form>
          <Link to="/join" className="small muted">Jesteś uczniem? Dołącz do gry kodem PIN →</Link>
        </div>
      </div>
    </>
  )
}
