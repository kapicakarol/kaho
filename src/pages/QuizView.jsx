import { Link, useNavigate, useParams } from 'react-router'
import { Play, Pencil, Copy, Globe, Lock, Clock, Check, Users, ListChecks } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../components/AppLayout'
import { useQuizActions } from '../components/quizActions'
import { Shape, styleIndex, TYPE_LABELS } from '../components/Shapes'
import { ErrorBox, Splash, Empty, pl } from '../components/ui'

export default function QuizView() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { data: quiz, loading, error } = useAsync(() => api.getQuiz(id), [id])
  const actions = useQuizActions()
  usePageTitle(quiz?.title || 'Quiz')

  if (loading) return <Splash />
  if (error) return <div className="page"><ErrorBox error={error} /></div>
  if (!quiz) return <div className="page"><Empty title="Nie znaleziono quizu">Może jest prywatny albo został usunięty.</Empty></div>

  const mine = quiz.owner === user.id

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
          <div className="quiz-cover" style={{ width: 96, height: 96, fontSize: 46, flex: 'none' }}>{quiz.cover}</div>
          <div className="stack" style={{ gap: 8 }}>
            <h1 className="h2">{quiz.title}</h1>
            {quiz.description && <p className="muted" style={{ margin: 0, maxWidth: 620 }}>{quiz.description}</p>}
            <div className="quiz-meta">
              <span><ListChecks />{pl(quiz.questions.length, 'pytanie', 'pytania', 'pytań')}</span>
              <span><Users />{pl(quiz.play_count, 'gra', 'gry', 'gier')}</span>
              <span>{quiz.is_public ? <><Globe />publiczny</> : <><Lock />prywatny</>}</span>
              {!mine && quiz.owner_name && <span>autor: @{quiz.owner_name}</span>}
            </div>
            {quiz.tags.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>{quiz.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
            )}
          </div>
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => actions.play(quiz)} disabled={!quiz.questions.length}><Play /> Graj</button>
          {mine && <Link className="btn" to={`/app/quiz/${id}/edit`}><Pencil /> Edytuj</Link>}
          <button className="btn" onClick={async () => { const nid = await actions.duplicate(quiz); if (nid) nav(`/app/quiz/${nid}/edit`) }}>
            <Copy /> {mine ? 'Duplikuj' : 'Kopiuj i edytuj'}
          </button>
        </div>
      </div>

      <div className="stack">
        {quiz.questions.map((q, i) => (
          <div key={q.id || i} className="card tight stack">
            <div className="row between wrap">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontWeight: 600 }}>{q.text || <span className="muted">Bez treści</span>}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge">{TYPE_LABELS[q.type]}</span>
                <span className="badge"><Clock />{q.time_limit}s</span>
                <span className="badge">{q.points} pkt</span>
              </div>
            </div>
            {q.image_url && <img src={q.image_url} alt="" style={{ maxHeight: 140, borderRadius: 12, width: 'fit-content' }} />}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {q.answers.map((a, k) => {
                const si = styleIndex(q.type, k)
                return (
                  <div key={k} className={`row ans-${si}`} style={{
                    padding: '8px 12px', borderRadius: 12, background: 'var(--panel-2)',
                    border: `1px solid ${a.correct ? 'var(--accent-line)' : 'var(--line)'}`,
                  }}>
                    <span style={{ background: 'var(--c)', borderRadius: 7, width: 26, height: 26, display: 'grid', placeItems: 'center', flex: 'none' }}>
                      <Shape i={si} />
                    </span>
                    <span className="grow small">{a.text}</span>
                    {a.correct && <Check size={16} color="var(--accent)" />}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {quiz.questions.length === 0 && <Empty title="Brak pytań">{mine ? 'Dodaj pytania w kreatorze.' : 'Pytania są niewidoczne.'}</Empty>}
      </div>
      {actions.modals}
    </div>
  )
}
