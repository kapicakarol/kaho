// Ekran prowadzącego (projektor). Steruje grą przez RPC; klawisze → / spacja = dalej.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import QRCode from 'qrcode'
import { Play as PlayIcon, Users, Maximize2, Check, Flame, SkipForward, ArrowRight, BarChart3, ExternalLink, Trophy } from 'lucide-react'
import { api, isDemo } from '../lib/api'
import { useHostGame, useServerOffset, useCountdown } from '../lib/hooks'
import { sound } from '../lib/sound'
import { Shape, styleIndex, TYPE_LABELS } from '../components/Shapes'
import { Logo, Splash, ErrorBox, SoundButtons, Modal, DemoBanner } from '../components/ui'

export default function Host() {
  const { gameId } = useParams()
  const nav = useNavigate()
  const { loading, error, game, players, answers, setGame, refetch } = useHostGame(gameId)
  const offset = useServerOffset('host')
  const [busy, setBusy] = useState(false)
  const [actError, setActError] = useState(null)
  const [kickTarget, setKickTarget] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const status = game?.status
  const q = game?.current
  const qi = game?.current_question ?? -1
  const active = players.filter((p) => !p.kicked)
  const left = useCountdown(status === 'question' ? game.question_started_at : null, q?.time_limit, offset)
  const answeredNow = answers.filter((a) => a.question_index === qi).length
  const isLast = game ? qi + 1 >= game.question_count : false

  const act = useCallback(async (action) => {
    setBusy(true); setActError(null)
    try {
      const g = await api.hostAction(gameId, action)
      if (g?.id) setGame(g)
      refetch()
    } catch (e) {
      setActError(e)
    } finally {
      setBusy(false)
    }
  }, [gameId, setGame, refetch])

  // ---------- muzyka i efekty ----------
  useEffect(() => {
    if (!status) return
    sound.play(status === 'question' ? 'question' : status === 'ended' ? 'results' : 'lobby')
    if (status === 'ended') sound.sfx('podium')
  }, [status])
  useEffect(() => () => sound.stop(), [])

  const prevCount = useRef(0)
  useEffect(() => {
    if (status === 'lobby' && active.length > prevCount.current) sound.sfx('join')
    prevCount.current = active.length
  }, [active.length, status])

  const lastStart = useRef(-1)
  useEffect(() => {
    if (status === 'question' && lastStart.current !== qi) { lastStart.current = qi; sound.sfx('start') }
  }, [status, qi])

  const lastTick = useRef(null)
  const sec = Math.ceil(left / 1000)
  useEffect(() => {
    if (status === 'question' && sec > 0 && sec <= 5 && lastTick.current !== sec) {
      lastTick.current = sec
      sound.sfx('tick')
    }
  }, [sec, status])

  // ---------- auto-odsłonięcie: koniec czasu albo wszyscy odpowiedzieli ----------
  const revealedFor = useRef(-1)
  useEffect(() => {
    if (status !== 'question' || !q || q.index !== qi || revealedFor.current === qi) return
    const allIn = active.length > 0 && answeredNow >= active.length
    if (left === 0 || allIn) {
      revealedFor.current = qi
      sound.sfx(left === 0 ? 'timeup' : 'reveal')
      act('reveal')
    }
  }, [status, q, qi, left, answeredNow, active.length, act])

  // ---------- główna akcja (przycisk + klawiatura / pilot do prezentacji) ----------
  let primary = null
  if (status === 'lobby') {
    primary = { label: `Start · ${game.question_count} pytań`, icon: PlayIcon, run: () => act('next'), disabled: !active.length }
  } else if (status === 'question') {
    primary = { label: 'Pokaż odpowiedzi', icon: SkipForward, run: () => { revealedFor.current = qi; sound.sfx('reveal'); act('reveal') } }
  } else if (status === 'reveal') {
    primary = game.settings?.showScoreboard !== false
      ? { label: 'Tablica wyników', icon: BarChart3, run: () => act('scoreboard') }
      : { label: isLast ? 'Podium' : 'Następne pytanie', icon: ArrowRight, run: () => act('next') }
  } else if (status === 'scoreboard') {
    primary = { label: isLast ? 'Pokaż podium' : 'Następne pytanie', icon: isLast ? Trophy : ArrowRight, run: () => act('next') }
  }

  const primaryRef = useRef(primary)
  primaryRef.current = primary
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, [role=dialog]')) return
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        const p = primaryRef.current
        if (p && !p.disabled) { e.preventDefault(); sound.unlock(); p.run() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (loading) return <Splash />
  if (error || !game) {
    return (
      <div className="auth-wrap">
        <div className="stack" style={{ maxWidth: 420 }}>
          <ErrorBox error={error || new Error('Nie znaleziono gry.')} />
          <Link to="/app" className="btn">Wróć do panelu</Link>
        </div>
      </div>
    )
  }

  const ranking = [...active].sort((a, b) => b.score - a.score)

  return (
    <div className="host">
      <DemoBanner />
      <header className="host-top">
        <div className="row" style={{ minWidth: 0 }}>
          <Logo />
          <span className="muted hide-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            · {game.quiz_title}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {qi >= 0 && status !== 'ended' && <span className="badge">Pytanie {qi + 1}/{game.question_count}</span>}
          <span className="badge"><Users /> {active.length}</span>
          <SoundButtons />
          <button className="icon-btn hide-sm" title="Pełny ekran"
            onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()}>
            <Maximize2 />
          </button>
          {status !== 'ended' && <button className="btn btn-sm btn-danger" onClick={() => setConfirmEnd(true)}>Zakończ</button>}
        </div>
      </header>

      <main className="host-body">
        {status === 'lobby' && <Lobby game={game} players={active} onKick={setKickTarget} />}
        {status === 'question' && q && <QuestionView q={q} left={left} answered={answeredNow} total={active.length} />}
        {status === 'reveal' && q && <RevealView q={q} reveal={game.reveal} />}
        {status === 'scoreboard' && <Scoreboard ranking={ranking} />}
        {status === 'ended' && <Podium ranking={ranking} gameId={gameId} onBack={() => nav('/app')} />}

        <ErrorBox error={actError} />
        {primary && (
          <div className="row between">
            <span className="small muted hide-sm">→ / spacja = dalej</span>
            <button className="btn btn-primary btn-lg" onClick={() => { sound.unlock(); primary.run() }}
              disabled={busy || primary.disabled}>
              <primary.icon /> {primary.label}
            </button>
          </div>
        )}
      </main>

      {kickTarget && (
        <Modal title={`Usunąć „${kickTarget.nickname}”?`} subtitle="Ta osoba nie będzie mogła wrócić do tej gry."
          onClose={() => setKickTarget(null)}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setKickTarget(null)}>Anuluj</button>
            <button className="btn btn-danger" onClick={async () => {
              const p = kickTarget; setKickTarget(null)
              try { await api.kick(gameId, p.id); refetch() } catch (e) { setActError(e) }
            }}>Usuń z gry</button>
          </div>
        </Modal>
      )}
      {confirmEnd && (
        <Modal title="Zakończyć grę?" subtitle="Uczniowie zobaczą wyniki końcowe. Pozostałe pytania przepadną."
          onClose={() => setConfirmEnd(false)}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirmEnd(false)}>Graj dalej</button>
            <button className="btn btn-danger" onClick={() => { setConfirmEnd(false); act('end') }}>Zakończ grę</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Lobby({ game, players, onKick }) {
  const joinUrl = `${window.location.origin}/join/${game.pin}`
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 520, color: { dark: '#141413', light: '#eeebe2' } })
      .then(setQr).catch(() => setQr(''))
  }, [joinUrl])
  const s = game.settings || {}

  return (
    <div className="lobby">
      <div className="card stack lg" style={{ justifyContent: 'space-between' }}>
        <div className="stack">
          <span className="eyebrow">Wejdź na {window.location.host}/join i wpisz PIN</span>
          <div className="big-pin">{game.pin.slice(0, 3)} {game.pin.slice(3)}</div>
        </div>
        <div className="stack">
          <div className="row between">
            <div className="h3">Gracze ({players.length})</div>
            {players.length > 0 && <span className="small muted">Kliknij nick, aby usunąć</span>}
          </div>
          <div className="players">
            {players.map((p) => (
              <button key={p.id} className="player-chip" onClick={() => onKick(p)} title="Usuń z gry">{p.nickname}</button>
            ))}
          </div>
          {players.length === 0 && <p className="muted pulse" style={{ margin: 0 }}>Czekamy na pierwszych graczy…</p>}
        </div>
      </div>
      <div className="stack">
        <div className="card-cream stack" style={{ alignItems: 'center', gap: 10 }}>
          {qr ? <img className="qr" src={qr} alt="Kod QR do dołączenia" /> : <div className="spinner" />}
          <div className="small muted">Zeskanuj aparatem telefonu</div>
        </div>
        {isDemo && (
          <button className="btn btn-block" onClick={() => window.open(joinUrl, '_blank')}>
            <ExternalLink /> Otwórz kartę gracza (demo)
          </button>
        )}
        <div className="card tight small muted stack" style={{ gap: 4 }}>
          <div>Punkty ×{s.pointsMultiplier ?? 1} · {s.speedBonus === false ? 'bez bonusu za szybkość' : 'bonus za szybkość'}</div>
          <div>{s.streakBonus ? `Seria: +${s.streakBonus} (max ${s.maxStreak})` : 'Bez bonusu za serię'}</div>
        </div>
      </div>
    </div>
  )
}

function TimerRing({ left, total }) {
  const r = 50, c = 2 * Math.PI * r
  const frac = total ? left / total : 0
  return (
    <div className="timer-ring">
      <svg viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--panel-3)" strokeWidth="7" />
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={left < 5000 ? 'var(--danger)' : 'var(--accent)'}
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset .1s linear' }} />
      </svg>
      <span className="t">{Math.ceil(left / 1000)}</span>
    </div>
  )
}

function QuestionView({ q, left, answered, total }) {
  return (
    <>
      <h1 className="host-q">{q.text}</h1>
      <div className="host-mid">
        <TimerRing left={left} total={q.time_limit * 1000} />
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 0, gap: 12 }}>
          {q.image_url
            ? <img className="q-image" src={q.image_url} alt="" />
            : <div className="row wrap" style={{ justifyContent: 'center' }}>
                <span className="badge">{TYPE_LABELS[q.type]}</span>
                {q.points === 0 && <span className="badge">Bez punktów</span>}
                {q.points >= 2000 && <span className="badge warn">Podwójne punkty</span>}
              </div>}
          {q.type === 'multi' && <span className="muted">Może być kilka poprawnych odpowiedzi</span>}
        </div>
        <div className="answered-box">
          <div className="v">{answered}<span className="muted" style={{ fontSize: 22 }}>/{total}</span></div>
          <div className="small muted">odpowiedzi</div>
        </div>
      </div>
      <div className="host-answers">
        {q.answers.map((t, i) => {
          const si = styleIndex(q.type, i)
          return <div key={i} className={`host-ans ans-${si}`}><Shape i={si} />{t}</div>
        })}
      </div>
    </>
  )
}

function RevealView({ q, reveal }) {
  const counts = reveal?.counts || []
  const max = Math.max(1, ...counts)
  const correct = new Set(reveal?.correct || [])
  return (
    <>
      <h1 className="host-q">{q.text}</h1>
      <div className="bars">
        {q.answers.map((_, i) => {
          const si = styleIndex(q.type, i)
          return (
            <div key={i} className={`bar ans-${si} ${correct.has(i) ? '' : 'wrong'}`}>
              <div className="cnt">{correct.has(i) && <Check size={22} />}{counts[i] ?? 0}</div>
              <div className="fill" style={{ height: `${((counts[i] ?? 0) / max) * 80 + 4}%` }}><Shape i={si} /></div>
            </div>
          )
        })}
      </div>
      <div className="host-answers">
        {q.answers.map((t, i) => {
          const si = styleIndex(q.type, i)
          return (
            <div key={i} className={`host-ans ans-${si} ${correct.has(i) ? '' : 'dim'}`}>
              <Shape i={si} />{t}
              {correct.has(i) && <Check className="chk" />}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Scoreboard({ ranking }) {
  return (
    <div className="scoreboard" style={{ flex: 1, justifyContent: 'center' }}>
      <h1 className="h2 center" style={{ marginBottom: 12 }}>Tablica wyników</h1>
      {ranking.slice(0, 5).map((p, i) => (
        <div key={p.id} className={`score-row ${i === 0 ? 'top' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
          <span className="pos">{i + 1}</span>
          <span>{p.nickname}</span>
          {p.streak >= 2 && <span className="streak"><Flame size={15} />{p.streak}</span>}
          <span className="pts">{p.score}</span>
        </div>
      ))}
      {ranking.length === 0 && <p className="muted center">Brak graczy.</p>}
    </div>
  )
}

function Podium({ ranking, gameId, onBack }) {
  const [first, second, third] = ranking
  const rest = ranking.slice(3, 10)
  const Col = ({ p, place, cls }) => (
    <div className={`col ${cls}`}>
      <div className="name">{p ? p.nickname : '—'}</div>
      <div className="block"><span className="place">{place}</span><span>{p ? p.score : ''}</span></div>
    </div>
  )
  return (
    <div className="stack lg" style={{ flex: 1 }}>
      <h1 className="h2 center">Koniec gry! <span className="dim">Brawo dla wszystkich.</span></h1>
      <div className="podium">
        <Col p={second} place={2} cls="p2" />
        <Col p={first} place={1} cls="p1" />
        <Col p={third} place={3} cls="p3" />
      </div>
      {rest.length > 0 && (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {rest.map((p, i) => <span key={p.id} className="badge">{i + 4}. {p.nickname} · {p.score}</span>)}
        </div>
      )}
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <Link to={`/app/stats/${gameId}`} className="btn btn-accent btn-lg"><BarChart3 /> Raport gry</Link>
        <button className="btn btn-lg" onClick={onBack}>Wróć do panelu</button>
      </div>
    </div>
  )
}
