// Biblioteka quizów + wyszukiwarka (moje / publiczne)
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../components/AppLayout'
import { useQuizActions } from '../components/quizActions'
import QuizCard from '../components/QuizCard'
import { Segmented, Empty, ErrorBox, Spinner } from '../components/ui'

function topTags(quizzes, n = 12) {
  const freq = {}
  quizzes.forEach((q) => (q.tags || []).forEach((t) => { freq[t] = (freq[t] || 0) + 1 }))
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t)
}

export default function Library() {
  usePageTitle('Biblioteka')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'public' ? 'public' : 'mine'
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const mine = useAsync(() => api.listMyQuizzes(), [])
  const [pub, setPub] = useState({ loading: true, data: [], error: null })
  const actions = useQuizActions(mine.reload)

  // publiczne: wyszukiwanie po stronie serwera (z opóźnieniem przy pisaniu)
  useEffect(() => {
    if (tab !== 'public') return
    setPub((s) => ({ ...s, loading: true }))
    const t = setTimeout(() => {
      api.searchQuizzes(query, tag)
        .then((data) => setPub({ loading: false, data, error: null }))
        .catch((error) => setPub({ loading: false, data: [], error }))
    }, 250)
    return () => clearTimeout(t)
  }, [tab, query, tag])

  const list = useMemo(() => {
    if (tab === 'public') return pub.data
    const s = query.trim().toLowerCase()
    return (mine.data || [])
      .filter((q) => !s || q.title.toLowerCase().includes(s) || q.description?.toLowerCase().includes(s) ||
        q.tags.some((t) => t.includes(s)))
      .filter((q) => !tag || q.tags.includes(tag))
  }, [tab, pub.data, mine.data, query, tag])

  const tags = useMemo(() => topTags(tab === 'public' ? pub.data : mine.data || []), [tab, pub.data, mine.data])
  const loading = tab === 'public' ? pub.loading : mine.loading
  const error = tab === 'public' ? pub.error : mine.error

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Biblioteka quizów</span>
          <h1 className="h2" style={{ marginTop: 12 }}>
            {tab === 'public' ? 'Odkrywaj quizy innych.' : 'Twoje quizy.'}
          </h1>
        </div>
        <Link to="/app/new" className="btn btn-primary"><Plus /> Nowy quiz</Link>
      </div>

      <div className="row wrap between" style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={(v) => { setParams(v === 'public' ? { tab: 'public' } : {}); setTag('') }}
          options={[{ value: 'mine', label: 'Moje quizy' }, { value: 'public', label: 'Publiczne' }]} />
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
          <Search size={17} style={{ position: 'absolute', left: 13, top: 13, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Szukaj po tytule, opisie, tagu…"
            value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj quizów" />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 22 }}>
          {tags.map((t) => (
            <button key={t} className={`tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>#{t}</button>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : list.length === 0 ? (
        tab === 'public'
          ? <Empty title="Nic nie znaleziono">Spróbuj innego słowa — albo opublikuj własny quiz (przełącznik „Publiczny” w kreatorze).</Empty>
          : <Empty title={query || tag ? 'Brak wyników' : 'Nie masz jeszcze quizów'}
              action={<Link to="/app/new" className="btn btn-primary"><Plus /> Utwórz quiz</Link>} />
      ) : (
        <div className="grid cards">
          {list.map((q) => (
            <QuizCard key={q.id} quiz={q} mine={q.owner === user.id}
              onPlay={actions.play} onDuplicate={actions.duplicate} onDelete={actions.remove} />
          ))}
        </div>
      )}
      {actions.modals}
    </div>
  )
}
