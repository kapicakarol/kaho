# kaho.

Quizy na żywo w stylu Kahoot. Nauczyciel tworzy quiz i prowadzi grę na projektorze,
uczniowie dołączają telefonem kodem PIN — **bez zakładania konta**.

- **Frontend:** React 19 + Vite, statyczny build → Cloudflare Pages
- **Backend:** Supabase — Postgres + RLS, funkcje RPC (logika gry i punktacja), Realtime (telefon ↔ nauczyciel), Auth
- **Tryb demo:** bez kluczy Supabase aplikacja działa lokalnie (localStorage + BroadcastChannel) — całą grę da się przeklikać w kilku kartach

## Funkcje

| Wymaganie | Gdzie |
|---|---|
| Quiz ABC, Prawda/Fałsz, wielokrotny wybór | `src/pages/Editor.jsx`, typ `question_type` w SQL |
| Biblioteka quizów + wyszukiwarka | `src/pages/Library.jsx`, RPC `search_quizzes` |
| Kreator | `src/pages/Editor.jsx` (walidacja, ⌘S, obrazki, 2–6 odpowiedzi) |
| Połączenie na telefonach | `src/pages/Join.jsx`, `Play.jsx`, kod QR w poczekalni, Supabase Realtime |
| Uczniowie bez logowania, logowanie tylko dla twórców/hostów | anonimowa sesja Supabase dla ucznia, e-mail+hasło dla nauczyciela |
| Statystyki gry | `src/pages/Stats.jsx`, `GameReport.jsx` (eksport CSV) |
| Custom punktacja | mnożnik, bonus za szybkość, bonus za serię — `StartGameModal.jsx`, SQL `submit_answer` |
| Soundtrack | `src/lib/sound.js` — generowany na żywo (Web Audio), własne pliki w `public/music/` |

## Uruchomienie

```bash
npm install
npm run dev          # http://localhost:5173 (tryb demo, jeśli brak .env.local)
npm run dev:lan      # dostęp z telefonów w tej samej sieci Wi-Fi
npm run test:sql     # testy schematu i logiki gry na prawdziwym Postgresie (PGlite)
npm run build        # statyczny build do dist/
```

## Supabase

Instrukcja krok po kroku: [`supabase/README.md`](supabase/README.md). W skrócie:
1. Utwórz projekt, uruchom `supabase/migrations/0001_init.sql` w SQL Editor.
2. Włącz **Anonymous sign-ins** (Authentication → Sign In / Providers).
3. Skopiuj `.env.example` → `.env.local` i wpisz URL + anon key.

## Deploy: Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Zmienne środowiskowe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Wersja Node: z pliku `.node-version` (22)
- `public/_redirects` obsługuje routing SPA

Klucz `anon` jest publiczny z założenia — bezpieczeństwo zapewnia RLS. W Supabase ustaw
**Site URL** (Authentication → URL Configuration) na adres strony z Pages.

## Bezpieczeństwo gry

- Poprawne odpowiedzi są w tabeli `game_secrets`, której uczniowie nie mogą czytać.
- Punkty liczy wyłącznie serwer (`submit_answer`), a do wyniku trafiają dopiero przy odsłonięciu
  pytania — w trakcie pytania nic nie zdradza, czy odpowiedź była dobra.
- Uczeń nie może zmienić swoich punktów, odpowiedzieć dwa razy ani po czasie (+1,5 s tolerancji).
- Prowadzący może usunąć gracza (np. za nick) — nie wróci do tej gry.
- Wszystko powyżej sprawdza `npm run test:sql`.

## Mapa ról zespołu → kod

| Rola | Pliki |
|---|---|
| Kreator quizów (React) | `src/pages/Editor.jsx`, `src/lib/quiz.js` |
| Ustawienia, AUTH (React) | `src/pages/Settings.jsx`, `Login.jsx`, `src/lib/auth.jsx` |
| UI web (React, CSS) / UI/UX | `src/styles.css`, `src/components/` |
| Logika gry, dołączanie (React) | `src/pages/Host.jsx`, `Join.jsx`, `Play.jsx`, `src/lib/hooks.js` |
| Przeglądarka, Dashboard (React) | `src/pages/Library.jsx`, `Dashboard.jsx`, `QuizView.jsx` |
| UI mobile | ekran ucznia jest mobile-first + PWA (`public/manifest.webmanifest`) |
| Logika gry (backend) | `supabase/migrations/0001_init.sql` — `create_game`, `host_*`, `submit_answer` |
| Kreator + strony (backend) | `save_quiz`, polityki RLS dla `quizzes` / `questions` |
| Ustawienia, AUTH (backend) | Supabase Auth + `profiles` + trigger `handle_new_user` |
| Przeglądarka (backend) | `search_quizzes` |
| Websocket telefon–nauczyciel | Supabase Realtime (`src/lib/api/supabaseApi.js` → `subscribe`) |

## Struktura

```
src/
  lib/api/        supabaseApi.js (produkcja) · localApi.js (demo) · index.js (wybór)
  lib/            auth, hooks (gra na żywo, timer), scoring, sound, errors, quiz
  components/     ui, AppLayout, QuizCard, StartGameModal, Shapes
  pages/          Landing, Login, Join, Play, Host, Dashboard, Library, QuizView, Editor, Stats, GameReport, Settings
supabase/         migracje SQL + instrukcja
scripts/          test-sql.mjs (testy), push.mjs (push z tokenem)
```

Lokalne dane logowania trzymamy w `.secrets/` (w `.gitignore`, blokowane też w serwerze dev) — nigdy w repozytorium.
