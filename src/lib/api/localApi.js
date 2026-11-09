// Backend demo: localStorage + BroadcastChannel.
// Odwzorowuje funkcje SQL (create_game, join_game, submit_answer, host_*),
// żeby całą grę dało się przetestować w kilku kartach jednej przeglądarki.
import { DEFAULT_SETTINGS, scoreAnswer, isCorrect } from '../scoring'
import { toAppError } from '../errors'

const DB_KEY = 'kaho.demo.db'
const SESSION_KEY = 'kaho.demo.session'
const PLAYER_UID = 'kaho.demo.playerUid' // sessionStorage: każda karta = inny uczeń
const PLAYER_SESSION = 'kaho.player'

const bus = new EventTarget()
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kaho-demo') : null
if (chan) chan.onmessage = (e) => bus.dispatchEvent(new CustomEvent('change', { detail: e.data }))

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
const nowIso = () => new Date().toISOString()
const fail = (code) => { throw toAppError({ code }) }
const tick = () => new Promise((r) => setTimeout(r, 0))

const empty = () => ({ users: [], profiles: [], quizzes: [], questions: [], games: [], secrets: [], players: [], answers: [] })
function read() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(DB_KEY) || '{}') } } catch { return empty() }
}
function write(db, change) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  if (change) {
    chan?.postMessage(change)
    bus.dispatchEvent(new CustomEvent('change', { detail: change }))
  }
}

// ---------- auth ----------
const authListeners = new Set()
function me(db = read()) {
  const u = db.users.find((x) => x.id === localStorage.getItem(SESSION_KEY))
  if (!u) return null
  const p = db.profiles.find((x) => x.id === u.id)
  return { id: u.id, email: u.email, username: p?.username || u.email.split('@')[0] }
}
function requireMe(db) { return me(db) || fail('auth_required') }
function notifyAuth() { const u = me(); authListeners.forEach((cb) => cb(u)) }
async function hash(s) {
  if (!globalThis.crypto?.subtle) return 'plain:' + s
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kaho:' + s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- helpers ----------
const canSeeQuestions = (q, u) => (u && q.owner === u.id) || (q.is_public && !!u)
const correctIdx = (q) => q.answers.map((a, i) => (a.correct ? i : -1)).filter((i) => i >= 0)
const validQuestion = (q) =>
  q.text?.trim() && q.answers?.length >= 2 && q.answers.some((a) => a.correct) && q.answers.every((a) => a.text?.trim())
function normalizeTags(tags = []) {
  return [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
}
function playerUid() {
  let id = sessionStorage.getItem(PLAYER_UID)
  if (!id) { id = uid(); sessionStorage.setItem(PLAYER_UID, id) }
  return id
}
function hostGame(db, gameId) {
  const u = requireMe(db)
  const g = db.games.find((x) => x.id === gameId)
  if (!g || g.host !== u.id) fail('not_host')
  return g
}
// = public.apply_question_scores
function applyScores(db, gameId, index) {
  const ans = db.answers.filter((a) => a.game_id === gameId && a.question_index === index)
  db.players.filter((p) => p.game_id === gameId).forEach((p) => {
    const a = ans.find((x) => x.player_id === p.id)
    if (!a) { p.streak = 0; return }
    p.score += a.points
    p.streak = a.correct ? p.streak + 1 : 0
    p.correct_count += a.correct ? 1 : 0
  })
  return ans
}

function writeQuestions(db, quizId, questions) {
  db.questions = db.questions.filter((q) => q.quiz_id !== quizId)
  questions.forEach((q, i) => db.questions.push({
    id: uid(), quiz_id: quizId, position: i,
    type: q.type || 'single', text: q.text || '', image_url: q.image_url || '',
    time_limit: q.time_limit || 20, points: q.points ?? 1000,
    answers: (q.answers || []).map((a) => ({ text: a.text || '', correct: !!a.correct })),
  }))
}

export const localApi = {
  mode: 'local',

  auth: {
    async getUser() { await tick(); return me() },
    onChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb) },
    async signUp(email, password, username) {
      await tick()
      email = String(email).trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) fail('invalid_email')
      if (String(password).length < 6) fail('weak_password')
      const db = read()
      if (db.users.some((u) => u.email === email)) fail('user_exists')
      const id = uid()
      db.users.push({ id, email, pw: await hash(password) })
      db.profiles.push({ id, username: username?.trim() || email.split('@')[0], default_settings: {}, created_at: nowIso() })
      write(db)
      localStorage.setItem(SESSION_KEY, id)
      notifyAuth()
      return { needsConfirmation: false }
    },
    async signIn(email, password) {
      await tick()
      const db = read()
      const u = db.users.find((x) => x.email === String(email).trim().toLowerCase())
      if (!u || u.pw !== (await hash(password))) fail('invalid_credentials')
      localStorage.setItem(SESSION_KEY, u.id)
      notifyAuth()
    },
    async signOut() { localStorage.removeItem(SESSION_KEY); notifyAuth() },
  },

  // ---------- profil ----------
  async getProfile() {
    await tick()
    const db = read(); const u = requireMe(db)
    return db.profiles.find((p) => p.id === u.id) || null
  },
  async updateProfile(patch) {
    const db = read(); const u = requireMe(db)
    const p = db.profiles.find((x) => x.id === u.id)
    Object.assign(p, patch)
    write(db)
    notifyAuth()
  },

  // ---------- quizy ----------
  async listMyQuizzes() {
    await tick()
    const db = read(); const u = requireMe(db)
    return db.quizzes.filter((q) => q.owner === u.id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((q) => ({ ...q, question_count: db.questions.filter((x) => x.quiz_id === q.id).length }))
  },
  async searchQuizzes(query = '', tag = '') {
    await tick()
    const db = read()
    const s = query.trim().toLowerCase()
    return db.quizzes
      .filter((q) => q.is_public)
      .filter((q) => !s || q.title.toLowerCase().includes(s) || q.description.toLowerCase().includes(s) ||
        q.tags.some((t) => t.includes(s)))
      .filter((q) => !tag || q.tags.includes(tag.toLowerCase()))
      .sort((a, b) => b.play_count - a.play_count || b.updated_at.localeCompare(a.updated_at))
      .slice(0, 60)
      .map((q) => ({ ...q, owner_name: db.profiles.find((p) => p.id === q.owner)?.username }))
  },
  async getQuiz(id) {
    await tick()
    const db = read(); const u = me(db)
    const q = db.quizzes.find((x) => x.id === id)
    if (!q || !(q.is_public || q.owner === u?.id)) return null
    const questions = canSeeQuestions(q, u)
      ? db.questions.filter((x) => x.quiz_id === id).sort((a, b) => a.position - b.position)
      : []
    return { ...q, owner_name: db.profiles.find((p) => p.id === q.owner)?.username, questions }
  },
  async createQuiz(meta = {}, questions = []) {
    await tick()
    const db = read(); const u = requireMe(db)
    const quiz = {
      id: uid(), owner: u.id, title: meta.title?.trim() || 'Nowy quiz', description: meta.description || '',
      cover: meta.cover || '🎯', tags: normalizeTags(meta.tags), is_public: !!meta.is_public,
      play_count: 0, created_at: nowIso(), updated_at: nowIso(),
    }
    db.quizzes.push(quiz)
    writeQuestions(db, quiz.id, questions)
    write(db)
    return quiz.id
  },
  async saveQuiz(id, meta, questions) {
    await tick()
    const db = read(); const u = requireMe(db)
    const q = db.quizzes.find((x) => x.id === id && x.owner === u.id)
    if (!q) fail('quiz_not_found')
    Object.assign(q, {
      title: meta.title?.trim() || q.title, description: meta.description ?? q.description,
      cover: meta.cover || q.cover, tags: normalizeTags(meta.tags), is_public: meta.is_public ?? q.is_public,
      updated_at: nowIso(),
    })
    writeQuestions(db, id, questions)
    write(db)
  },
  async deleteQuiz(id) {
    const db = read(); const u = requireMe(db)
    db.quizzes = db.quizzes.filter((q) => !(q.id === id && q.owner === u.id))
    db.questions = db.questions.filter((q) => q.quiz_id !== id || db.quizzes.some((z) => z.id === id))
    write(db)
  },

  // ---------- gra: host ----------
  async createGame(quizId, settings = {}) {
    await tick()
    const db = read(); const u = requireMe(db)
    const quiz = db.quizzes.find((q) => q.id === quizId)
    if (!quiz || !(quiz.owner === u.id || quiz.is_public)) fail('quiz_not_found')
    const qs = db.questions.filter((x) => x.quiz_id === quizId).sort((a, b) => a.position - b.position)
    if (!qs.length) fail('quiz_empty')
    if (!qs.every(validQuestion)) fail('quiz_invalid')
    let pin
    do { pin = String(Math.floor(Math.random() * 1e6)).padStart(6, '0') }
    while (db.games.some((g) => g.pin === pin && g.status !== 'ended'))
    const game = {
      id: uid(), quiz_id: quizId, host: u.id, pin, status: 'lobby', quiz_title: quiz.title,
      question_count: qs.length, current_question: -1, current: null, reveal: null,
      settings: { ...DEFAULT_SETTINGS, ...settings }, question_started_at: null,
      created_at: nowIso(), ended_at: null,
    }
    db.games.push(game)
    db.secrets.push({
      game_id: game.id,
      questions: qs.map(({ type, text, image_url, time_limit, points, answers }) =>
        ({ type, text, image_url, time_limit, points, answers })),
    })
    quiz.play_count += 1
    write(db, { gameId: game.id, table: 'games' })
    return game
  },
  async hostAction(gameId, action) {
    await tick()
    const db = read()
    const g = hostGame(db, gameId)
    const secrets = db.secrets.find((s) => s.game_id === gameId).questions

    if (action === 'next') {
      if (g.status === 'ended') return g
      if (g.status === 'question') fail('reveal_first')
      const idx = g.current_question + 1
      if (idx >= g.question_count) {
        Object.assign(g, { status: 'ended', ended_at: nowIso(), current: null })
      } else {
        const q = secrets[idx]
        Object.assign(g, {
          status: 'question', current_question: idx, reveal: null, question_started_at: nowIso(),
          current: { index: idx, type: q.type, text: q.text, image_url: q.image_url || '',
            time_limit: q.time_limit, points: q.points, answers: q.answers.map((a) => a.text) },
        })
      }
    } else if (action === 'reveal') {
      if (g.status !== 'question') return g
      const q = secrets[g.current_question]
      const ans = applyScores(db, gameId, g.current_question)
      g.status = 'reveal'
      g.reveal = {
        index: g.current_question, correct: correctIdx(q), answered: ans.length,
        counts: q.answers.map((_, i) => ans.filter((a) => a.answer.includes(i)).length),
      }
    } else if (action === 'scoreboard') {
      if (g.status === 'reveal') g.status = 'scoreboard'
    } else if (action === 'end') {
      if (g.status === 'question') applyScores(db, gameId, g.current_question)
      Object.assign(g, { status: 'ended', ended_at: g.ended_at || nowIso(), current: null })
    }
    write(db, { gameId, table: 'games' })
    return g
  },
  async kick(gameId, playerId) {
    const db = read(); hostGame(db, gameId)
    const p = db.players.find((x) => x.id === playerId && x.game_id === gameId)
    if (p) p.kicked = true
    write(db, { gameId, table: 'game_players' })
  },
  async getGame(gameId) {
    await tick()
    const db = read(); const u = me(db)
    const g = db.games.find((x) => x.id === gameId)
    return g && g.host === u?.id ? g : null
  },
  async listPlayers(gameId) {
    await tick()
    const db = read(); hostGame(db, gameId)
    return db.players.filter((p) => p.game_id === gameId).sort((a, b) => b.score - a.score)
  },
  async listAnswers(gameId) {
    await tick()
    const db = read(); hostGame(db, gameId)
    return db.answers.filter((a) => a.game_id === gameId)
  },
  async getSecrets(gameId) {
    await tick()
    const db = read(); hostGame(db, gameId)
    return db.secrets.find((s) => s.game_id === gameId)?.questions ?? []
  },
  async myGames() {
    await tick()
    const db = read(); const u = requireMe(db)
    return db.games.filter((g) => g.host === u.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((g) => ({ ...g, player_count: db.players.filter((p) => p.game_id === g.id).length }))
  },
  subscribeGame(gameId, onEvent) {
    const h = (e) => { if (e.detail?.gameId === gameId) onEvent(e.detail) }
    bus.addEventListener('change', h)
    return () => bus.removeEventListener('change', h)
  },
  async serverOffset() { return 0 },

  // ---------- gra: uczeń ----------
  player: {
    async join(pin, nickname) {
      await tick()
      const db = read()
      const nick = String(nickname || '').replace(/\s+/g, ' ').trim()
      if (nick.length < 1 || nick.length > 20) fail('nickname_invalid')
      const g = db.games.find((x) => x.pin === String(pin).trim() && x.status !== 'ended')
      if (!g) fail('game_not_found')
      const me = playerUid()
      let p = db.players.find((x) => x.game_id === g.id && x.user_id === me)
      if (p?.kicked) fail('kicked')
      if (!p) {
        if (db.players.some((x) => x.game_id === g.id && x.nickname.toLowerCase() === nick.toLowerCase())) {
          fail('nickname_taken')
        }
        p = { id: uid(), game_id: g.id, user_id: me, nickname: nick, score: 0, streak: 0,
          correct_count: 0, kicked: false, joined_at: nowIso() }
        db.players.push(p)
        write(db, { gameId: g.id, table: 'game_players' })
      }
      const session = { game_id: g.id, player_id: p.id, nickname: p.nickname, pin: g.pin }
      sessionStorage.setItem(PLAYER_SESSION, JSON.stringify(session))
      return session
    },
    savedSession() {
      try { return JSON.parse(sessionStorage.getItem(PLAYER_SESSION) || 'null') } catch { return null }
    },
    clearSession() { sessionStorage.removeItem(PLAYER_SESSION) },
    async submit(gameId, answer) {
      await tick()
      const db = read()
      const g = db.games.find((x) => x.id === gameId)
      if (!g) fail('game_not_found')
      if (g.status !== 'question') fail('not_accepting')
      const p = db.players.find((x) => x.game_id === gameId && x.user_id === playerUid())
      if (!p || p.kicked) fail('not_in_game')
      if (db.answers.some((a) => a.player_id === p.id && a.question_index === g.current_question)) {
        fail('already_answered')
      }
      const q = db.secrets.find((s) => s.game_id === gameId).questions[g.current_question]
      const limitMs = q.time_limit * 1000
      const elapsed = Math.max(0, Date.now() - Date.parse(g.question_started_at))
      if (elapsed > limitMs + 1500) fail('too_late')
      const given = [...new Set(answer)].filter((i) => i >= 0 && i < q.answers.length).sort((a, b) => a - b)
      if (!given.length) fail('empty_answer')
      const ok = isCorrect(q.type, given, correctIdx(q))
      const points = scoreAnswer({ correct: ok, points: q.points, elapsedMs: elapsed, limitMs,
        prevStreak: p.streak, settings: g.settings })
      db.answers.push({ id: uid(), game_id: gameId, player_id: p.id, question_index: g.current_question,
        answer: given, correct: ok, time_ms: elapsed, points, created_at: nowIso() })
      // punkty trafiają do wyniku dopiero przy odsłonięciu (jak w SQL)
      write(db, { gameId, table: 'game_answers' })
      return { received: true }
    },
    async getGame(gameId) {
      await tick()
      const db = read()
      const p = db.players.find((x) => x.game_id === gameId && x.user_id === playerUid())
      if (!p || p.kicked) return null
      return db.games.find((x) => x.id === gameId) || null
    },
    async me(gameId) {
      await tick()
      const p = read().players.find((x) => x.game_id === gameId && x.user_id === playerUid())
      return p && !p.kicked ? p : null
    },
    async listPlayers(gameId) {
      await tick()
      return read().players.filter((p) => p.game_id === gameId && !p.kicked).sort((a, b) => b.score - a.score)
    },
    async myAnswer(gameId, playerId, questionIndex) {
      await tick()
      const db = read()
      const g = db.games.find((x) => x.id === gameId)
      if (g?.status === 'question' && g.current_question === questionIndex) return null
      return db.answers.find((a) => a.game_id === gameId && a.player_id === playerId &&
        a.question_index === questionIndex) || null
    },
    subscribe(gameId, onEvent) { return localApi.subscribeGame(gameId, onEvent) },
    async serverOffset() { return 0 },
  },
}
