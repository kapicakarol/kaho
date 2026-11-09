// Soundtrack Kaho — w całości generowany (Web Audio), bez cudzych nagrań.
// Klimat: lo-fi synth groove (lobby), napięty arp (pytanie), euforyczny finał.
// Własne pliki: public/music/{lobby,question,results}.mp3 mają pierwszeństwo.

const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

const TRACKS = {
  lobby: {
    bpm: 96, swing: 0.14, root: 50, scale: DORIAN, prog: [0, 5, 3, 4],
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...xx',
    bass: 'x..x..x...x..x..', arp: [0, 2, 4, 6, 4, 2, 1, 3], arpEvery: 2, pad: 0.05,
  },
  question: {
    bpm: 132, swing: 0, root: 45, scale: MINOR, prog: [0, 0, 5, 6],
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
    bass: 'x.xxx.xxx.xxx.xx', arp: [0, 4, 7, 4, 2, 4, 7, 9], arpEvery: 1, pad: 0.035,
  },
  results: {
    bpm: 118, swing: 0.06, root: 48, scale: MAJOR, prog: [0, 4, 5, 3],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: 'x..x..x.x..x..x.', arp: [0, 2, 4, 7, 4, 2, 4, 9], arpEvery: 2, pad: 0.06,
  },
}

const PREFS_KEY = 'kaho.sound'
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12)

class Sound {
  constructor() {
    let p = {}
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch { /* domyślne */ }
    this.prefs = { music: true, sfx: true, volume: 0.8, ...p }
    this.ctx = null
    this.track = null
    this.timer = null
    this.step = 0
    this.nextTime = 0
    this.fileEl = null
    this.fileCache = {}
    this.listeners = new Set()
  }

  // ---------- stan / ustawienia ----------
  subscribe(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb) }
  _save() {
    this.prefs = { ...this.prefs } // nowa referencja => React odświeży przełączniki
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs))
    this.listeners.forEach((cb) => cb(this.prefs))
  }
  setMusic(on) {
    this.prefs.music = on; this._save()
    if (!on) this._stopAll()
    else if (this.track) { const t = this.track; this.track = null; this.play(t) }
  }
  setSfx(on) { this.prefs.sfx = on; this._save() }
  setVolume(v) {
    this.prefs.volume = v; this._save()
    if (this.master) this.master.gain.value = v
    if (this.fileEl) this.fileEl.volume = v * 0.6
  }

  _init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return true
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    const c = (this.ctx = new AC())
    this.master = c.createGain(); this.master.gain.value = this.prefs.volume
    this.master.connect(c.destination)
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4
    comp.connect(this.master)
    this.music = c.createGain(); this.music.gain.value = 0.55; this.music.connect(comp)
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.7; this.sfxBus.connect(this.master)
    // echo dla arpeggio (kosmiczny vibe)
    this.delay = c.createDelay(1); this.delayFb = c.createGain(); this.delayOut = c.createGain()
    this.delayFb.gain.value = 0.32; this.delayOut.gain.value = 0.35
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay)
    this.delay.connect(this.delayOut); this.delayOut.connect(this.music)
    // bufor szumu (perkusja)
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return true
  }

  // wywołaj w handlerze kliknięcia — przeglądarki blokują autoplay
  unlock() { this._init() }

  // ---------- muzyka ----------
  async play(name) {
    if (this.track === name) return
    this.track = name
    if (!this.prefs.music || !this._init()) return
    this._stopAll()
    const file = await this._findFile(name)
    if (this.track !== name) return
    if (file) return this._playFile(file)
    const t = TRACKS[name]
    this.delay.delayTime.value = (60 / t.bpm) * 0.75
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.08
    this.music.gain.cancelScheduledValues(this.ctx.currentTime)
    this.music.gain.setValueAtTime(0.0001, this.ctx.currentTime)
    this.music.gain.exponentialRampToValueAtTime(0.55, this.ctx.currentTime + 0.6)
    this.timer = setInterval(() => this._schedule(t), 25)
  }

  stop() { this.track = null; this._stopAll() }

  _stopAll() {
    clearInterval(this.timer); this.timer = null
    if (this.fileEl) { this.fileEl.pause(); this.fileEl = null }
  }

  async _findFile(name) {
    if (name in this.fileCache) return this.fileCache[name]
    const url = `/music/${name}.mp3`
    let ok = false
    try {
      const r = await fetch(url, { method: 'HEAD' })
      // SPA zwraca index.html na brakujące pliki — sprawdzamy typ
      ok = r.ok && (r.headers.get('content-type') || '').startsWith('audio/')
    } catch { ok = false }
    return (this.fileCache[name] = ok ? url : null)
  }

  _playFile(url) {
    const el = new Audio(url)
    el.loop = true
    el.volume = this.prefs.volume * 0.6
    el.play().catch(() => {})
    this.fileEl = el
  }

  _schedule(t) {
    const stepDur = 60 / t.bpm / 4
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const s = this.step % 16
      const bar = Math.floor(this.step / 16) % t.prog.length
      const time = this.nextTime + (s % 2 ? t.swing * stepDur : 0)
      const chord = t.prog[bar]
      if (s === 0 && t.pad) this._pad(t, chord, time, stepDur * 16)
      if (t.kick[s] === 'x') this._kick(time)
      if (t.snare[s] === 'x') this._snare(time)
      if (t.hat[s] === 'x') this._hat(time, s % 4 === 2 ? 0.09 : 0.05)
      if (t.bass[s] === 'x') this._bass(this._note(t, chord) - 12, time, stepDur * 1.7)
      if (s % t.arpEvery === 0) {
        const deg = chord + t.arp[(s / t.arpEvery) % t.arp.length]
        this._arp(this._note(t, deg) + 12, time, stepDur * t.arpEvery * 0.9)
      }
      this.nextTime += stepDur
      this.step++
    }
  }

  _note(t, deg) {
    const n = t.scale.length
    return t.root + t.scale[((deg % n) + n) % n] + 12 * Math.floor(deg / n)
  }

  _env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
  }

  _bass(m, t, dur) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.value = midiHz(m)
    f.type = 'lowpass'; f.Q.value = 6
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + dur)
    this._env(g, t, 0.22, 0.008, dur)
    o.connect(f).connect(g).connect(this.music)
    o.start(t); o.stop(t + dur + 0.05)
  }

  _arp(m, t, dur) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
    o.type = 'square'; o.frequency.value = midiHz(m)
    f.type = 'lowpass'; f.frequency.value = 2600
    this._env(g, t, 0.06, 0.005, dur)
    o.connect(f).connect(g)
    g.connect(this.music); g.connect(this.delay)
    o.start(t); o.stop(t + dur + 0.05)
  }

  _pad(t, chord, time, dur) {
    const c = this.ctx
    ;[0, 2, 4].forEach((k) => {
      ;[-7, 7].forEach((cents) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
        o.type = 'sawtooth'; o.frequency.value = midiHz(this._note(t, chord + k)); o.detune.value = cents
        f.type = 'lowpass'; f.frequency.value = 1100
        g.gain.setValueAtTime(0.0001, time)
        g.gain.exponentialRampToValueAtTime(t.pad, time + 0.4)
        g.gain.setValueAtTime(t.pad, time + dur - 0.3)
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
        o.connect(f).connect(g).connect(this.music)
        o.start(time); o.stop(time + dur + 0.05)
      })
    })
  }

  _kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    this._env(g, t, 0.75, 0.003, 0.22)
    o.connect(g).connect(this.music)
    o.start(t); o.stop(t + 0.3)
  }

  _noiseHit(t, type, freq, peak, dur, dest = this.music) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noise
    f.type = type; f.frequency.value = freq
    this._env(g, t, peak, 0.002, dur)
    s.connect(f).connect(g).connect(dest)
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05)
  }

  _snare(t) { this._noiseHit(t, 'bandpass', 1900, 0.28, 0.14) }
  _hat(t, v) { this._noiseHit(t, 'highpass', 8000, v, 0.035) }

  // ---------- efekty ----------
  _tone(freq, at, dur, { type = 'square', vol = 0.18, slide } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, at)
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur)
    this._env(g, at, vol, 0.005, dur)
    o.connect(g).connect(this.sfxBus)
    o.start(at); o.stop(at + dur + 0.05)
  }

  sfx(name) {
    if (!this.prefs.sfx || !this._init()) return
    const n = this.ctx.currentTime + 0.01
    const seq = (notes, step, opts) => notes.forEach((m, i) => this._tone(midiHz(m), n + i * step, step * 1.6, opts))
    switch (name) {
      case 'join': seq([76, 83], 0.06, { type: 'triangle', vol: 0.2 }); break
      case 'select': this._tone(700, n, 0.05, { type: 'triangle', vol: 0.14 }); break
      case 'submit': this._tone(400, n, 0.18, { type: 'sine', vol: 0.2, slide: 1200 }); break
      case 'tick': this._tone(1500, n, 0.03, { vol: 0.08 }); break
      case 'start': this._tone(220, n, 0.5, { type: 'sawtooth', vol: 0.12, slide: 880 }); break
      case 'correct': seq([72, 76, 79, 84], 0.07, { vol: 0.16 }); break
      case 'wrong': seq([62, 57], 0.14, { type: 'sawtooth', vol: 0.14 }); break
      case 'reveal': seq([67, 71, 74], 0.05, { type: 'triangle', vol: 0.2 }); break
      case 'timeup':
        this._tone(110, n, 1.4, { type: 'sine', vol: 0.4 })
        this._tone(220.5, n, 1.0, { type: 'sine', vol: 0.15 })
        this._noiseHit(n, 'lowpass', 900, 0.2, 0.5, this.sfxBus)
        break
      case 'podium':
        seq([60, 64, 67, 72], 0.11, { vol: 0.14 })
        seq([65, 69, 72, 77], 0.11, { type: 'triangle', vol: 0.12 })
        setTimeout(() => this.prefs.sfx && seq([72, 76, 79, 84, 88], 0.09, { vol: 0.16 }), 520)
        break
      default: break
    }
  }
}

export const sound = new Sound()

if (typeof window !== 'undefined') {
  const unlock = () => sound.unlock()
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}
