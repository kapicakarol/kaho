import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus, Library as LibraryIcon, ListChecks, Gamepad2, Users, Sparkles, Play, ArrowRight } from 'lucide-react'
import { api, createSampleQuiz } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/hooks'
import { usePageTitle } from '../components/AppLayout'
import { useQuizActions } from '../components/quizActions'
import QuizCard from '../components/QuizCard'
import { Empty, ErrorBox, Spinner, pl } from '../components/ui'

const STATUS = { lobby: 'Poczekalnia', question: 'W trakcie', reveal: 'W trakcie', scoreboard: 'W trakcie', ended: 'Zakończona' }

export default function Dashboard() {
  usePageTitle('Przegląd')
  const { user } = useAuth()
  const nav = useNavigate()
  const quizzes = useAsync(() => api.listMyQuizzes(), [])
  const games = useAsync(() => api.myGames(), [])
  const actions = useQuizActions(quizzes.reload)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [sampleError, setSampleError] = useState(null)

  const qs = quizzes.data || []
  const gs = games.data || []
  const players = gs.reduce((s, g) => s + (g.player_count || 0), 0)
  const latest = qs[0]

  async function addSample() {
    setSampleBusy(true); setSampleError(null)
    try { const id = await createSampleQuiz(); nav(`/app/quiz/${id}`) } catch (e) { setSampleError(e) } finally { setSampleBusy(false) }
  }

  return (
    <div className="page">
      <div className="grid two" style={{ alignItems: 'center', gap: 40 }}>
        <div>
          <span className="eyebrow">Twoja przestrzeń, prościej</span>
          <h1 className="h1" style={{ marginTop: 18 }}>
            Cześć, {user.username}.<br /><span className="dim">Co dziś gramy?</span>
          </h1>
          <div className="row wrap" style={{ marginTop: 26 }}>
            <Link to="/app/new" className="btn btn-primary btn-lg"><Plus /> Nowy quiz</Link>
            <Link to="/app/library?tab=public" className="btn btn-ghost btn-lg"><LibraryIcon /> Przeglądaj publiczne</Link>
          </div>
        </div>
        <div className="join-card">
          <div className="row between" style={{ padding: '4px 6px 14px' }}>
            <span className="row small" style={{ color: 'var(--text-2)' }}><Sparkles size={16} /> Szybki start</span>
            {latest && <span className="badge">Ostatnio edytowany</span>}
          </div>
          <div className="card-cream stack">
            {latest ? (
              <>
                <div style={{ fontSize: 44 }}>{latest.cover}</div>
                <div className="h3">{latest.title}</div>
                <div className="small muted">{pl(latest.question_count, 'pytanie', 'pytania', 'pytań')} · {pl(latest.play_count, 'rozegrana gra', 'rozegrane gry', 'rozegranych gier')}</div>
              </>
            ) : (
              <>
                <div className="h3">Nie masz jeszcze quizów</div>
                <div className="small muted">Zacznij od przykładowego — 6 pytań, wszystkie typy. Potem go zmienisz.</div>
              </>
            )}
          </div>
          <div className="row between" style={{ padding: '14px 6px 2px' }}>
            <span className="small muted">{latest ? 'Gotowe do gry' : 'Jedno kliknięcie'}</span>
            {latest
              ? <button className="btn btn-accent btn-sm" onClick={() => actions.play(latest)}><Play /> Graj</button>
              : <button className="btn btn-accent btn-sm" onClick={addSample} disabled={sampleBusy}><Sparkles /> Dodaj przykładowy</button>}
          </div>
          <ErrorBox error={sampleError} />
        </div>
      </div>

      <div className="grid stats section">
        <div className="stat"><div className="k"><ListChecks /> Quizy</div><div className="v">{qs.length}</div></div>
        <div className="stat"><div className="k"><Gamepad2 /> Rozegrane gry</div><div className="v">{gs.length}</div></div>
        <div className="stat"><div className="k"><Users /> Graczy łącznie</div><div className="v">{players}</div></div>
        <div className="stat"><div className="k"><Users /> Śr. na grę</div><div className="v">{gs.length ? Math.round(players / gs.length) : 0}</div></div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="h3">Twoje quizy</h2>
          {qs.length > 4 && <Link to="/app/library" className="small muted">Wszystkie ({qs.length}) <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>}
        </div>
        {quizzes.loading ? <Spinner /> : quizzes.error ? <ErrorBox error={quizzes.error} /> : qs.length === 0 ? (
          <Empty title="Pusto. Na razie." action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link to="/app/new" className="btn btn-primary"><Plus /> Utwórz quiz</Link>
              <button className="btn" onClick={addSample} disabled={sampleBusy}><Sparkles /> Przykładowy quiz</button>
            </div>
          }>Stwórz pierwszy quiz albo skopiuj gotowy z biblioteki publicznej.</Empty>
        ) : (
          <div className="grid cards">
            {qs.slice(0, 4).map((q) => (
              <QuizCard key={q.id} quiz={q} mine onPlay={actions.play} onDuplicate={actions.duplicate} onDelete={actions.remove} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h3">Ostatnie gry</h2>
          {gs.length > 0 && <Link to="/app/stats" className="small muted">Statystyki <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>}
        </div>
        {gs.length === 0 ? <div className="info-box">Tu pojawią się rozegrane gry z wynikami.</div> : (
          <div className="card tight table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Quiz</th><th>Gracze</th><th>Status</th></tr></thead>
              <tbody>
                {gs.slice(0, 5).map((g) => (
                  <tr key={g.id} className="click" onClick={() => nav(g.status === 'ended' ? `/app/stats/${g.id}` : `/host/${g.id}`)}>
                    <td className="muted">{new Date(g.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{g.quiz_title}</td>
                    <td>{g.player_count}</td>
                    <td><span className={`badge ${g.status === 'ended' ? '' : 'accent'}`}>{STATUS[g.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {actions.modals}
    </div>
  )
}
