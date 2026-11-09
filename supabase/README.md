# Supabase — konfiguracja

Kaho używa Supabase jako całego backendu (zastępuje Spring + osobny serwis websocket).

## 1. Projekt
https://supabase.com → **New project**. Zapisz hasło do bazy w bezpiecznym miejscu.

## 2. Schemat
**SQL Editor** → wklej i uruchom `migrations/0001_init.sql`.
Skrypt jest idempotentny — można go uruchomić ponownie po zmianach.

Tworzy: tabele (`profiles`, `quizzes`, `questions`, `games`, `game_secrets`, `game_players`,
`game_answers`), polityki RLS, funkcje RPC gry i punktacji, publikację Realtime.

## 3. Logowanie
- **Authentication → Sign In / Providers → Email** — włączone (nauczyciele).
- **Authentication → Sign In / Providers → Anonymous sign-ins** — **włącz** (uczniowie dołączają bez konta).
- Do testów można wyłączyć „Confirm email”. Na produkcji zostaw włączone i ustaw
  **URL Configuration → Site URL** na adres z Cloudflare Pages.
- Zalecane: włącz CAPTCHA dla logowania anonimowego (Authentication → Attack Protection),
  żeby nikt nie tworzył masowo anonimowych kont.

## 4. Klucze
**Project Settings → API** → skopiuj do `.env.local` (lokalnie) i do zmiennych środowiskowych Cloudflare Pages:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Używaj tylko klucza **anon** (publiczny). Klucza `service_role` nigdy nie wpisuj do frontendu.

## 5. Sprawdzenie
`npm run test:sql` uruchamia ten sam schemat na lokalnym Postgresie (PGlite) z zaślepką Auth
i rozgrywa testową grę: dołączanie, odpowiedzi, punktacja, próby oszustwa, wyrzucanie gracza.

## Sprzątanie (opcjonalnie)
Stare gry można usuwać okresowo, np. (Database → Cron):

```sql
delete from public.games where created_at < now() - interval '90 days';
```
