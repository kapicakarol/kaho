import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Brak kluczy => tryb demo (src/lib/api/localApi.js)
export const isConfigured = Boolean(url && key)

// Klient twórcy / hosta (konto e-mail)
export const supabase = isConfigured
  ? createClient(url, key, { auth: { storageKey: 'kaho-host' } })
  : null

// Osobna, anonimowa sesja ucznia — nauczyciel może testować obie role
// w jednej przeglądarce bez wylogowywania się.
let playerClient = null
export function getPlayerClient() {
  if (!isConfigured) return null
  if (!playerClient) {
    playerClient = createClient(url, key, { auth: { storageKey: 'kaho-player' } })
  }
  return playerClient
}
