// Ustawienia: profil, domyślna punktacja, dźwięk, konto
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Save, LogOut, Play, Square } from 'lucide-react'
import { api, isDemo } from '../lib/api'
import { useAuth } from '../lib/auth'
import { DEFAULT_SETTINGS, pointsRange } from '../lib/scoring'
import { sound } from '../lib/sound'
import { usePageTitle } from '../components/AppLayout'
import { Field, Toggle, Segmented, ErrorBox, Modal, useSoundPrefs, useToast } from '../components/ui'

export default function Settings() {
  usePageTitle('Ustawienia')
  const nav = useNavigate()
  const { user, signOut } = useAuth()
  const prefs = useSoundPrefs()
  const [username, setUsername] = useState(user.username || '')
  const [defaults, setDefaults] = useState(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [wipe, setWipe] = useState(false)
  const [toast, showToast] = useToast()

  useEffect(() => {
    api.getProfile().then((p) => {
      if (p?.username) setUsername(p.username)
      if (p?.default_settings) setDefaults((d) => ({ ...d, ...p.default_settings }))
    }).catch(() => {})
  }, [])
  useEffect(() => () => sound.stop(), [])

  const set = (k) => (v) => setDefaults((d) => ({ ...d, [k]: v }))
  const range = pointsRange(1000, defaults)

  async function save() {
    setSaving(true); setError(null)
    try {
      await api.updateProfile({ username: username.trim() || user.username, default_settings: defaults })
      showToast('Zapisano ustawienia')
    } catch (e) { setError(e) } finally { setSaving(false) }
  }

  function playPreview(track) {
    sound.unlock()
    if (preview === track) { sound.stop(); setPreview(null); return }
    if (!prefs.music) sound.setMusic(true)
    sound.stop(); sound.play(track); setPreview(track)
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Ustawienia</span>
          <h1 className="h2" style={{ marginTop: 12 }}>Po twojemu.</h1>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}><Save /> {saving ? 'Zapisuję…' : 'Zapisz'}</button>
      </div>

      <div className="stack lg">
        <section className="card stack">
          <h2 className="h3">Profil</h2>
          <Field label="Nazwa (widoczna przy publicznych quizach)">
            <input className="input" value={username} maxLength={30} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="E-mail"><input className="input" value={user.email} readOnly /></Field>
        </section>

        <section className="card stack">
          <h2 className="h3">Domyślna punktacja gry</h2>
          <p className="small muted" style={{ margin: 0 }}>Wczytywana przy każdym uruchomieniu gry — możesz ją zmienić przed startem.</p>
          <Field label="Mnożnik punktów">
            <Segmented value={defaults.pointsMultiplier} onChange={set('pointsMultiplier')}
              options={[{ value: 0.5, label: '×0,5' }, { value: 1, label: '×1' }, { value: 2, label: '×2' }]} />
          </Field>
          <Toggle checked={defaults.speedBonus} onChange={set('speedBonus')} label="Bonus za szybkość" />
          <Field label="Bonus za serię">
            <Segmented value={defaults.streakBonus} onChange={set('streakBonus')}
              options={[0, 50, 100, 200].map((v) => ({ value: v, label: v ? `+${v}` : 'brak' }))} />
          </Field>
          <Field label="Maksymalna seria">
            <Segmented value={defaults.maxStreak} onChange={set('maxStreak')}
              options={[3, 5, 10].map((v) => ({ value: v, label: String(v) }))} />
          </Field>
          <Toggle checked={defaults.showScoreboard} onChange={set('showScoreboard')} label="Tablica wyników po każdym pytaniu" />
          <div className="info-box">Pytanie standardowe: {range.low}–{range.top} pkt za poprawną odpowiedź.</div>
        </section>

        <section className="card stack">
          <h2 className="h3">Dźwięk</h2>
          <Toggle checked={prefs.music} onChange={(v) => { sound.setMusic(v); if (!v) setPreview(null) }} label="Muzyka na ekranie prowadzącego" />
          <Toggle checked={prefs.sfx} onChange={(v) => sound.setSfx(v)} label="Efekty dźwiękowe" />
          <Field label={`Głośność: ${Math.round(prefs.volume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={(e) => sound.setVolume(Number(e.target.value))} />
          </Field>
          <div className="row wrap">
            {[['lobby', 'Poczekalnia'], ['question', 'Pytanie'], ['results', 'Finał']].map(([t, l]) => (
              <button key={t} className={`btn btn-sm ${preview === t ? 'btn-accent' : ''}`} onClick={() => playPreview(t)}>
                {preview === t ? <Square /> : <Play />} {l}
              </button>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => { sound.unlock(); sound.sfx('correct') }}>Efekt: dobrze</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { sound.unlock(); sound.sfx('podium') }}>Efekt: podium</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Soundtrack jest generowany na żywo. Własne utwory: <span className="mono">public/music/lobby.mp3</span>, <span className="mono">question.mp3</span>, <span className="mono">results.mp3</span>.
          </p>
        </section>

        <section className="card stack">
          <h2 className="h3">Połączenie</h2>
          {isDemo ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                <b style={{ color: 'var(--warn)' }}>Tryb demo.</b> Dane są w tej przeglądarce. Aby grać na telefonach, uzupełnij
                <span className="mono"> VITE_SUPABASE_URL</span> i <span className="mono">VITE_SUPABASE_ANON_KEY</span> w <span className="mono">.env.local</span> (instrukcja: <span className="mono">supabase/README.md</span>).
              </p>
              <button className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setWipe(true)}>Wyczyść dane demo</button>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Połączono z Supabase: <span className="mono">{new URL(import.meta.env.VITE_SUPABASE_URL).host}</span></p>
          )}
        </section>

        <ErrorBox error={error} />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={async () => { await signOut(); nav('/') }}>
          <LogOut /> Wyloguj się
        </button>
      </div>

      {wipe && (
        <Modal title="Wyczyścić dane demo?" subtitle="Usunie konta, quizy i gry zapisane w tej przeglądarce. Nie da się tego cofnąć." onClose={() => setWipe(false)}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setWipe(false)}>Anuluj</button>
            <button className="btn btn-danger" onClick={() => {
              Object.keys(localStorage).filter((k) => k.startsWith('kaho.demo')).forEach((k) => localStorage.removeItem(k))
              window.location.href = '/'
            }}>Wyczyść</button>
          </div>
        </Modal>
      )}
      {toast}
    </div>
  )
}
