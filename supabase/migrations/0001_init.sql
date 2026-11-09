-- =====================================================================
-- Kaho — schemat bazy (Supabase / Postgres 15+)
-- Zastępuje backend Spring + serwis websocket:
--   * Postgres + RLS      -> dane i uprawnienia
--   * funkcje RPC          -> logika gry i punktacja (po stronie serwera)
--   * Supabase Realtime    -> połączenie telefon <-> nauczyciel
-- Idempotentny: można uruchomić ponownie.
-- =====================================================================

-- ---------- typy ----------
do $$ begin
  create type public.question_type as enum ('single', 'multi', 'truefalse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_status as enum ('lobby', 'question', 'reveal', 'scoreboard', 'ended');
exception when duplicate_object then null; end $$;

-- ---------- helpers ----------
-- true dla zalogowanego twórcy/hosta (nie dla anonimowego ucznia)
create or replace function public.is_real_user() returns boolean
language sql stable set search_path = public as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- ---------- profile (twórcy / hości) ----------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text,
  default_settings jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new; -- uczniowie nie dostają profilu
  end if;
  insert into public.profiles (id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- quizy ----------
create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Nowy quiz' check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  cover       text not null default '🎯',
  tags        text[] not null default '{}',
  is_public   boolean not null default false,
  play_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists quizzes_owner_idx  on public.quizzes (owner, updated_at desc);
create index if not exists quizzes_public_idx on public.quizzes (play_count desc) where is_public;

create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  position   int not null default 0,
  type       public.question_type not null default 'single',
  text       text not null default '' check (char_length(text) <= 300),
  image_url  text not null default '',
  time_limit int not null default 20 check (time_limit between 5 and 240),
  points     int not null default 1000 check (points between 0 and 5000),
  answers    jsonb not null default '[]'::jsonb  -- [{ "text": "...", "correct": true }]
);
create index if not exists questions_quiz_idx on public.questions (quiz_id, position);

-- ---------- gry na żywo ----------
create table if not exists public.games (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid references public.quizzes (id) on delete set null,
  host                uuid not null references auth.users (id) on delete cascade,
  pin                 text not null,
  status              public.game_status not null default 'lobby',
  quiz_title          text not null default '',
  question_count      int not null default 0,
  current_question    int not null default -1,
  current             jsonb,   -- publiczna treść aktywnego pytania (BEZ poprawnych odpowiedzi)
  reveal              jsonb,   -- { correct: [..], counts: [..], answered: n } po odsłonięciu
  settings            jsonb not null default '{}'::jsonb,
  question_started_at timestamptz,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);
create unique index if not exists games_active_pin_idx on public.games (pin) where status <> 'ended';
create index if not exists games_host_idx on public.games (host, created_at desc);

-- poprawne odpowiedzi — czyta je tylko host i funkcje serwera, nigdy uczniowie
create table if not exists public.game_secrets (
  game_id   uuid primary key references public.games (id) on delete cascade,
  questions jsonb not null
);

create table if not exists public.game_players (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  nickname      text not null check (char_length(nickname) between 1 and 20),
  score         int not null default 0,
  streak        int not null default 0,
  correct_count int not null default 0,
  kicked        boolean not null default false,
  joined_at     timestamptz not null default now(),
  unique (game_id, user_id)
);
create unique index if not exists game_players_nick_idx on public.game_players (game_id, lower(nickname));

create table if not exists public.game_answers (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games (id) on delete cascade,
  player_id      uuid not null references public.game_players (id) on delete cascade,
  question_index int not null,
  answer         int[] not null default '{}',
  correct        boolean not null default false,
  time_ms        int not null default 0,
  points         int not null default 0,
  created_at     timestamptz not null default now(),
  unique (game_id, player_id, question_index)
);
create index if not exists game_answers_game_idx on public.game_answers (game_id, question_index);

-- ---------- helpers dla RLS (security definer = bez rekurencji polityk) ----------
create or replace function public.is_game_host(p_game uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.games g where g.id = p_game and g.host = auth.uid())
$$;

create or replace function public.is_game_player(p_game uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_players p
                 where p.game_id = p_game and p.user_id = auth.uid() and not p.kicked)
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.quizzes      enable row level security;
alter table public.questions    enable row level security;
alter table public.games        enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_players enable row level security;
alter table public.game_answers enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- quizzes: właściciel wszystko; publiczne widzi każdy
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes for select using (is_public or owner = auth.uid());
drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes for insert
  with check (owner = auth.uid() and public.is_real_user());
drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes for update
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes for delete using (owner = auth.uid());

-- questions: pytania publicznych quizów widzą tylko zalogowani twórcy
-- (anonimowy uczeń w trakcie gry nie podejrzy odpowiedzi przez API)
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select using (
  exists (select 1 from public.quizzes q
          where q.id = quiz_id and (q.owner = auth.uid() or (q.is_public and public.is_real_user())))
);
drop policy if exists questions_write on public.questions;
create policy questions_write on public.questions for all
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner = auth.uid()));

-- games / players / answers: tylko odczyt; zapis wyłącznie przez funkcje RPC niżej
drop policy if exists games_select on public.games;
create policy games_select on public.games for select
  using (host = auth.uid() or public.is_game_player(id));

drop policy if exists game_secrets_select on public.game_secrets;
create policy game_secrets_select on public.game_secrets for select
  using (public.is_game_host(game_id));

drop policy if exists game_players_select on public.game_players;
create policy game_players_select on public.game_players for select
  using (public.is_game_host(game_id) or public.is_game_player(game_id));

-- uczeń widzi swoją odpowiedź dopiero po odsłonięciu pytania
drop policy if exists game_answers_select on public.game_answers;
create policy game_answers_select on public.game_answers for select using (
  public.is_game_host(game_id)
  or exists (
    select 1 from public.game_players p
    join public.games g on g.id = p.game_id
    where p.id = player_id and p.user_id = auth.uid()
      and (g.status <> 'question' or g.current_question <> question_index)
  )
);

-- =====================================================================
-- RPC: quizy
-- =====================================================================

-- zapis całego quizu (meta + pytania) w jednej transakcji, z RLS
create or replace function public.save_quiz(p_quiz uuid, p_meta jsonb, p_questions jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.quizzes set
    title       = coalesce(nullif(trim(p_meta ->> 'title'), ''), title),
    description = coalesce(p_meta ->> 'description', description),
    cover       = coalesce(nullif(p_meta ->> 'cover', ''), cover),
    tags        = coalesce((select array_agg(distinct lower(trim(t)))
                            from jsonb_array_elements_text(coalesce(p_meta -> 'tags', '[]'::jsonb)) t
                            where trim(t) <> ''), '{}'),
    is_public   = coalesce((p_meta ->> 'is_public')::boolean, is_public),
    updated_at  = now()
  where id = p_quiz and owner = auth.uid();
  if not found then raise exception 'quiz_not_found'; end if;

  delete from public.questions where quiz_id = p_quiz;
  insert into public.questions (quiz_id, position, type, text, image_url, time_limit, points, answers)
  select p_quiz, (ord - 1)::int,
         coalesce(e ->> 'type', 'single')::public.question_type,
         coalesce(e ->> 'text', ''),
         coalesce(e ->> 'image_url', ''),
         coalesce((e ->> 'time_limit')::int, 20),
         coalesce((e ->> 'points')::int, 1000),
         coalesce(e -> 'answers', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality as t(e, ord);
end $$;

-- wyszukiwarka publicznych quizów (parametry wiązane — brak wstrzykiwania filtrów)
create or replace function public.search_quizzes(p_query text default '', p_tag text default '')
returns setof public.quizzes language sql stable security invoker set search_path = public as $$
  select * from public.quizzes q
  where q.is_public
    and (coalesce(p_query, '') = ''
         or q.title ilike '%' || p_query || '%'
         or q.description ilike '%' || p_query || '%'
         or exists (select 1 from unnest(q.tags) t where t ilike '%' || p_query || '%'))
    and (coalesce(p_tag, '') = '' or lower(p_tag) = any (q.tags))
  order by q.play_count desc, q.updated_at desc
  limit 60
$$;

-- =====================================================================
-- RPC: gra
-- =====================================================================

create or replace function public.create_game(p_quiz uuid, p_settings jsonb default '{}'::jsonb)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_quiz      public.quizzes;
  v_questions jsonb;
  v_count     int;
  v_pin       text;
  v_game      public.games;
begin
  if not public.is_real_user() then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found or not (v_quiz.owner = auth.uid() or v_quiz.is_public) then
    raise exception 'quiz_not_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', q.type, 'text', q.text, 'image_url', q.image_url,
           'time_limit', q.time_limit, 'points', q.points, 'answers', q.answers
         ) order by q.position), '[]'::jsonb),
         count(*)
    into v_questions, v_count
  from public.questions q where q.quiz_id = p_quiz;

  if v_count = 0 then raise exception 'quiz_empty'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_questions) e
    where coalesce(trim(e ->> 'text'), '') = ''
       or jsonb_array_length(e -> 'answers') < 2
       or not exists (select 1 from jsonb_array_elements(e -> 'answers') a where (a ->> 'correct')::boolean)
       or exists (select 1 from jsonb_array_elements(e -> 'answers') a where coalesce(trim(a ->> 'text'), '') = '')
  ) then
    raise exception 'quiz_invalid';
  end if;

  loop
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.games where pin = v_pin and status <> 'ended');
  end loop;

  insert into public.games (quiz_id, host, pin, quiz_title, question_count, settings)
  values (
    p_quiz, auth.uid(), v_pin, v_quiz.title, v_count,
    jsonb_build_object('speedBonus', true, 'streakBonus', 100, 'maxStreak', 5, 'pointsMultiplier', 1)
      || coalesce(p_settings, '{}'::jsonb)
  )
  returning * into v_game;

  insert into public.game_secrets (game_id, questions) values (v_game.id, v_questions);
  update public.quizzes set play_count = play_count + 1 where id = p_quiz;
  return v_game;
end $$;

create or replace function public.join_game(p_pin text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_game   public.games;
  v_player public.game_players;
  v_nick   text := trim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '42501'; end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 20 then raise exception 'nickname_invalid'; end if;

  select * into v_game from public.games where pin = trim(p_pin) and status <> 'ended';
  if not found then raise exception 'game_not_found'; end if;

  select * into v_player from public.game_players where game_id = v_game.id and user_id = auth.uid();
  if found then
    if v_player.kicked then raise exception 'kicked'; end if;
    return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id, 'nickname', v_player.nickname);
  end if;

  begin
    insert into public.game_players (game_id, user_id, nickname)
    values (v_game.id, auth.uid(), v_nick)
    returning * into v_player;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;

  return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id, 'nickname', v_player.nickname);
end $$;

-- następne pytanie (z poczekalni, odsłonięcia lub tablicy wyników)
create or replace function public.host_next(p_game uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_game public.games;
  v_q    jsonb;
  v_idx  int;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.host <> auth.uid() then raise exception 'not_host' using errcode = '42501'; end if;
  if v_game.status = 'ended' then return v_game; end if;
  if v_game.status = 'question' then raise exception 'reveal_first'; end if;

  v_idx := v_game.current_question + 1;
  if v_idx >= v_game.question_count then
    update public.games set status = 'ended', ended_at = now(), current = null
    where id = p_game returning * into v_game;
    return v_game;
  end if;

  select questions -> v_idx into v_q from public.game_secrets where game_id = p_game;

  update public.games set
    status = 'question',
    current_question = v_idx,
    current = jsonb_build_object(
      'index', v_idx,
      'type', v_q ->> 'type',
      'text', v_q ->> 'text',
      'image_url', v_q ->> 'image_url',
      'time_limit', (v_q ->> 'time_limit')::int,
      'points', (v_q ->> 'points')::int,
      'answers', (select coalesce(jsonb_agg(a ->> 'text' order by ord), '[]'::jsonb)
                  from jsonb_array_elements(v_q -> 'answers') with ordinality as t(a, ord))
    ),
    reveal = null,
    question_started_at = clock_timestamp()
  where id = p_game
  returning * into v_game;
  return v_game;
end $$;

create or replace function public.submit_answer(p_game uuid, p_answer int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_game      public.games;
  v_player    public.game_players;
  v_q         jsonb;
  v_n         int;
  v_given     int[];
  v_correct   int[];
  v_ok        boolean;
  v_limit_ms  int;
  v_elapsed   int;
  v_base      numeric;
  v_points    int := 0;
  v_s         jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = '42501'; end if;

  select * into v_game from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  if v_game.status <> 'question' then raise exception 'not_accepting'; end if;

  select * into v_player from public.game_players
  where game_id = p_game and user_id = auth.uid() for update;
  if not found or v_player.kicked then raise exception 'not_in_game' using errcode = '42501'; end if;

  if exists (select 1 from public.game_answers
             where player_id = v_player.id and question_index = v_game.current_question) then
    raise exception 'already_answered';
  end if;

  select questions -> v_game.current_question into v_q from public.game_secrets where game_id = p_game;
  v_n        := jsonb_array_length(v_q -> 'answers');
  v_limit_ms := (v_q ->> 'time_limit')::int * 1000;
  v_elapsed  := greatest(0, (extract(epoch from (clock_timestamp() - v_game.question_started_at)) * 1000)::int);
  if v_elapsed > v_limit_ms + 1500 then raise exception 'too_late'; end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_given
  from unnest(coalesce(p_answer, '{}')) x where x >= 0 and x < v_n;
  if cardinality(v_given) = 0 then raise exception 'empty_answer'; end if;

  select coalesce(array_agg((ord - 1)::int order by ord), '{}') into v_correct
  from jsonb_array_elements(v_q -> 'answers') with ordinality as t(a, ord)
  where (a ->> 'correct')::boolean;

  if (v_q ->> 'type') = 'multi' then
    v_ok := v_given = v_correct;                                   -- wszystkie poprawne, żadnej złej
  else
    v_ok := cardinality(v_given) = 1 and v_given[1] = any (v_correct);
  end if;

  -- ===== punktacja (custom): baza * mnożnik, bonus za szybkość, bonus za serię =====
  v_s := v_game.settings;
  if v_ok then
    v_base := (v_q ->> 'points')::numeric
              * least(greatest(coalesce((v_s ->> 'pointsMultiplier')::numeric, 1), 0), 3);
    if coalesce((v_s ->> 'speedBonus')::boolean, true) and v_limit_ms > 0 then
      v_base := v_base * (1 - least(1, v_elapsed::numeric / v_limit_ms) / 2);
    end if;
    if v_base > 0 then
      v_base := v_base
        + least(v_player.streak, greatest(coalesce((v_s ->> 'maxStreak')::int, 5), 0))
        * greatest(coalesce((v_s ->> 'streakBonus')::int, 0), 0);
    end if;
    v_points := round(v_base)::int;
  end if;

  insert into public.game_answers (game_id, player_id, question_index, answer, correct, time_ms, points)
  values (p_game, v_player.id, v_game.current_question, v_given, v_ok, v_elapsed, v_points);

  -- wynik (i punkty w game_players) pojawiają się dopiero przy odsłonięciu,
  -- więc w trakcie pytania nic nie zdradza, czy odpowiedź była dobra
  return jsonb_build_object('received', true);
end $$;

-- nalicza punkty/serie za pytanie (wywoływane tylko przez host_reveal / host_end)
create or replace function public.apply_question_scores(p_game uuid, p_index int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.game_players p set
    score         = p.score + a.points,
    streak        = case when a.correct then p.streak + 1 else 0 end,
    correct_count = p.correct_count + case when a.correct then 1 else 0 end
  from public.game_answers a
  where a.player_id = p.id and a.game_id = p_game and a.question_index = p_index;

  -- brak odpowiedzi = koniec serii
  update public.game_players p set streak = 0
  where p.game_id = p_game
    and not exists (select 1 from public.game_answers ga
                    where ga.player_id = p.id and ga.question_index = p_index);
end $$;

create or replace function public.host_reveal(p_game uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_game     public.games;
  v_q        jsonb;
  v_n        int;
  v_correct  jsonb;
  v_counts   jsonb;
  v_answered int;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.host <> auth.uid() then raise exception 'not_host' using errcode = '42501'; end if;
  if v_game.status <> 'question' then return v_game; end if;

  select questions -> v_game.current_question into v_q from public.game_secrets where game_id = p_game;
  v_n := jsonb_array_length(v_q -> 'answers');

  select coalesce(jsonb_agg(ord - 1 order by ord), '[]'::jsonb) into v_correct
  from jsonb_array_elements(v_q -> 'answers') with ordinality as t(a, ord)
  where (a ->> 'correct')::boolean;

  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) into v_counts
  from (
    select i, (select count(*) from public.game_answers ga
               where ga.game_id = p_game and ga.question_index = v_game.current_question
                 and i = any (ga.answer)) as c
    from generate_series(0, v_n - 1) as i
  ) s;

  select count(*) into v_answered from public.game_answers
  where game_id = p_game and question_index = v_game.current_question;

  perform public.apply_question_scores(p_game, v_game.current_question);

  update public.games set
    status = 'reveal',
    reveal = jsonb_build_object('index', v_game.current_question, 'correct', v_correct,
                                'counts', v_counts, 'answered', v_answered)
  where id = p_game
  returning * into v_game;
  return v_game;
end $$;

create or replace function public.host_scoreboard(p_game uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare v_game public.games;
begin
  update public.games set status = 'scoreboard'
  where id = p_game and host = auth.uid() and status = 'reveal'
  returning * into v_game;
  if not found then
    select * into v_game from public.games where id = p_game and host = auth.uid();
    if not found then raise exception 'not_host' using errcode = '42501'; end if;
  end if;
  return v_game;
end $$;

create or replace function public.host_end(p_game uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare v_game public.games;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.host <> auth.uid() then raise exception 'not_host' using errcode = '42501'; end if;
  if v_game.status = 'question' then
    perform public.apply_question_scores(p_game, v_game.current_question);
  end if;
  update public.games set status = 'ended', ended_at = coalesce(ended_at, now()), current = null
  where id = p_game
  returning * into v_game;
  return v_game;
end $$;

create or replace function public.host_kick(p_game uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_game_host(p_game) then raise exception 'not_host' using errcode = '42501'; end if;
  update public.game_players set kicked = true where id = p_player and game_id = p_game;
end $$;

-- czas serwera — klienci liczą przesunięcie zegara, żeby timer był wspólny
create or replace function public.server_time() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

-- =====================================================================
-- uprawnienia + realtime
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on public.quizzes, public.profiles to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
-- funkcja wewnętrzna — nie da się jej wywołać przez API
revoke execute on function public.apply_question_scores(uuid, int) from public, anon, authenticated;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['games', 'game_players', 'game_answers'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
