import { Link } from 'react-router'
import { Play, Pencil, Copy, Trash2, Globe, Lock, ListChecks, Users } from 'lucide-react'
import { pl } from './ui'

export default function QuizCard({ quiz, mine, onPlay, onDuplicate, onDelete }) {
  return (
    <article className="quiz-card">
      <Link to={`/app/quiz/${quiz.id}`} className="quiz-cover" aria-label={quiz.title}>{quiz.cover || '🎯'}</Link>
      <div className="stack" style={{ gap: 8 }}>
        <Link to={`/app/quiz/${quiz.id}`}><h3>{quiz.title}</h3></Link>
        <div className="quiz-meta">
          {quiz.question_count != null && <span><ListChecks />{quiz.question_count} pyt.</span>}
          <span><Users />{pl(quiz.play_count, 'gra', 'gry', 'gier')}</span>
          {mine
            ? <span>{quiz.is_public ? <><Globe />publiczny</> : <><Lock />prywatny</>}</span>
            : quiz.owner_name && <span>@{quiz.owner_name}</span>}
        </div>
        {quiz.tags?.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {quiz.tags.slice(0, 4).map((t) => <span key={t} className="tag">#{t}</span>)}
          </div>
        )}
      </div>
      <div className="quiz-actions">
        <button className="btn btn-accent btn-sm grow" onClick={() => onPlay(quiz)}><Play /> Graj</button>
        {mine && <Link className="icon-btn" to={`/app/quiz/${quiz.id}/edit`} title="Edytuj"><Pencil /></Link>}
        <button className="icon-btn" onClick={() => onDuplicate(quiz)} title={mine ? 'Duplikuj' : 'Kopiuj do moich'}><Copy /></button>
        {mine && <button className="icon-btn" onClick={() => onDelete(quiz)} title="Usuń"><Trash2 /></button>}
      </div>
    </article>
  )
}
