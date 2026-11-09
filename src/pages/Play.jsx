// Ekran ucznia (telefon). Bez logowania — anonimowa sesja.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Check, X, Clock, Flame, Trophy, LogOut, Send, Hourglass, Crown } from 'lucide-react'
import { api } from '../lib/api'
import { usePlayerGame, useServerOffset, useCountdown } from '../lib/hooks'
import { sound } from '../lib/sound'
import { Shape, styleIndex, SHAPE_NAMES } from '../components/Shapes'
import { Splash, ErrorBox, SoundButtons } from '../components/ui'

export default function Play() {
  const { gameId } = useParams()
  const nav = useNavigate()
  const { loading, game, me, players } = usePlayerGame(gameId)
  const offset = useServerOffset('player')
  const [answeredQ, setAnsweredQ] = useState(-1)
  const [timeUpQ, setTimeUpQ] = useState(-1)
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { index, answer }
  const lastQ = useRef(-1)
  const lastSfx = useRef(-1)

  const q = game?.current
  const qi = game?.current_question ?? -1
  const status = game?.status
  const left = useCountdown(status === 'question' ? game.question_started_at : null, q?.time_limit, offset)
  const meId = me?.id

  // nowe pytanie -> wyczyść stan
  useEffect(() => {
    if (status === 'question' && lastQ.current !== qi) {
      lastQ.current = qi
      setSelected([])
      setError(null)
      navigator.vibrate?.(40)
    }
  }, [status, qi])

  // po odsłonięciu pobierz swoją odpowiedź (RLS ukrywa ją w trakcie pytania)
  const revealIdx = game?.reveal?.index ?? qi
  useEffect(() => {
    if (!meId || !status || status === 'question' || status === 'lobby' || revealIdx < 0) return
    if (result?.index === revealIdx) return
    let alive = true
    api.player.myAnswer(gameId, meId, revealIdx).then((answer) => {
      if (!alive) return
      setResult({ index: revealIdx, answer })
      if (status === 'reveal' && lastSfx.current !== revealIdx) {
        lastSfx.current = revealIdx
        sound.sfx(answer?.correct ? 'correct' : 'wrong')
        navigator.vibrate?.(answer?.correct ? [30, 40, 30] : 150)
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [gameId, meId, status, revealIdx, result?.index])

  async function submit(answer) {
    if (submitting) return
    sound.unlock()
    setSubmitting(true); setError(null)
    try {
      await api.player.submit(gameId, answer)
      setAnsweredQ(qi)
      sound.sfx('submit')
      navigator.vibrate?.(20)
    } catch (e) {
      if (e.code === 'already_answered') setAnsweredQ(qi)
      else if (e.code === 'too_late' || e.code === 'not_accepting') setTimeUpQ(qi)
      else setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  function leave() {
    api.player.clearSession()
    nav('/join')
  }

  if (loading) return <Splash />
  if (!game || !me) return <Gone onRejoin={leave} />

  const rank = players.findIndex((p) => p.id === me.id) + 1
  const above = rank > 1 ? players[rank - 2] : null
  const myResult = result?.index === revealIdx ? result.answer : undefined

  let body
  if (status === 'lobby') {
    body = (
      <div className="play-center">
        <div className="result-ic ok"><Check /></div>
        <h1 className="h2">Jesteś w grze!</h1>
        <p className="muted" style={{ margin: 0 }}>Widzisz swój nick na ekranie? Czekamy, aż prowadzący zacznie.</p>
        <span className="badge pulse">{players.length} w poczekalni</span>
      </div>
    )
  } else if (status === 'question' && q) {
    if (answeredQ === qi) {
      body = (
        <div className="play-center">
          <div className="result-ic none pulse"><Hourglass /></div>
          <h1 className="h2">Odpowiedź wysłana</h1>
          <p className="muted" style={{ margin: 0 }}>Czekamy na resztę klasy…</p>
        </div>
      )
    } else if (left === 0 || timeUpQ === qi) {
      body = (
        <div className="play-center">
          <div className="result-ic none"><Clock /></div>
          <h1 className="h2">Czas minął</h1>
          <p className="muted" style={{ margin: 0 }}>Następnym razem szybciej!</p>
        </div>
      )
    } else {
      const multi = q.type === 'multi'
      const pct = (left / (q.time_limit * 1000)) * 100
      body = (
        <>
          <div className={`timebar ${left < 5000 ? 'low' : ''}`}><div style={{ width: `${pct}%` }} /></div>
          <div className="play-q">{q.text}</div>
          {multi && <div className="small muted center">Zaznacz wszystkie poprawne, potem wyślij.</div>}
          <div className={`play-answers ${q.type === 'truefalse' ? 'tf' : ''}`}>
            {q.answers.map((text, i) => {
              const si = styleIndex(q.type, i)
              const sel = selected.includes(i)
              return (
                <button key={i} className={`play-ans ans-${si} ${sel ? 'sel' : ''}`} disabled={submitting}
                  aria-label={`${SHAPE_NAMES[si]}: ${text}`} aria-pressed={multi ? sel : undefined}
                  onClick={() => {
                    if (!multi) return submit([i])
                    sound.sfx('select')
                    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
                  }}>
                  <Shape i={si} />
                  <span>{text}</span>
                  {sel && <span className="tickmark"><Check /></span>}
                </button>
              )
            })}
          </div>
          {multi && (
            <button className="btn btn-primary btn-lg btn-block" disabled={!selected.length || submitting}
              onClick={() => submit(selected)}>
              <Send /> Wyślij ({selected.length})
            </button>
          )}
          <ErrorBox error={error} />
        </>
      )
    }
  } else if (status === 'reveal') {
    const correctText = (game.reveal?.correct || []).map((i) => q?.answers?.[i]).filter(Boolean).join(', ')
    body = (
      <div className="play-center">
        {myResult === undefined ? <div className="spinner" />
          : myResult === null ? (
            <>
              <div className="result-ic none"><Clock /></div>
              <h1 className="h2">Brak odpowiedzi</h1>
            </>
          ) : myResult.correct ? (
            <>
              <div className="result-ic ok"><Check /></div>
              <h1 className="h2">Dobrze!</h1>
              <div className="score-pill" style={{ fontSize: 20, height: 44, padding: '0 20px' }}>+{myResult.points}</div>
              {me.streak >= 2 && <span className="badge warn"><Flame /> Seria: {me.streak}</span>}
            </>
          ) : (
            <>
              <div className="result-ic bad"><X /></div>
              <h1 className="h2">Niestety…</h1>
            </>
          )}
        {myResult !== undefined && !myResult?.correct && correctText && (
          <p className="muted" style={{ margin: 0 }}>Poprawna odpowiedź: <b style={{ color: 'var(--text)' }}>{correctText}</b></p>
        )}
        {rank > 0 && <p className="small muted" style={{ margin: 0 }}>Jesteś na {rank}. miejscu</p>}
      </div>
    )
  } else if (status === 'scoreboard') {
    body = (
      <div className="play-center">
        <div className="big-pin" style={{ fontSize: 72 }}>#{rank}</div>
        <div className="score-pill" style={{ fontSize: 20, height: 44, padding: '0 20px' }}>{me.score} pkt</div>
        <p className="muted" style={{ margin: 0 }}>
          {above
            ? <>Do miejsca wyżej ({above.nickname}) brakuje <b style={{ color: 'var(--text)' }}>{above.score - me.score}</b> pkt.</>
            : <><Crown size={16} style={{ verticalAlign: -2 }} /> Prowadzisz!</>}
        </p>
      </div>
    )
  } else {
    body = (
      <div className="play-center">
        <div className="result-ic ok"><Trophy /></div>
        <h1 className="h2">Koniec gry!</h1>
        <div className="big-pin" style={{ fontSize: 64 }}>#{rank}</div>
        <p className="muted" style={{ margin: 0 }}>
          {me.score} pkt · {me.correct_count}/{Math.max(0, qi + 1)} poprawnych
        </p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary btn-lg" onClick={leave}>Zagraj jeszcze raz</button>
          <Link to="/" className="btn btn-ghost btn-lg">Strona główna</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="play">
      <header className="play-top">
        <span className="nick-pill">{me.nickname}</span>
        <div className="row" style={{ gap: 8 }}>
          {qi >= 0 && status !== 'ended' && <span className="small muted mono">{qi + 1}/{game.question_count}</span>}
          <SoundButtons music={false} />
          <span className="score-pill">{me.score}</span>
        </div>
      </header>
      <div className="play-body">{body}</div>
    </div>
  )
}

function Gone({ onRejoin }) {
  return (
    <div className="play">
      <div className="play-center">
        <div className="result-ic none"><LogOut /></div>
        <h1 className="h2">Nie jesteś w tej grze</h1>
        <p className="muted" style={{ margin: 0 }}>Gra się zakończyła albo prowadzący usunął cię z poczekalni.</p>
        <button className="btn btn-primary btn-lg" onClick={onRejoin}>Dołącz do gry</button>
      </div>
    </div>
  )
}
