/**
 * Desi percussion for the mix, synthesised with the Web Audio API.
 *
 * Why synthesis instead of the mp3 files the spec mentions: it ships
 * zero audio assets, so there is nothing to host, preload or get
 * wrong on GitHub Pages. If you later want real recordings, keep the
 * exported functions (playShuffle / playSpin / playLand / stopAll)
 * and swap their bodies for <audio> or decoded buffers - no component
 * needs to change.
 *
 * Mobile browsers only allow audio that a user gesture started, which
 * is fine here: every sound is downstream of the user's tap.
 */

let ctx = null
let master = null
let noiseBuffer = null

// iOS backgrounds (and sometimes fully closes) the AudioContext when the
// tab/app is hidden, and doesn't reliably wake it back up on its own -
// without this, sound would need a full page refresh to come back after
// switching away and returning. Nudge it the moment the app is visible
// again; the next ensure() call still covers the "closed" case below.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  })
}

/** Lazily create the AudioContext. Must be called from a tap handler. */
function ensure() {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    noiseBuffer = makeNoise(ctx)
    master = null
  }
  // Browsers park the context in "suspended" until a gesture resumes it -
  // this can also happen again after the tab was backgrounded, so it's
  // checked on every cue, not just the first.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  if (!master) {
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  return ctx
}

function makeNoise(audio) {
  const buf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/**
 * Kill everything currently sounding. Used when the user taps to skip.
 * We fade the master bus out rather than stopping each node, then hand
 * out a fresh bus so the landing chime can still play.
 */
export function stopAll() {
  if (!ctx || !master) return
  const dying = master
  const t = ctx.currentTime
  dying.gain.cancelScheduledValues(t)
  dying.gain.setValueAtTime(dying.gain.value, t)
  dying.gain.linearRampToValueAtTime(0, t + 0.06)
  setTimeout(() => dying.disconnect(), 120)
  master = null
}

/* --- voices ----------------------------------------------------- */

/** Filtered noise burst - one card sliding past another. */
function riffle(at, { gain = 0.35, freq = 2600, len = 0.09 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.playbackRate.value = 1.4

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 0.9

  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)

  src.connect(bp).connect(g).connect(master)
  src.start(at)
  src.stop(at + len + 0.02)
}

/**
 * A drum hit. `low` gives the dhol/bayan boom (pitch drops as the
 * membrane relaxes), `high` gives the crisp tabla "na" rim slap.
 */
function drum(at, kind = 'high', gain = 0.5) {
  const low = kind === 'low'
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  const f0 = low ? 150 : 420
  const f1 = low ? 52 : 190
  osc.frequency.setValueAtTime(f0, at)
  osc.frequency.exponentialRampToValueAtTime(f1, at + (low ? 0.18 : 0.07))

  const len = low ? 0.42 : 0.16
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  osc.connect(g).connect(master)
  osc.start(at)
  osc.stop(at + len + 0.02)

  // Attack transient: the stick/finger contact before the tone.
  const click = ctx.createBufferSource()
  click.buffer = noiseBuffer
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = low ? 900 : 2200
  const cg = ctx.createGain()
  cg.gain.setValueAtTime(gain * (low ? 0.25 : 0.5), at)
  cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
  click.connect(hp).connect(cg).connect(master)
  click.start(at)
  click.stop(at + 0.07)
}

/** Bright struck-metal partials - the festive landing chime. */
function chime(at) {
  const partials = [1046.5, 1568, 2093, 3136]
  partials.forEach((f, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    const g = ctx.createGain()
    const peak = 0.34 / (i + 1.3)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5 - i * 0.22)
    osc.connect(g).connect(master)
    osc.start(at)
    osc.stop(at + 1.6)
  })
}

/** Ghungroo: a fistful of tiny bells shaken once. */
function ghungroo(at) {
  for (let i = 0; i < 14; i++) {
    const t = at + Math.random() * 0.22
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    src.playbackRate.value = 2
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 4200 + Math.random() * 3200
    bp.Q.value = 12
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.16, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    src.connect(bp).connect(g).connect(master)
    src.start(t)
    src.stop(t + 0.2)
  }
}

/* --- the three cues the mix uses --------------------------------- */

/** Phase 1: a riffle shuffle across `ms`. */
export function playShuffle(ms = 1000) {
  if (!ensure()) return
  const start = ctx.currentTime + 0.02
  const secs = ms / 1000
  const n = 26
  for (let i = 0; i < n; i++) {
    // Bunch the bursts toward the middle, like a real riffle.
    const p = i / n
    const at = start + p * secs * 0.9
    riffle(at, {
      gain: 0.16 + Math.random() * 0.14,
      freq: 1800 + Math.random() * 2200,
      len: 0.05 + Math.random() * 0.05,
    })
  }
  drum(start + secs * 0.92, 'low', 0.45) // the deck squaring off
}

/**
 * Phase 2: a tabla/dhol build that accelerates under the name spin,
 * mirroring the visual deceleration with rising tension.
 */
export function playSpin(ms = 2000) {
  if (!ensure()) return
  const start = ctx.currentTime + 0.02
  const secs = ms / 1000
  let t = 0
  let gap = 0.2
  let i = 0
  while (t < secs - 0.05) {
    const kind = i % 4 === 0 ? 'low' : 'high'
    drum(start + t, kind, 0.3 + 0.35 * (t / secs))
    t += gap
    gap = Math.max(0.075, gap * 0.87) // accelerando
    i++
  }
}

/** Phase 3: the reveal. */
export function playLand() {
  if (!ensure()) return
  const at = ctx.currentTime + 0.01
  drum(at, 'low', 0.6)
  chime(at + 0.02)
  ghungroo(at + 0.04)
}
