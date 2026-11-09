// Backend: Supabase (Postgres + RLS + RPC + Realtime)
import { supabase, getPlayerClient } from '../supabase'
import { toAppError } from '../errors'

const PLAYER_SESSION = 'kaho.player'

function unwrap({ data, error }) {
  if (error) throw toAppError(error)
  return data
}

function mapUser(u) {
  if (!u || u.is_anonymous) return null
  return { id: u.id, email: u.email, username: u.user_metadata?.username || u.email?.split('@')[0] }
}

async function myId() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw toAppError({ code: 'auth_required' })
  return id
}

function stripIds(questions) {
  return questions.map(({ id, quiz_id, position, ...q }) => q)
}

// Realtime + zapasowe odpytywanie (słabe Wi-Fi w szkole)
function subscribe(client, gameId, onEvent, { answers = false } = {}) {
  let ch = client
    .channel(`kaho-${gameId}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (p) => onEvent({ table: 'games', row: p.new }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
      (p) => onEvent({ table: 'game_players', row: p.new }))
  if (answers) {
    ch = ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_answers', filter: `game_id=eq.${gameId}` },
      (p) => onEvent({ table: 'game_answers', row: p.new }))
  }
  ch.subscribe((status) => { if (status === 'SUBSCRIBED') onEvent({ table: '*' }) })
  const poll = setInterval(() => onEvent({ table: '*', poll: true }), 5000)
  return () => { clearInterval(poll); client.removeChannel(ch) }
}

async function serverOffset(client) {
  const t0 = Date.now()
  const { data, error } = await client.rpc('server_time')
  const t1 = Date.now()
  if (error) return 0
  return new Date(data).getTime() - (t0 + t1) / 2
}

async function ensurePlayerSession() {
  const c = getPlayerClient()
  const { data } = await c.auth.getSession()
  if (data.session) return data.session
  const res = await c.auth.signInAnonymously()
  if (res.error) throw toAppError(res.error)
  return res.data.session
}

export const supabaseApi = {
  mode: 'supabase',

  auth: {
    async getUser() {
      const { data } = await supabase.auth.getSession()
      return mapUser(data.session?.user)
    },
    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(mapUser(s?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      unwrap(await supabase.auth.signInWithPassword({ email, password }))
    },
    async signUp(email, password, username) {
      const data = unwrap(await supabase.auth.signUp({ email, password, options: { data: { username } } }))
      return { needsConfirmation: !data.session }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  },

  // ---------- profil ----------
  async getProfile() {
    const id = await myId()
    return unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle())
  },
  async updateProfile(patch) {
    const id = await myId()
    unwrap(await supabase.from('profiles').update(patch).eq('id', id))
    if (patch.username) unwrap(await supabase.auth.updateUser({ data: { username: patch.username } }))
  },

  // ---------- quizy ----------
  async listMyQuizzes() {
    const id = await myId()
    const rows = unwrap(await supabase.from('quizzes').select('*, questions(count)')
      .eq('owner', id).order('updated_at', { ascending: false }))
    return rows.map(({ questions, ...q }) => ({ ...q, question_count: questions?.[0]?.count ?? 0 }))
  },
  async searchQuizzes(query = '', tag = '') {
    const rows = unwrap(await supabase.rpc('search_quizzes', { p_query: query.trim(), p_tag: tag }))
    const owners = [...new Set(rows.map((r) => r.owner))]
    if (!owners.length) return rows
    const profiles = unwrap(await supabase.from('profiles').select('id, username').in('id', owners))
    const names = Object.fromEntries(profiles.map((p) => [p.id, p.username]))
    return rows.map((r) => ({ ...r, owner_name: names[r.owner] }))
  },
  async getQuiz(id) {
    const quiz = unwrap(await supabase.from('quizzes').select('*').eq('id', id).maybeSingle())
    if (!quiz) return null
    const questions = unwrap(await supabase.from('questions').select('*').eq('quiz_id', id).order('position'))
    const owner = unwrap(await supabase.from('profiles').select('username').eq('id', quiz.owner).maybeSingle())
    return { ...quiz, owner_name: owner?.username, questions }
  },
  async createQuiz(meta = {}, questions = []) {
    await myId()
    const quiz = unwrap(await supabase.from('quizzes').insert({ title: meta.title || 'Nowy quiz' }).select().single())
    if (questions.length || Object.keys(meta).length) {
      unwrap(await supabase.rpc('save_quiz', {
        p_quiz: quiz.id,
        p_meta: { tags: [], ...meta },
        p_questions: stripIds(questions),
      }))
    }
    return quiz.id
  },
  async saveQuiz(id, meta, questions) {
    unwrap(await supabase.rpc('save_quiz', { p_quiz: id, p_meta: meta, p_questions: stripIds(questions) }))
  },
  async deleteQuiz(id) {
    unwrap(await supabase.from('quizzes').delete().eq('id', id))
  },

  // ---------- gra: host ----------
  async createGame(quizId, settings) {
    return unwrap(await supabase.rpc('create_game', { p_quiz: quizId, p_settings: settings }))
  },
  async hostAction(gameId, action) {
    return unwrap(await supabase.rpc(`host_${action}`, { p_game: gameId }))
  },
  async kick(gameId, playerId) {
    unwrap(await supabase.rpc('host_kick', { p_game: gameId, p_player: playerId }))
  },
  async getGame(gameId) {
    return unwrap(await supabase.from('games').select('*').eq('id', gameId).maybeSingle())
  },
  async listPlayers(gameId) {
    return unwrap(await supabase.from('game_players').select('*').eq('game_id', gameId)
      .order('score', { ascending: false }).order('joined_at'))
  },
  async listAnswers(gameId) {
    return unwrap(await supabase.from('game_answers').select('*').eq('game_id', gameId))
  },
  async getSecrets(gameId) {
    const row = unwrap(await supabase.from('game_secrets').select('questions').eq('game_id', gameId).maybeSingle())
    return row?.questions ?? []
  },
  async myGames() {
    const id = await myId()
    const rows = unwrap(await supabase.from('games').select('*, game_players(count)')
      .eq('host', id).order('created_at', { ascending: false }).limit(100))
    return rows.map(({ game_players, ...g }) => ({ ...g, player_count: game_players?.[0]?.count ?? 0 }))
  },
  subscribeGame(gameId, onEvent) {
    return subscribe(supabase, gameId, onEvent, { answers: true })
  },
  serverOffset() {
    return serverOffset(supabase)
  },

  // ---------- gra: uczeń (bez konta) ----------
  player: {
    async join(pin, nickname) {
      await ensurePlayerSession()
      const data = unwrap(await getPlayerClient().rpc('join_game', { p_pin: pin, p_nickname: nickname }))
      localStorage.setItem(PLAYER_SESSION, JSON.stringify({ ...data, pin }))
      return data
    },
    savedSession() {
      try { return JSON.parse(localStorage.getItem(PLAYER_SESSION) || 'null') } catch { return null }
    },
    clearSession() {
      localStorage.removeItem(PLAYER_SESSION)
    },
    async submit(gameId, answer) {
      return unwrap(await getPlayerClient().rpc('submit_answer', { p_game: gameId, p_answer: answer }))
    },
    async getGame(gameId) {
      return unwrap(await getPlayerClient().from('games').select('*').eq('id', gameId).maybeSingle())
    },
    async me(gameId) {
      const c = getPlayerClient()
      const { data } = await c.auth.getSession()
      const uid = data.session?.user?.id
      if (!uid) return null
      return unwrap(await c.from('game_players').select('*').eq('game_id', gameId).eq('user_id', uid).maybeSingle())
    },
    async listPlayers(gameId) {
      return unwrap(await getPlayerClient().from('game_players').select('*').eq('game_id', gameId)
        .eq('kicked', false).order('score', { ascending: false }))
    },
    async myAnswer(gameId, playerId, questionIndex) {
      return unwrap(await getPlayerClient().from('game_answers').select('*').eq('game_id', gameId)
        .eq('player_id', playerId).eq('question_index', questionIndex).maybeSingle())
    },
    subscribe(gameId, onEvent) {
      return subscribe(getPlayerClient(), gameId, onEvent)
    },
    serverOffset() {
      return serverOffset(getPlayerClient())
    },
  },
}
