// Kreator quizów
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Plus, Save, Play, X, Check, ChevronUp, ChevronDown, Copy, Trash2, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { POINT_OPTIONS, TIME_OPTIONS } from '../lib/scoring'
import { COVERS, blankQuestion, changeType, cloneQuestion, parseTags, questionIssues, withKeys } from '../lib/quiz'
import { usePageTitle } from '../components/AppLayout'
import { Shape, styleIndex, TYPE_LABELS } from '../components/Shapes'
import StartGameModal from '../components/StartGameModal'
import { Field, Toggle, ErrorBox, Splash, useToast } from '../components/ui'

export default function Editor() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [loadError, setLoadError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [tagsText, setTagsText] = useState('')
  const [qs, setQs] = useState([])
  const [sel, setSel] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [toast, showToast] = useToast()
  usePageTitle(meta ? `Kreator · ${meta.title}` : 'Kreator')

  useEffect(() => {
    api.getQuiz(id).then((quiz) => {
      if (!quiz) return setLoadError(new Error('Nie znaleziono quizu.'))
      if (quiz.owner !== user.id) return nav(`/app/quiz/${id}`, { replace: true })
      setMeta({ title: quiz.title, description: quiz.description, cover: quiz.cover, tags: quiz.tags, is_public: quiz.is_public })
      setTagsText(quiz.tags.join(', '))
      setQs(quiz.questions.length ? withKeys(quiz.questions) : [blankQuestion()])
    }).catch(setLoadError)
  }, [id, user.id, nav])

  const save = useCallback(async () => {
    setSaving(true); setSaveError(null)
    try {
      await api.saveQuiz(id, meta, qs)
      setDirty(false)
      showToast('Zapisano')
      return true
    } catch (e) {
      setSaveError(e)
      return false
    } finally {
      setSaving(false)
    }
  }, [id, meta, qs, showToast])

  // Cmd/Ctrl+S
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ostrzeżenie przed zamknięciem karty z niezapisanymi zmianami
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (loadError) return <div className="page"><ErrorBox error={loadError} /></div>
  if (!meta) return <Splash />

  const q = qs[Math.min(sel, qs.length - 1)]
  const issues = qs.map(questionIssues)
  const invalid = issues.filter((x) => x.length).length

  const touch = () => setDirty(true)
  const updateMeta = (patch) => { setMeta((m) => ({ ...m, ...patch })); touch() }
  const updateQ = (patch) => {
    setQs((list) => list.map((x, j) => (j === sel ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)))
    touch()
  }
  const updateAnswer = (i, patch) => updateQ((x) => ({ answers: x.answers.map((a, k) => (k === i ? { ...a, ...patch } : a)) }))
  const toggleCorrect = (i) => updateQ((x) => ({
    answers: x.answers.map((a, k) => (x.type === 'multi' ? (k === i ? { ...a, correct: !a.correct } : a) : { ...a, correct: k === i })),
  }))
  const add = (type) => { setQs((l) => [...l, blankQuestion(type)]); setSel(qs.length); touch() }
  const remove = () => {
    setQs((l) => (l.length === 1 ? [blankQuestion()] : l.filter((_, j) => j !== sel)))
    setSel((s) => Math.max(0, s - 1)); touch()
  }
  const duplicateQ = () => {
    setQs((l) => [...l.slice(0, sel + 1), cloneQuestion(l[sel]), ...l.slice(sel + 1)])
    setSel(sel + 1); touch()
  }
  const move = (dir) => {
    const to = sel + dir
    if (to < 0 || to >= qs.length) return
    setQs((l) => { const c = [...l]; [c[sel], c[to]] = [c[to], c[sel]]; return c })
    setSel(to); touch()
  }

  async function play() {
    if (dirty && !(await save())) return
    setPlaying(true)
  }

  return (
    <>
      <div className="editor">
        <aside className="editor-list">
          {qs.map((x, i) => (
            <div key={x.key} className={`q-item ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}
              role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(i)}>
              <span className="n">{i + 1}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t">{x.text || <span className="muted">Bez treści</span>}</div>
                <div className="small muted">{TYPE_LABELS[x.type]} · {x.time_limit}s</div>
              </div>
              {issues[i].length > 0 && <AlertTriangle className="warn-ic" aria-label="Do poprawy" />}
            </div>
          ))}
          <div className="stack" style={{ gap: 6, marginTop: 8, minWidth: 170 }}>
            <div className="small muted">Dodaj pytanie</div>
            <button className="btn btn-sm" onClick={() => add('single')}><Plus /> Quiz (ABC)</button>
            <button className="btn btn-sm" onClick={() => add('multi')}><Plus /> Wielokrotny wybór</button>
            <button className="btn btn-sm" onClick={() => add('truefalse')}><Plus /> Prawda / Fałsz</button>
          </div>
        </aside>

        <section className="editor-main">
          <div className="row between">
            <span className="small muted">Pytanie {sel + 1} z {qs.length} · {TYPE_LABELS[q.type]}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="icon-btn sm" onClick={() => move(-1)} disabled={sel === 0} title="W górę"><ChevronUp /></button>
              <button className="icon-btn sm" onClick={() => move(1)} disabled={sel === qs.length - 1} title="W dół"><ChevronDown /></button>
              <button className="icon-btn sm" onClick={duplicateQ} title="Duplikuj pytanie"><Copy /></button>
              <button className="icon-btn sm" onClick={remove} title="Usuń pytanie"><Trash2 /></button>
            </div>
          </div>

          <textarea className="q-text" placeholder="Wpisz pytanie…" maxLength={300} rows={2}
            value={q.text} onChange={(e) => updateQ({ text: e.target.value })} aria-label="Treść pytania" />

          <div className="row">
            <ImageIcon size={18} className="muted" />
            <input className="input" placeholder="Link do obrazka (opcjonalnie, https://…)" value={q.image_url}
              onChange={(e) => updateQ({ image_url: e.target.value.trim() })} aria-label="Link do obrazka" />
          </div>
          {q.image_url && /^https?:\/\//.test(q.image_url) && (
            <img className="q-image" src={q.image_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          )}

          <div className="ans-grid">
            {q.answers.map((a, i) => {
              const si = styleIndex(q.type, i)
              return (
                <div key={i} className={`ans-edit ans-${si}`}>
                  <span className="sh"><Shape i={si} /></span>
                  <input type="text" value={a.text} maxLength={80} readOnly={q.type === 'truefalse'}
                    placeholder={`Odpowiedź ${i + 1}`} aria-label={`Odpowiedź ${i + 1}`}
                    onChange={(e) => updateAnswer(i, { text: e.target.value })} />
                  {q.type !== 'truefalse' && q.answers.length > 2 && (
                    <button className="icon-btn sm" title="Usuń odpowiedź"
                      onClick={() => updateQ((x) => {
                        const answers = x.answers.filter((_, k) => k !== i)
                        if (!answers.some((y) => y.correct)) answers[0] = { ...answers[0], correct: true }
                        return { answers }
                      })}><X /></button>
                  )}
                  <button className={`correct-btn ${a.correct ? 'on' : ''}`} onClick={() => toggleCorrect(i)}
                    title={a.correct ? 'Poprawna' : 'Oznacz jako poprawną'} aria-pressed={a.correct}><Check /></button>
                </div>
              )
            })}
          </div>
          {q.type !== 'truefalse' && q.answers.length < 6 && (
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
              onClick={() => updateQ((x) => ({ answers: [...x.answers, { text: '', correct: false }] }))}>
              <Plus /> Dodaj odpowiedź
            </button>
          )}
          {q.type === 'multi' && <div className="small muted">Uczeń dostaje punkty tylko za zaznaczenie wszystkich poprawnych (i żadnej błędnej).</div>}
          {issues[sel].length > 0 && <div className="info-box" style={{ color: 'var(--warn)' }}>Do poprawy: {issues[sel].join(', ')}.</div>}
        </section>

        <aside className="editor-side">
          <div className="stack">
            <button className="btn btn-primary btn-block" onClick={save} disabled={saving || !dirty}>
              <Save /> {saving ? 'Zapisuję…' : dirty ? 'Zapisz (⌘S)' : 'Zapisano'}
            </button>
            <button className="btn btn-accent btn-block" onClick={play} disabled={invalid > 0 || saving}>
              <Play /> Uruchom grę
            </button>
            {invalid > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{invalid} pyt. do poprawy przed grą.</div>}
            <ErrorBox error={saveError} />
          </div>

          <div className="stack">
            <div className="eyebrow">Pytanie</div>
            <Field label="Typ">
              <select className="select" value={q.type} onChange={(e) => updateQ((x) => changeType(x, e.target.value))}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Czas na odpowiedź">
              <select className="select" value={q.time_limit} onChange={(e) => updateQ({ time_limit: Number(e.target.value) })}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t} s</option>)}
              </select>
            </Field>
            <Field label="Punkty">
              <select className="select" value={q.points} onChange={(e) => updateQ({ points: Number(e.target.value) })}>
                {POINT_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="stack">
            <div className="eyebrow">Quiz</div>
            <Field label="Tytuł">
              <input className="input" maxLength={120} value={meta.title} onChange={(e) => updateMeta({ title: e.target.value })} />
            </Field>
            <Field label="Opis">
              <textarea className="textarea" maxLength={500} value={meta.description}
                onChange={(e) => updateMeta({ description: e.target.value })} />
            </Field>
            <Field label="Okładka">
              <div className="emoji-grid">
                {COVERS.map((c) => (
                  <button key={c} type="button" className={meta.cover === c ? 'on' : ''} onClick={() => updateMeta({ cover: c })}>{c}</button>
                ))}
              </div>
            </Field>
            <Field label="Tagi" hint="Po przecinku, np. historia, klasa 7">
              <input className="input" value={tagsText}
                onChange={(e) => { setTagsText(e.target.value); updateMeta({ tags: parseTags(e.target.value) }) }} />
            </Field>
            <Toggle checked={meta.is_public} onChange={(v) => updateMeta({ is_public: v })} label="Publiczny (w wyszukiwarce)" />
          </div>
        </aside>
      </div>
      {playing && <StartGameModal quiz={{ id, title: meta.title, cover: meta.cover }} onClose={() => setPlaying(false)} />}
      {toast}
    </>
  )
}
