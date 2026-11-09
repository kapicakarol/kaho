// Testuje supabase/migrations/*.sql na prawdziwym Postgresie (PGlite, WASM)
// z zaślepką Supabase Auth. Uruchom: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const MIG_DIR = new URL('../supabase/migrations/', import.meta.url)
const migrations = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(new URL(f, MIG_DIR), 'utf8'))

const db = new PGlite()

// ---- zaślepka Supabase: schemat auth, role, auth.uid()/auth.jwt() ----
await db.exec(`
  create schema auth;
  create table auth.users (
    id uuid primary key, email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    is_anonymous boolean default false
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  -- jak w Supabase: role API mają uprawnienia do tabel, a dostęp ogranicza RLS
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)

for (const sql of migrations) await db.exec(sql)
for (const sql of migrations) await db.exec(sql) // idempotentność

const HOST = '00000000-0000-0000-0000-00000000000a'
const HOST2 = '00000000-0000-0000-0000-00000000000b'
const P1 = '00000000-0000-0000-0000-000000000001'
const P2 = '00000000-0000-0000-0000-000000000002'
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
    ('${HOST}',  'nauczyciel@szkola.pl', '{"username":"pani_ania"}', false),
    ('${HOST2}', 'inny@szkola.pl', '{}', false),
    ('${P1}', null, '{}', true),
    ('${P2}', null, '{}', true);
`)

// wykonaj zapytanie jako dany użytkownik (z RLS)
async function as(user, sql, params = [], anonymous = false) {
  await db.exec('reset role')
  const claims = user ? JSON.stringify({ sub: user, role: 'authenticated', is_anonymous: anonymous }) : ''
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}
const host = (s, p) => as(HOST, s, p)
const p1 = (s, p) => as(P1, s, p, true)
const p2 = (s, p) => as(P2, s, p, true)
async function rejects(promise, msg) {
  try { await promise } catch (e) {
    assert.match(e.message, new RegExp(msg), `oczekiwano błędu "${msg}", było: ${e.message}`)
    return
  }
  assert.fail(`oczekiwano błędu "${msg}", a zapytanie przeszło`)
}
const sup = (s, p) => db.query(s, p).then((r) => r.rows)
let passed = 0
const ok = (name) => { passed++; console.log('  ✓', name) }

console.log('Kaho SQL tests')

// ---- profile ----
const profiles = await sup('select id, username from public.profiles order by id')
assert.equal(profiles.length, 2)
assert.equal(profiles.find((p) => p.id === HOST).username, 'pani_ania')
ok('profil tworzony dla twórcy, nie dla anonimowego ucznia')

// ---- quiz ----
const [{ id: QUIZ }] = await host(`insert into public.quizzes (title) values ('Test') returning id`)
await host(`select public.save_quiz($1, $2, $3)`, [QUIZ,
  { title: 'Test quiz', description: 'opis', tags: ['Historia', ' historia ', 'klasa 7'], is_public: true, cover: '🏰' },
  [
    { type: 'single', text: 'Stolica Polski?', time_limit: 20, points: 1000,
      answers: [{ text: 'Kraków', correct: false }, { text: 'Warszawa', correct: true },
                { text: 'Gdańsk', correct: false }, { text: 'Poznań', correct: false }] },
    { type: 'multi', text: 'Liczby parzyste?', time_limit: 30, points: 2000,
      answers: [{ text: '2', correct: true }, { text: '3', correct: false },
                { text: '4', correct: true }, { text: '5', correct: false }] },
    { type: 'truefalse', text: 'Ziemia jest płaska', time_limit: 10, points: 0,
      answers: [{ text: 'Fałsz', correct: true }, { text: 'Prawda', correct: false }] },
  ]])
const [quiz] = await host('select * from public.quizzes where id = $1', [QUIZ])
assert.deepEqual([...quiz.tags].sort(), ['historia', 'klasa 7'])
assert.equal((await host('select count(*)::int c from public.questions where quiz_id=$1', [QUIZ]))[0].c, 3)
ok('save_quiz zapisuje meta + pytania, normalizuje tagi')

await rejects(p1(`insert into public.quizzes (title) values ('hack')`), 'row-level security')
ok('anonimowy uczeń nie może tworzyć quizów')

assert.equal((await p1('select * from public.questions where quiz_id=$1', [QUIZ])).length, 0)
assert.equal((await as(null, 'select * from public.questions where quiz_id=$1', [QUIZ])).length, 0)
assert.equal((await as(HOST2, 'select * from public.questions where quiz_id=$1', [QUIZ])).length, 3)
ok('pytania publicznego quizu widzi twórca, nie uczeń ani niezalogowany')

const found = await as(null, `select id from public.search_quizzes('test', '')`)
assert.equal(found.length, 1)
assert.equal((await as(null, `select id from public.search_quizzes('', 'historia')`)).length, 1)
assert.equal((await as(null, `select id from public.search_quizzes('xyz%'',''', '')`)).length, 0)
ok('wyszukiwarka: tekst, tag, odporna na znaki specjalne')

// ---- gra ----
await rejects(p1(`select * from public.create_game($1)`, [QUIZ]), 'auth_required')
const [game] = await host(`select * from public.create_game($1, $2)`, [QUIZ, { streakBonus: 100 }])
assert.match(game.pin, /^\d{6}$/)
assert.equal(game.question_count, 3)
assert.equal(game.status, 'lobby')
const GAME = game.id
ok('create_game: PIN 6 cyfr, poczekalnia, tylko zalogowany twórca')

const j1 = (await p1(`select public.join_game($1, $2) j`, [game.pin, '  Ala  ']))[0].j
assert.equal(j1.nickname, 'Ala')
await rejects(p2(`select public.join_game($1, $2)`, [game.pin, 'ALA']), 'nickname_taken')
await rejects(p2(`select public.join_game($1, $2)`, ['000000', 'Bartek']), 'game_not_found')
await p2(`select public.join_game($1, $2)`, [game.pin, 'Bartek'])
const rejoin = (await p1(`select public.join_game($1, $2) j`, [game.pin, 'Inny']))[0].j
assert.equal(rejoin.player_id, j1.player_id)
ok('join_game: unikalny nick (bez wielkości liter), ponowne dołączenie, zły PIN')

await rejects(p1(`select public.submit_answer($1, $2)`, [GAME, [1]]), 'not_accepting')
await rejects(p1(`select * from public.host_next($1)`, [GAME]), 'not_host')
await rejects(as(HOST2, `select * from public.host_next($1)`, [GAME]), 'not_host')

// pytanie 1
await host(`select * from public.host_next($1)`, [GAME])
const [g1] = await p1('select * from public.games where id=$1', [GAME])
assert.equal(g1.status, 'question')
assert.deepEqual(g1.current.answers, ['Kraków', 'Warszawa', 'Gdańsk', 'Poznań'])
assert.ok(!JSON.stringify(g1.current).includes('correct'))
assert.equal((await p1('select * from public.game_secrets')).length, 0)
assert.equal((await as(HOST2, 'select * from public.games where id=$1', [GAME])).length, 0)
ok('uczeń widzi pytanie bez poprawnych odpowiedzi; sekrety i cudze gry niewidoczne')

await sup(`update public.games set question_started_at = clock_timestamp() - interval '5 seconds' where id=$1`, [GAME])
await p1(`select public.submit_answer($1, $2)`, [GAME, [1]])
await rejects(p1(`select public.submit_answer($1, $2)`, [GAME, [1]]), 'already_answered')
assert.equal((await p1('select * from public.game_answers')).length, 0)
await p2(`select public.submit_answer($1, $2)`, [GAME, [0]])
ok('submit_answer: jedna odpowiedź na pytanie, wynik ukryty do odsłonięcia')

const [{ score: before }] = await p1('select score from public.game_players where user_id = auth.uid()')
assert.equal(before, 0)
ok('w trakcie pytania wynik ucznia się nie zmienia (nic nie zdradza poprawności)')

await p1(`update public.game_players set score = 999999`)
await rejects(p1(`insert into public.game_answers (game_id, player_id, question_index, correct, points)
                  values ($1, $2, 0, true, 999999)`, [GAME, j1.player_id]), 'row-level security')
await rejects(p1(`select public.apply_question_scores($1, 0)`, [GAME]), 'permission denied')

const [r1] = await host(`select * from public.host_reveal($1)`, [GAME])
const [pl1] = await sup('select * from public.game_players where user_id=$1', [P1])
assert.ok(pl1.score >= 870 && pl1.score <= 875, `wynik ${pl1.score}`)
ok(`uczeń nie podmieni sobie punktów; po odsłonięciu ma ${pl1.score} (= 1000 × bonus za szybkość)`)
assert.deepEqual(r1.reveal.correct, [1])
assert.deepEqual(r1.reveal.counts, [1, 1, 0, 0])
assert.equal(r1.reveal.answered, 2)
const mine = await p1('select * from public.game_answers')
assert.equal(mine.length, 1)
assert.equal(mine[0].correct, true)
ok('host_reveal: rozkład odpowiedzi, uczeń widzi swój wynik po odsłonięciu')

// pytanie 2 (multi)
await host(`select * from public.host_scoreboard($1)`, [GAME])
await host(`select * from public.host_next($1)`, [GAME])
await p1(`select public.submit_answer($1, $2)`, [GAME, [2, 0, 2, 9]]) // dedup + poza zakresem
await p2(`select public.submit_answer($1, $2)`, [GAME, [0]])          // tylko część poprawnych
await host(`select * from public.host_reveal($1)`, [GAME])
const ans2 = await sup('select p.nickname, a.correct, a.points from public.game_answers a join public.game_players p on p.id=a.player_id where question_index=1 order by p.nickname')
assert.equal(ans2[0].correct, true)  // Ala
assert.ok(ans2[0].points >= 2090 && ans2[0].points <= 2100, `punkty ${ans2[0].points}`)
assert.equal(ans2[1].correct, false) // Bartek
ok(`multi: tylko komplet poprawnych; bonus za serię (+100) → ${ans2[0].points} pkt`)

// pytanie 3 (prawda/fałsz, 0 pkt) + spóźnienie + wyrzucenie
await host(`select * from public.host_next($1)`, [GAME])
await p1(`select public.submit_answer($1, $2)`, [GAME, [0]])
await sup(`update public.games set question_started_at = clock_timestamp() - interval '30 seconds' where id=$1`, [GAME])
await rejects(p2(`select public.submit_answer($1, $2)`, [GAME, [0]]), 'too_late')
await host(`select * from public.host_reveal($1)`, [GAME])
const [a3] = await sup('select points, correct from public.game_answers where question_index=2')
assert.equal(a3.correct, true)
assert.equal(a3.points, 0)
const [s1] = await sup('select streak from public.game_players where user_id=$1', [P1])
assert.equal(s1.streak, 3)
ok('pytanie za 0 pkt nie daje bonusu; odpowiedź po czasie odrzucona')

const [{ id: P2_ID }] = await sup('select id from public.game_players where user_id=$1', [P2])
await rejects(p1(`select public.host_kick($1, $2)`, [GAME, P2_ID]), 'not_host')
await host(`select public.host_kick($1, $2)`, [GAME, P2_ID])
assert.equal((await p2('select * from public.games where id=$1', [GAME])).length, 0)
await rejects(p2(`select public.join_game($1, $2)`, [game.pin, 'Bartek2']), 'kicked')
ok('host_kick: wyrzucony uczeń traci dostęp i nie wróci')

const [end] = await host(`select * from public.host_next($1)`, [GAME])
assert.equal(end.status, 'ended')
assert.ok(end.ended_at)
await rejects(as(P2, `select public.join_game($1, $2)`, [game.pin, 'Nowy'], true), 'game_not_found')
const [{ play_count }] = await sup('select play_count from public.quizzes where id=$1', [QUIZ])
assert.equal(play_count, 1)
assert.equal((await host('select * from public.game_answers where game_id=$1', [GAME])).length, 5)
ok('koniec gry po ostatnim pytaniu; licznik zagrań; host widzi statystyki')

const [g2] = await host(`select * from public.create_game($1)`, [QUIZ])
await p1(`select public.join_game($1, $2)`, [g2.pin, 'Ala'])
await host(`select * from public.host_next($1)`, [g2.id])
await p1(`select public.submit_answer($1, $2)`, [g2.id, [1]])
await host(`select * from public.host_end($1)`, [g2.id])
const [pg2] = await sup('select score from public.game_players where game_id=$1', [g2.id])
assert.ok(pg2.score > 0, `wynik ${pg2.score}`)
ok('zakończenie gry w trakcie pytania i tak nalicza punkty')

const [{ t }] = await as(null, 'select public.server_time() t')
assert.ok(Math.abs(new Date(t).getTime() - Date.now()) < 5000)
ok('server_time dostępny dla niezalogowanych')

console.log(`\n${passed} grup testów OK`)
