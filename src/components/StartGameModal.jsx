import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import { api } from '../lib/api'
import { DEFAULT_SETTINGS, pointsRange } from '../lib/scoring'
import { sound } from '../lib/sound'
import { Modal, Field, Segmented, Toggle, ErrorBox } from './ui'

// Ustawienia gry = custom punktacja
export default function StartGameModal({ quiz, onClose }) {
  const nav = useNavigate()
  const [s, setS] = useState(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getProfile()
      .then((p) => p?.default_settings && setS((cur) => ({ ...cur, ...p.default_settings })))
      .catch(() => {})
  }, [])

  const set = (k) => (v) => setS((cur) => ({ ...cur, [k]: v }))
  const range = pointsRange(1000, s)

  async function start() {
    sound.unlock()
    setBusy(true); setError(null)
    try {
      const game = await api.createGame(quiz.id, s)
      nav(`/host/${game.id}`)
    } catch (e) {
      setError(e); setBusy(false)
    }
  }

  return (
    <Modal title="Uruchom grę" subtitle={`${quiz.cover || '🎯'} ${quiz.title}`} onClose={onClose}>
      <div className="stack lg">
        <Field label="Mnożnik punktów">
          <Segmented value={s.pointsMultiplier} onChange={set('pointsMultiplier')}
            options={[{ value: 0.5, label: '×0,5' }, { value: 1, label: '×1' }, { value: 2, label: '×2' }]} />
        </Field>
        <Toggle checked={s.speedBonus} onChange={set('speedBonus')} label="Bonus za szybkość (wolna odpowiedź = do −50%)" />
        <Field label="Bonus za serię poprawnych (za każdą z rzędu)">
          <Segmented value={s.streakBonus} onChange={set('streakBonus')}
            options={[0, 50, 100, 200].map((v) => ({ value: v, label: v ? `+${v}` : 'brak' }))} />
        </Field>
        {s.streakBonus > 0 && (
          <Field label="Maksymalna seria liczona do bonusu">
            <Segmented value={s.maxStreak} onChange={set('maxStreak')}
              options={[3, 5, 10].map((v) => ({ value: v, label: String(v) }))} />
          </Field>
        )}
        <Toggle checked={s.showScoreboard} onChange={set('showScoreboard')} label="Tablica wyników po każdym pytaniu" />
        <div className="info-box">
          Pytanie standardowe (1000): <b style={{ color: 'var(--text)' }}>{range.low}–{range.top} pkt</b> za poprawną odpowiedź.
          Punkty liczy serwer — uczniowie nie mogą ich zmienić.
        </div>
        <ErrorBox error={error} />
        <button className="btn btn-primary btn-lg btn-block" onClick={start} disabled={busy}>
          <Play /> {busy ? 'Tworzę grę…' : 'Utwórz poczekalnię'}
        </button>
      </div>
    </Modal>
  )
}
