// Raport jednej gry: pytania, gracze, eksport CSV
import { useParams, Link } from 'react-router'
import { Users, Target, Timer, ListChecks, Download, AlertTriangle, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { usePageTitle } from '../components/AppLayout'
import { Shape, styleIndex } from '../components/Shapes'
import { ErrorBox, Splash } from '../components/ui'

const pct = (x) => `${Math.round(x * 100)}%`
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function buildReport({ game, players, answers, secrets }) {
  const asked = game.status === 'ended' && game.current_question < 0 ? 0 : Math.min(game.current_question + 1, secrets.length)
  const questions = secrets.slice(0, asked).map((q, i) => {
    const a = answers.filter((x) => x.question_index === i)
    const correct = a.filter((x) => x.correct).length
    return {
      i, q, answered: a.length, correct,
      rate: a.length ? correct / a.length : 0,
      avgMs: avg(a.map((x) => x.time_ms)),
      dist: q.answers.map((_, k) => a.filter((x) => x.answer.includes(k)).length),
    }
  })
  const ranking = players.filter((p) => !p.kicked).sort((a, b) => b.score - a.score).map((p) => {
    const mine = answers.filter((x) => x.player_id === p.id)
    return { ...p, answered: mine.length, avgMs: avg(mine.map((x) => x.time_ms)) }
  })
  const allAnswered = answers.filter((a) => a.question_index < asked)
  const rate = allAnswered.length ? allAnswered.filter((a) => a.correct).length / allAnswered.length : 0
  const hardest = questions.filter((x) => x.answered).sort((a, b) => a.rate - b.rate)[0]
  return { asked, questions, ranking, rate, avgMs: avg(allAnswered.map((a) => a.time_ms)), hardest }
}

function exportCsv(game, report, answers) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Miejsce', 'Nick', 'Punkty', 'Poprawne', ...report.questions.map((q) => `P${q.i + 1}`)]
  const rows = report.ranking.map((p, idx) => [
    idx + 1, p.nickname, p.score, p.correct_count,
    ...report.questions.map((q) => {
      const a = answers.find((x) => x.player_id === p.id && x.question_index === q.i)
      return a ? (a.correct ? `+${a.points}` : '0') : '—'
    }),
  ])
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kaho-${game.quiz_title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${game.created_at.slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function GameReport() {
  const { gameId } = useParams()
  const { data, loading, error } = useAsync(async () => {
    const [game, players, answers, secrets] = await Promise.all([
      api.getGame(gameId), api.listPlayers(gameId), api.listAnswers(gameId), api.getSecrets(gameId),
    ])
    if (!game) throw new Error('Nie znaleziono gry.')
    return { game, players, answers, secrets }
  }, [gameId])
  usePageTitle(data ? `Raport · ${data.game.quiz_title}` : 'Raport')

  if (loading) return <Splash />
  if (error) return <div className="page"><ErrorBox error={error} /></div>

  const { game, answers } = data
  const r = buildReport(data)

  return (
    <div className="page">
      <Link to="/app/stats" className="small muted row" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Wszystkie gry</Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">{new Date(game.created_at).toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' })}</span>
          <h1 className="h2" style={{ marginTop: 12 }}>{game.quiz_title}</h1>
        </div>
        <button className="btn" onClick={() => exportCsv(game, r, answers)} disabled={!r.ranking.length}><Download /> Eksport CSV</button>
      </div>

      <div className="grid stats">
        <div className="stat"><div className="k"><Users /> Gracze</div><div className="v">{r.ranking.length}</div></div>
        <div className="stat"><div className="k"><ListChecks /> Pytania</div><div className="v">{r.asked}/{game.question_count}</div></div>
        <div className="stat"><div className="k"><Target /> Poprawność</div><div className="v">{pct(r.rate)}</div></div>
        <div className="stat"><div className="k"><Timer /> Śr. czas</div><div className="v">{sec(r.avgMs)}</div></div>
      </div>

      {r.hardest && r.hardest.rate < 0.5 && (
        <div className="info-box row section" style={{ marginTop: 22 }}>
          <AlertTriangle size={17} color="var(--warn)" />
          <span>Najtrudniejsze: <b style={{ color: 'var(--text)' }}>„{r.hardest.q.text}”</b> — tylko {pct(r.hardest.rate)} poprawnych. Warto wrócić do tematu.</span>
        </div>
      )}

      <section className="section">
        <div className="section-head"><h2 className="h3">Pytania</h2></div>
        <div className="card tight table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Pytanie</th><th>Poprawne</th><th>Śr. czas</th><th>Rozkład odpowiedzi</th></tr></thead>
            <tbody>
              {r.questions.map((x) => (
                <tr key={x.i}>
                  <td className="mono muted">{x.i + 1}</td>
                  <td style={{ maxWidth: 360 }}>{x.q.text}</td>
                  <td style={{ minWidth: 150 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <div className="meter grow"><div style={{ width: pct(x.rate), background: x.rate < 0.5 ? 'var(--warn)' : undefined }} /></div>
                      <span className="mono small">{pct(x.rate)}</span>
                    </div>
                  </td>
                  <td className="mono small">{x.answered ? sec(x.avgMs) : '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {x.q.answers.map((a, k) => {
                        const si = styleIndex(x.q.type, k)
                        return (
                          <span key={k} className={`ans-${si}`} title={`${a.text}${a.correct ? ' ✓' : ''}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 7,
                              background: 'var(--c)', opacity: a.correct ? 1 : 0.45, fontSize: 12, fontWeight: 700 }}>
                            <span className="mini"><Shape i={si} /></span>{x.dist[k]}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {r.questions.length === 0 && <tr><td colSpan={5} className="muted">Gra zakończyła się przed pierwszym pytaniem.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3">Gracze</h2></div>
        <div className="card tight table-wrap">
          <table className="table">
            <thead><tr><th>Miejsce</th><th>Nick</th><th>Punkty</th><th>Poprawne</th><th>Odpowiedzi</th><th>Śr. czas</th></tr></thead>
            <tbody>
              {r.ranking.map((p, i) => (
                <tr key={p.id}>
                  <td className="mono">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{p.nickname}</td>
                  <td className="mono">{p.score}</td>
                  <td>{p.correct_count}/{r.asked}</td>
                  <td>{p.answered}/{r.asked}</td>
                  <td className="mono small">{p.answered ? sec(p.avgMs) : '—'}</td>
                </tr>
              ))}
              {r.ranking.length === 0 && <tr><td colSpan={6} className="muted">Nikt nie dołączył.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
