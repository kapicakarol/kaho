import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Odświeżanie bez nakładania się zapytań (seria zdarzeń realtime = 1-2 zapytania)
function useCoalesced(fn) {
  const busy = useRef(false)
  const again = useRef(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback(async function run() {
    if (busy.current) { again.current = true; return }
    busy.current = true
    try { await fnRef.current() } finally {
      busy.current = false
      if (again.current) { again.current = false; run() }
    }
  }, [])
}

export function useHostGame(gameId) {
  const [state, setState] = useState({ loading: true, error: null, game: null, players: [], answers: [] })
  const [secrets, setSecrets] = useState(null)

  const refetch = useCoalesced(async () => {
    try {
      const [game, players, answers] = await Promise.all([
        api.getGame(gameId), api.listPlayers(gameId), api.listAnswers(gameId),
      ])
      setState({
        loading: false, game, players, answers,
        error: game ? null : new Error('Nie znaleziono gry albo nie jesteś jej prowadzącym.'),
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e }))
    }
  })

  useEffect(() => {
    refetch()
    api.getSecrets(gameId).then(setSecrets).catch(() => setSecrets([]))
    return api.subscribeGame(gameId, () => refetch())
  }, [gameId, refetch])

  const setGame = useCallback((game) => setState((s) => ({ ...s, game })), [])
  return { ...state, secrets, refetch, setGame }
}

export function usePlayerGame(gameId) {
  const [state, setState] = useState({ loading: true, game: null, me: null, players: [] })

  const refetch = useCoalesced(async () => {
    try {
      const [game, me, players] = await Promise.all([
        api.player.getGame(gameId), api.player.me(gameId), api.player.listPlayers(gameId),
      ])
      setState({ loading: false, game, me, players })
    } catch {
      setState((s) => ({ ...s, loading: false }))
    }
  })

  useEffect(() => {
    refetch()
    return api.player.subscribe(gameId, () => refetch())
  }, [gameId, refetch])

  return { ...state, refetch }
}

// Przesunięcie zegara względem serwera (ms)
export function useServerOffset(role = 'host') {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const fn = role === 'player' ? api.player.serverOffset : api.serverOffset
    fn().then((o) => setOffset(Number.isFinite(o) ? o : 0)).catch(() => {})
  }, [role])
  return offset
}

// Pozostały czas pytania w ms. Liczone przy każdym renderze (bez nieaktualnego
// stanu — inaczej host mógłby od razu „odsłonić” pytanie po wczytaniu gry).
export function useCountdown(startedAt, limitSec, offset = 0) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => setTick((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [startedAt])
  if (!startedAt || !limitSec) return 0
  const left = Date.parse(startedAt) + limitSec * 1000 - (Date.now() + offset)
  return Math.min(limitSec * 1000, Math.max(0, left))
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    return fn().then(
      (data) => setState({ loading: false, data, error: null }),
      (error) => setState({ loading: false, data: null, error }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}
