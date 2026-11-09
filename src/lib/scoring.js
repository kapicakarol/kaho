// Custom punktacja. Źródłem prawdy jest funkcja SQL public.submit_answer;
// ten plik ją odwzorowuje (tryb demo + podgląd w ustawieniach gry).

export const DEFAULT_SETTINGS = {
  pointsMultiplier: 1, // 0.5 / 1 / 2 ...
  speedBonus: true,    // szybciej = więcej (do -50% przy ostatniej sekundzie)
  streakBonus: 100,    // pkt za każdą poprawną z rzędu
  maxStreak: 5,        // limit bonusu za serię
  showScoreboard: true // tablica wyników po każdym pytaniu
}

export const POINT_OPTIONS = [
  { value: 0, label: 'Bez punktów' },
  { value: 500, label: 'Połowa (500)' },
  { value: 1000, label: 'Standard (1000)' },
  { value: 2000, label: 'Podwójne (2000)' },
]

export const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120]

export function isCorrect(type, given, correct) {
  if (type === 'multi') {
    return given.length === correct.length && given.every((v, i) => v === correct[i])
  }
  return given.length === 1 && correct.includes(given[0])
}

export function scoreAnswer({ correct, points, elapsedMs, limitMs, prevStreak, settings }) {
  if (!correct) return 0
  const s = { ...DEFAULT_SETTINGS, ...settings }
  let base = points * Math.min(Math.max(Number(s.pointsMultiplier) || 0, 0), 3)
  if (s.speedBonus && limitMs > 0) base *= 1 - Math.min(1, elapsedMs / limitMs) / 2
  if (base > 0) {
    base += Math.min(prevStreak, Math.max(s.maxStreak | 0, 0)) * Math.max(s.streakBonus | 0, 0)
  }
  return Math.round(base)
}

// Zakres punktów za pytanie przy danych ustawieniach (do podglądu)
export function pointsRange(points, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings }
  const top = scoreAnswer({ correct: true, points, elapsedMs: 0, limitMs: 1, prevStreak: s.maxStreak, settings: s })
  const low = scoreAnswer({ correct: true, points, elapsedMs: 1, limitMs: 1, prevStreak: 0, settings: s })
  return { low, top }
}
