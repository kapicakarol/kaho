// Model pytania w kreatorze: tworzenie, zmiana typu, walidacja.
const rid = () => Math.random().toString(36).slice(2, 10)

export const COVERS = ['🎯', '🧠', '📚', '🧪', '🌍', '🏰', '🔢', '🎨', '🎵', '⚽', '🦖', '🚀', '💻', '🧬', '📐', '🗺️']

export function blankAnswers(type) {
  if (type === 'truefalse') return [{ text: 'Prawda', correct: true }, { text: 'Fałsz', correct: false }]
  return [
    { text: '', correct: true }, { text: '', correct: false },
    { text: '', correct: false }, { text: '', correct: false },
  ]
}

export function blankQuestion(type = 'single') {
  return {
    key: rid(), type, text: '', image_url: '',
    time_limit: type === 'truefalse' ? 10 : 20, points: 1000,
    answers: blankAnswers(type),
  }
}

export function withKeys(questions) {
  return questions.map((q) => ({ ...q, key: q.id || q.key || rid() }))
}

export function cloneQuestion(q) {
  return { ...q, id: undefined, key: rid(), answers: q.answers.map((a) => ({ ...a })) }
}

export function changeType(q, type) {
  if (type === q.type) return q
  if (type === 'truefalse') return { ...q, type, answers: blankAnswers('truefalse') }
  let answers = q.type === 'truefalse' ? blankAnswers(type) : q.answers
  if (type === 'single') {
    const first = Math.max(0, answers.findIndex((a) => a.correct))
    answers = answers.map((a, i) => ({ ...a, correct: i === first }))
  }
  return { ...q, type, answers }
}

export function questionIssues(q) {
  const out = []
  if (!q.text.trim()) out.push('brak treści pytania')
  if (q.answers.length < 2) out.push('potrzebne min. 2 odpowiedzi')
  if (q.answers.some((a) => !a.text.trim())) out.push('puste pola odpowiedzi')
  if (!q.answers.some((a) => a.correct)) out.push('zaznacz poprawną odpowiedź')
  return out
}

export function parseTags(text) {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
}
