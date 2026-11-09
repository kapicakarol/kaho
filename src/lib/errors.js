// Kody błędów z funkcji SQL / API -> komunikaty po polsku.
export const MESSAGES = {
  auth_required: 'Zaloguj się, aby kontynuować.',
  invalid_credentials: 'Nieprawidłowy e-mail lub hasło.',
  user_exists: 'Konto z tym adresem e-mail już istnieje.',
  email_not_confirmed: 'Potwierdź adres e-mail — sprawdź skrzynkę.',
  weak_password: 'Hasło musi mieć co najmniej 6 znaków.',
  invalid_email: 'Podaj poprawny adres e-mail.',
  anonymous_disabled:
    'Dołączanie bez konta jest wyłączone w Supabase (Authentication → Sign In / Providers → Anonymous).',
  quiz_not_found: 'Nie znaleziono quizu.',
  quiz_empty: 'Quiz nie ma jeszcze pytań.',
  quiz_invalid: 'Każde pytanie musi mieć treść, co najmniej 2 wypełnione odpowiedzi i jedną poprawną.',
  nickname_invalid: 'Nick musi mieć od 1 do 20 znaków.',
  nickname_taken: 'Ten nick jest już zajęty — wybierz inny.',
  game_not_found: 'Nie ma gry o tym PIN-ie (albo już się zakończyła).',
  kicked: 'Prowadzący usunął cię z tej gry.',
  not_accepting: 'Teraz nie można odpowiadać.',
  too_late: 'Za późno — czas minął.',
  already_answered: 'Odpowiedź już wysłana.',
  not_in_game: 'Nie jesteś w tej grze.',
  not_host: 'Tylko prowadzący może to zrobić.',
  reveal_first: 'Najpierw pokaż odpowiedzi.',
  empty_answer: 'Wybierz odpowiedź.',
  network: 'Brak połączenia z serwerem. Sprawdź internet.',
}

const CODES = Object.keys(MESSAGES)

function fromSupabaseText(raw) {
  if (/Invalid login credentials/i.test(raw)) return 'invalid_credentials'
  if (/already registered|already been registered/i.test(raw)) return 'user_exists'
  if (/Email not confirmed/i.test(raw)) return 'email_not_confirmed'
  if (/Password should be/i.test(raw)) return 'weak_password'
  if (/Anonymous sign-ins are disabled/i.test(raw)) return 'anonymous_disabled'
  if (/invalid.*email|email.*invalid/i.test(raw)) return 'invalid_email'
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return 'network'
  return null
}

export function toAppError(err) {
  if (err?.isAppError) return err
  const raw = err?.message || err?.code || String(err)
  const code =
    (err?.code && MESSAGES[err.code] && err.code) ||
    CODES.find((c) => raw.includes(c)) ||
    fromSupabaseText(raw) ||
    'unknown'
  const e = new Error(MESSAGES[code] || raw)
  e.code = code
  e.raw = raw
  e.isAppError = true
  return e
}
