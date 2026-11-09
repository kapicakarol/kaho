import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { X, Volume2, VolumeX, Music } from 'lucide-react'
import { sound } from '../lib/sound'
import { isDemo } from '../lib/api'

export function Logo({ size }) {
  return (
    <span className="logo" style={size ? { fontSize: size } : undefined}>
      <span className="logo-mark">k.</span>
      kaho.
    </span>
  )
}

export function Spinner() { return <div className="spinner" role="status" aria-label="Ładowanie" /> }
export function Splash() { return <div className="splash"><Spinner /></div> }

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: .5 } : undefined}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  )
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <div>
            <h2 className="h3">{title}</h2>
            {subtitle && <p className="small muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          {onClose && <button className="icon-btn sm" onClick={onClose} aria-label="Zamknij"><X /></button>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="error-box" role="alert">{error.message || String(error)}</div>
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="h3">{title}</div>
      {children && <div className="small" style={{ maxWidth: 420, margin: '0 auto' }}>{children}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

export function DemoBanner() {
  if (!isDemo) return null
  return (
    <div className="demo-banner">
      <b>Tryb demo</b>
      <span>— dane tylko w tej przeglądarce. Graj w kilku kartach; telefony zadziałają po podłączeniu Supabase.</span>
    </div>
  )
}

export function useSoundPrefs() {
  return useSyncExternalStore(
    useCallback((cb) => sound.subscribe(cb), []),
    () => sound.prefs,
  )
}

export function SoundButtons({ music = true }) {
  const prefs = useSoundPrefs()
  return (
    <div className="row" style={{ gap: 6 }}>
      {music && (
        <button className="icon-btn" title={prefs.music ? 'Wyłącz muzykę' : 'Włącz muzykę'}
          aria-pressed={prefs.music} onClick={() => sound.setMusic(!prefs.music)}
          style={prefs.music ? { color: 'var(--accent)' } : undefined}>
          <Music />
        </button>
      )}
      <button className="icon-btn" title={prefs.sfx ? 'Wycisz efekty' : 'Włącz efekty'}
        aria-pressed={prefs.sfx} onClick={() => sound.setSfx(!prefs.sfx)}>
        {prefs.sfx ? <Volume2 /> : <VolumeX />}
      </button>
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState(null)
  const t = useRef()
  const show = useCallback((m) => {
    setMsg(m)
    clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(t.current), [])
  const node = msg ? <div className="toast" role="status">{msg}</div> : null
  return [node, show]
}

// Polska odmiana: pl(1,'gra','gry','gier') -> "1 gra", pl(3,…) -> "3 gry", pl(5,…) -> "5 gier"
export function pl(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  const w = n === 1 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${w}`
}

export function initials(name = '') {
  return (name.trim()[0] || 'k') + '.'
}
