import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'
import { blankQuestion } from '../lib/quiz'
import { usePageTitle } from '../components/AppLayout'
import { Splash, ErrorBox } from '../components/ui'

// /app/new -> tworzy pusty quiz i otwiera kreator
export default function NewQuiz() {
  usePageTitle('Kreator')
  const nav = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (started.current) return // StrictMode uruchamia efekt dwa razy
    started.current = true
    api.createQuiz({ title: 'Nowy quiz', tags: [] }, [blankQuestion('single')])
      .then((id) => nav(`/app/quiz/${id}/edit`, { replace: true }))
      .catch(setError)
  }, [nav])

  return error ? <div className="page"><ErrorBox error={error} /></div> : <Splash />
}
