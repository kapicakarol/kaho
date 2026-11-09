import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowRight, Shuffle, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { sound } from '../lib/sound'
import { Logo, ErrorBox, DemoBanner } from '../components/ui'

const ADJ = ['Szybki', 'Sprytny', 'Dzielny', 'Cichy', 'Wesoły', 'Turbo', 'Mega', 'Kosmiczny', 'Złoty', 'Nocny']
const NOUN = ['Jeż', 'Bóbr', 'Lis', 'Żubr', 'Kruk', 'Rysiek', 'Pingwin', 'Smok', 'Kot', 'Wilk']
const randomNick = () =>
  `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`

export default function Join() {
  const params = useParams()
  const nav = useNavigate()
  const [pin, setPin] = useState(params.pin?.replace(/\D/g, '').slice(0, 6) || '')
  const [step, setStep] = useState(params.pin ? 'nick' : 'pin')
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const nickRef = useRef(null)
  const saved = api.player.savedSession()

  useEffect(() => { if (step === 'nick') nickRef.current?.focus() }, [step])

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (step === 'pin') {
      if (pin.length === 6) setStep('nick')
      return
    }
    sound.unlock()
    setBusy(true)
    try {
      const s = await api.player.join(pin, nick)
      sound.sfx('join')
      nav(`/play/${s.game_id}`)
    } catch (err) {
      setError(err)
      if (err.code === 'game_not_found') setStep('pin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="play">
      <DemoBanner />
      <div className="play-top" style={{ borderBottom: 0 }}>
        <Link to="/"><Logo /></Link>
      </div>
      <div className="play-center">
        <form onSubmit={submit} className="stack lg" style={{ width: '100%', maxWidth: 380 }}>
          <div>
            <span className="eyebrow">{step === 'pin' ? 'Krok 1 z 2' : 'Krok 2 z 2'}</span>
            <h1 className="h2" style={{ marginTop: 12 }}>
              {step === 'pin' ? 'Wpisz PIN gry' : 'Jak cię nazwać?'}
            </h1>
          </div>

          <div className="card-cream stack">
            {step === 'pin' ? (
              <input className="pin-input" inputMode="numeric" autoComplete="off" autoFocus placeholder="000000"
                aria-label="Kod PIN" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            ) : (
              <>
                <div className="small muted">Gra <b className="mono" style={{ color: 'var(--ink)' }}>{pin}</b></div>
                <div className="row">
                  <input ref={nickRef} className="pin-input" style={{ fontFamily: 'var(--font)', fontSize: 22, letterSpacing: 0, height: 60 }}
                    maxLength={20} placeholder="Twój nick" value={nick} autoComplete="off" aria-label="Nick"
                    onChange={(e) => setNick(e.target.value)} />
                  <button type="button" className="icon-btn" title="Losuj nick" onClick={() => setNick(randomNick())}
                    style={{ width: 48, height: 60, background: '#fff', borderColor: 'var(--cream-2)', color: 'var(--ink)' }}>
                    <Shuffle />
                  </button>
                </div>
              </>
            )}
          </div>

          <ErrorBox error={error} />

          <button className="btn btn-primary btn-lg btn-block"
            disabled={busy || (step === 'pin' ? pin.length !== 6 : !nick.trim())}>
            {busy ? 'Dołączam…' : step === 'pin' ? 'Dalej' : 'Wchodzę!'} <ArrowRight />
          </button>

          {step === 'nick' && !params.pin && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep('pin')}>Zmień PIN</button>
          )}

          {saved && (
            <Link to={`/play/${saved.game_id}`} className="btn btn-ghost">
              <RotateCcw /> Wróć do gry jako „{saved.nickname}”
            </Link>
          )}

          <p className="small muted center" style={{ margin: 0 }}>Nie potrzebujesz konta. Nick widzi cała klasa — bądź miły.</p>
        </form>
      </div>
    </div>
  )
}
