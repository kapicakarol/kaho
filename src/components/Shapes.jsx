// Każda odpowiedź = kolor + kształt (czytelne na projektorze i dla daltonistów)
const PATHS = [
  'M12 3 L22 20.5 L2 20.5 Z',                                   // trójkąt
  'M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z',                        // romb
  null,                                                         // koło
  'M3.5 3.5 H20.5 V20.5 H3.5 Z',                                // kwadrat
  'M12 2l2.95 6.2 6.8.8-5 4.7 1.3 6.7L12 17.1 5.95 20.4l1.3-6.7-5-4.7 6.8-.8z', // gwiazda
  'M12 1.8 L21.2 7 L21.2 17 L12 22.2 L2.8 17 L2.8 7 Z',         // sześciokąt
]

export const SHAPE_NAMES = ['trójkąt', 'romb', 'koło', 'kwadrat', 'gwiazda', 'sześciokąt']

export function Shape({ i }) {
  const p = PATHS[i % PATHS.length]
  return (
    <svg viewBox="0 0 24 24" className="shape" aria-hidden="true">
      {p ? <path d={p} /> : <circle cx="12" cy="12" r="10" />}
    </svg>
  )
}

// Prawda/Fałsz: niebieski romb / czerwony trójkąt (jak w Kahoot)
export function styleIndex(type, i) {
  if (type === 'truefalse') return i === 0 ? 1 : 0
  return i
}

export const TYPE_LABELS = {
  single: 'Quiz (ABC)',
  multi: 'Wielokrotny wybór',
  truefalse: 'Prawda / Fałsz',
}
