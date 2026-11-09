import { useNavigate } from 'react-router'
import { Gamepad2, Users, Trophy, ListChecks } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { usePageTitle } from '../components/AppLayout'
import { ErrorBox, Spinner, Empty } from '../components/ui'

const STATUS = { lobby: 'Poczekalnia', question: 'W trakcie', reveal: 'W trakcie', scoreboard: 'W trakcie', ended: 'Zakończona' }

export default function Stats() {
  usePageTitle('Statystyki')
  const nav = useNavigate()
  const { data, loading, error } = useAsync(() => api.myGames(), [])
  const games = data || []
  const ended = games.filter((g) => g.status === 'ended')
  const players = games.reduce((s, g) => s + g.player_count, 0)
  const quizzes = new Set(games.map((g) => g.quiz_id)).size

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Statystyki gry</span>
          <h1 className="h2" style={{ marginTop: 12 }}>Jak poszło? <span className="dim">Wszystko w liczbach.</span></h1>
        </div>
      </div>

      <div className="grid stats">
        <div className="stat"><div className="k"><Gamepad2 /> Gry</div><div className="v">{games.length}</div></div>
        <div className="stat"><div className="k"><Trophy /> Zakończone</div><div className="v">{ended.length}</div></div>
        <div className="stat"><div className="k"><Users /> Graczy łącznie</div><div className="v">{players}</div></div>
        <div className="stat"><div className="k"><ListChecks /> Różne quizy</div><div className="v">{quizzes}</div></div>
      </div>

      <section className="section">
        <div className="section-head"><h2 className="h3">Historia gier</h2></div>
        {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : games.length === 0 ? (
          <Empty title="Brak rozegranych gier">Uruchom grę z biblioteki — wyniki pojawią się tutaj.</Empty>
        ) : (
          <div className="card tight table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Quiz</th><th>PIN</th><th>Gracze</th><th>Pytania</th><th>Status</th></tr></thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id} className="click" onClick={() => nav(g.status === 'ended' ? `/app/stats/${g.id}` : `/host/${g.id}`)}>
                    <td className="muted">{new Date(g.created_at).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{g.quiz_title}</td>
                    <td className="mono muted">{g.pin}</td>
                    <td>{g.player_count}</td>
                    <td>{Math.max(0, g.current_question + 1)}/{g.question_count}</td>
                    <td><span className={`badge ${g.status === 'ended' ? '' : 'accent'}`}>{STATUS[g.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
