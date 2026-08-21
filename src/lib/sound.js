/**
 * Desi percussion for the mix, synthesised with the Web Audio API.
 *
 * Why synthesis instead of mp3 files: it ships zero audio assets, so
 * there is nothing to host, preload or get wrong on GitHub Pages. If you
 * later want real recordings, keep the exported functions and swap their
 * bodies for <audio> or decoded buffers - no component needs to change.
 *
 * ---------------------------------------------------------------------
 * LIFECYCLE, which is the hard part and the reason this file is shaped
 * the way it is:
 *
 * An AudioContext does not survive app-switching. iOS suspends it, parks
 * it in the non-standard "interrupted" state (phone call, Siri), or
 * closes it outright; Chrome freezes the tab; bfcache hands back a
 * context that *reports* "running" with a clock that never advances
 * again. Two previous attempts here tried to keep one context alive
 * across all that and failed, because they trusted `ctx.state`.
 *
 * So this version does not try to survive backgrounding at all:
 *
 *   - Liveness is MEASURED, never inspected. `.state` lies; a clock that
 *     stopped moving does not. See sampleClock().
 *   - The context is torn down on hide and rebuilt from scratch at the
 *     next gesture. A context constructed inside a user gesture starts
 *     running on iOS - that is the whole guarantee this rests on.
 *   - Cues are synchronous fire-and-forget. A cue fired at an unhealthy
 *     context is dropped and a repair queued. Never make these `async`
 *     again: every sound here punctuates a specific animation frame, so
 *     a late cue does not sound late, it sounds wrong.
 *   - Mute is a gain node on the output, not `if (!muted)` at the call
 *     sites - that silences already-scheduled audio and removes a whole
 *     class of stale-closure bug.
 */

/* --- module state -------------------------------------------------- */

let ctx = null // the one AudioContext
let bus = null // voices -> bus (skip fade lives here)
let out = null // bus -> out (mute) -> destination
let noise = null // one second of white noise, shared by every voice

const live = new Set() // every source node currently sounding

let healthy = false // cached verdict from sampleClock()
let muted = false
let busReadyAt = 0 // audio-clock time the bus is back at full gain
let beat = { wall: 0, clock: 0 } // last liveness sample
let heartbeat = 0
let lastRebuildAt = 0
let repairQueued = false

const BUS_GAIN = 0.9
const SKIP_FADE = 0.04 // seconds, the tap-to-skip cut
const MUTE_RAMP = 0.025 // seconds; a step would click
const HEARTBEAT_MS = 500
const STALL_MS = 250 // min wall gap before a verdict means anything
const REBUILD_MIN_MS = 300 // a pointerdown storm must not spawn contexts

/* --- liveness ------------------------------------------------------ */

/**
 * The only reliable health check: did the audio clock actually move?
 *
 * `ctx.state` cannot be trusted - iOS parks contexts in the non-standard
 * "interrupted" state, and a bfcache-restored context reports "running"
 * with a frozen clock. Comparing currentTime against wall time catches
 * both, and needs no platform sniffing.
 *
 * A verdict needs two samples a real interval apart, and a tap handler
 * has no interval to spend - which is why this runs on a heartbeat and
 * caches into `healthy`, rather than being computed on demand.
 */
function sampleClock() {
  if (!ctx || ctx.state !== 'running') {
    healthy = false
    return
  }
  const wall = performance.now()
  const clock = ctx.currentTime
  const gap = wall - beat.wall
  if (gap < STALL_MS) return // too soon to conclude anything
  // The audio clock should track wall time ~1:1. Requiring only half
  // tolerates a late heartbeat and scheduler jitter, while still
  // catching a clock that has stopped dead (which advances by 0).
  healthy = clock - beat.clock > (gap / 1000) * 0.5
  beat = { wall, clock }
}

/** One consistent snapshot, so a voice can never straddle two contexts. */
function graph() {
  if (!healthy || !ctx || !bus || !noise || ctx.state !== 'running') return null
  return { ctx, bus, noise }
}

/* --- build / teardown ---------------------------------------------- */

function makeNoise(audio) {
  const buf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function build() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return
  try {
    ctx = new AudioCtx()
  } catch {
    ctx = null
    return
  }
  ctx.onstatechange = onStateChange
  noise = makeNoise(ctx)
  bus = ctx.createGain()
  bus.gain.value = BUS_GAIN
  out = ctx.createGain()
  out.gain.value = muted ? 0.0001 : 1
  bus.connect(out).connect(ctx.destination)

  beat = { wall: performance.now(), clock: ctx.currentTime }
  busReadyAt = 0
  // Trusted optimistically with no prior sample: a context constructed
  // inside a user gesture starts running on iOS, and that is exactly the
  // platform guarantee primeAudio() exists to exploit. The first
  // heartbeat 500ms from now either confirms this or falsifies it.
  healthy = true
  if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {})

  clearInterval(heartbeat)
  heartbeat = setInterval(sampleClock, HEARTBEAT_MS)
}

function teardown() {
  clearInterval(heartbeat)
  heartbeat = 0
  stopLive(0)
  const dying = ctx
  ctx = null
  bus = null
  out = null
  noise = null
  healthy = false
  busReadyAt = 0
  beat = { wall: 0, clock: 0 }
  if (!dying) return
  dying.onstatechange = null
  // Close before anything can construct a replacement. Browsers cap
  // concurrent AudioContexts (~6 in Chrome) and a leaked one is only
  // reclaimable by a full page reload - which is the one failure mode
  // that would brick audio for the rest of the session. close() flips
  // the control-thread state synchronously, so the slot is free by the
  // time build() runs; the promise is just the async resource release.
  try {
    const p = dying.close()
    if (p?.catch) p.catch(() => {})
  } catch {
    /* already closed */
  }
}

/** Always teardown-then-build, so two live contexts are impossible. */
function rebuild(force = false) {
  const now = performance.now()
  if (!force && now - lastRebuildAt < REBUILD_MIN_MS) return
  lastRebuildAt = now
  teardown()
  build()
}

/**
 * Off-gesture repair. Desktop Chrome and Android honour a fresh context
 * outside a gesture, so this usually works there; iOS usually refuses,
 * and onPointerDown is the guaranteed path. Deferred so a failing cue
 * never pays construction cost on its own frame, and so N failing cues
 * collapse into one attempt.
 */
function scheduleRepair() {
  healthy = false
  if (repairQueued || document.visibilityState === 'hidden') return
  repairQueued = true
  setTimeout(() => {
    repairQueued = false
    rebuild()
  }, 0)
}

/**
 * Kick off context creation as early as possible in a tap handler. Call
 * this synchronously from the click handler that starts a mix, before
 * any React state updates - iOS only reliably honours a new/resumed
 * context inside the original gesture's call stack.
 */
export function primeAudio() {
  if (graph()) {
    sampleClock()
    return
  }
  rebuild(true) // a real gesture, not a storm - never rate-limit it
}

/* --- playback ------------------------------------------------------ */

function track(node) {
  live.add(node)
  node.onended = () => {
    live.delete(node)
    try {
      node.disconnect()
    } catch {
      /* already gone */
    }
  }
}

/**
 * The one health gate every cue goes through. No awaits, ever - see the
 * lifecycle note at the top of this file.
 */
function cue(fn) {
  sampleClock()
  const g = graph()
  if (!g) {
    scheduleRepair()
    return
  }
  try {
    fn(g, Math.max(g.ctx.currentTime, busReadyAt) + 0.01)
  } catch {
    scheduleRepair()
  }
}

/**
 * Genuinely silence everything sounding, for tap-to-skip.
 *
 * Every voice is stop()ed and the bus re-arms on the AUDIO clock, not on
 * a setTimeout: a frozen or throttled clock then defers the whole
 * sequence in order, instead of stranding the bus at zero forever (which
 * is what the old wall-clock version did after backgrounding).
 */
function stopLive(fade = SKIP_FADE) {
  if (!ctx) {
    live.clear()
    return
  }
  const t = ctx.currentTime
  const at = t + fade
  if (bus) {
    bus.gain.cancelScheduledValues(t)
    bus.gain.setValueAtTime(bus.gain.value, t)
    if (fade > 0) bus.gain.linearRampToValueAtTime(0.0001, at)
    else bus.gain.setValueAtTime(0.0001, t)
    bus.gain.setValueAtTime(BUS_GAIN, at + 0.002)
  }
  // Cues scheduled after this must wait for the bus to re-arm, or they
  // get swallowed by the fade - playLand() right after stopAll() on skip
  // is exactly that case.
  busReadyAt = at + 0.004
  live.forEach((n) => {
    try {
      // stop(t) where t <= start means the node produces no output at
      // all, so playShuffle's ~1s of pre-scheduled bursts is cancellable.
      n.stop(at)
    } catch {
      /* already stopped */
    }
  })
  live.clear()
}

export function stopAll() {
  stopLive()
}

/**
 * Mute is an output-stage gain, not a set of call-site `if (!muted)`
 * guards. Two reasons: it silences audio that is *already scheduled*
 * (playShuffle commits ~1s of bursts up front), and it removes the
 * stale-closure class of bug entirely - callers no longer need to thread
 * a `muted` value into animation callbacks that outlive their render.
 */
export function setMuted(next) {
  muted = !!next
  if (!ctx || !out) return
  const t = ctx.currentTime
  out.gain.cancelScheduledValues(t)
  out.gain.setValueAtTime(out.gain.value, t)
  out.gain.linearRampToValueAtTime(muted ? 0.0001 : 1, t + MUTE_RAMP)
}

/* --- lifecycle listeners ------------------------------------------- */

function onStateChange() {
  if (!ctx) return
  if (ctx.state === 'running') {
    beat = { wall: performance.now(), clock: ctx.currentTime }
  } else {
    // Covers iOS's non-standard "interrupted" as well as "suspended".
    healthy = false
  }
}

function onVisibility() {
  // Don't try to survive backgrounding - tear down and rebuild later.
  if (document.visibilityState === 'hidden') teardown()
  else scheduleRepair()
}

function onPageHide() {
  teardown()
}

function onPageShow(e) {
  // A bfcache restore hands back a zombie context: reports running,
  // clock never advances again.
  if (e.persisted) teardown()
  scheduleRepair()
}

function onPointerDown() {
  // The iOS guarantee. Capture phase so this lands before React's click
  // handlers, i.e. before startMix() -> primeAudio().
  if (!graph()) rebuild()
}

let installed = false

function install() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onPointerDown, {
    capture: true,
    passive: true,
  })
  // Page Lifecycle API's odd corner: freeze/resume are on document.
  document.addEventListener('freeze', onPageHide)
  document.addEventListener('resume', scheduleRepair)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
}

function uninstall() {
  if (!installed) return
  installed = false
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  document.removeEventListener('freeze', onPageHide)
  document.removeEventListener('resume', scheduleRepair)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('pageshow', onPageShow)
}

install()

// Vite re-evaluates this module on every hot update, which would
// otherwise stack a second full set of listeners (and leak a context)
// on every save. Tree-shaken out of the production build.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    uninstall()
    teardown()
  })
}

/* --- voices --------------------------------------------------------
   Each takes the graph snapshot explicitly rather than reading module
   globals, so a voice can never build nodes on one context and connect
   them to a bus belonging to another. */

/** Filtered noise burst - one card sliding past another. */
function riffle(g, at, { gain = 0.35, freq = 2600, len = 0.09 } = {}) {
  const src = g.ctx.createBufferSource()
  src.buffer = g.noise
  src.playbackRate.value = 1.4

  const bp = g.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 0.9

  const gn = g.ctx.createGain()
  gn.gain.setValueAtTime(0, at)
  gn.gain.linearRampToValueAtTime(gain, at + 0.008)
  gn.gain.exponentialRampToValueAtTime(0.0001, at + len)

  src.connect(bp).connect(gn).connect(g.bus)
  src.start(at)
  src.stop(at + len + 0.02)
  track(src)
}

/**
 * A drum hit. `low` gives the dhol/bayan boom (pitch drops as the
 * membrane relaxes), `high` gives the crisp tabla "na" rim slap.
 */
function drum(g, at, kind = 'high', gain = 0.5) {
  const low = kind === 'low'
  const osc = g.ctx.createOscillator()
  osc.type = 'sine'
  const f0 = low ? 150 : 420
  const f1 = low ? 52 : 190
  osc.frequency.setValueAtTime(f0, at)
  osc.frequency.exponentialRampToValueAtTime(f1, at + (low ? 0.18 : 0.07))

  const len = low ? 0.42 : 0.16
  const gn = g.ctx.createGain()
  gn.gain.setValueAtTime(0, at)
  gn.gain.linearRampToValueAtTime(gain, at + 0.004)
  gn.gain.exponentialRampToValueAtTime(0.0001, at + len)
  osc.connect(gn).connect(g.bus)
  osc.start(at)
  osc.stop(at + len + 0.02)
  track(osc)

  // Attack transient: the stick/finger contact before the tone.
  const click = g.ctx.createBufferSource()
  click.buffer = g.noise
  const hp = g.ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = low ? 900 : 2200
  const cg = g.ctx.createGain()
  cg.gain.setValueAtTime(gain * (low ? 0.25 : 0.5), at)
  cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
  click.connect(hp).connect(cg).connect(g.bus)
  click.start(at)
  click.stop(at + 0.07)
  track(click)
}

/** Bright struck-metal partials - the festive landing chime. */
function chime(g, at) {
  const partials = [1046.5, 1568, 2093, 3136]
  partials.forEach((f, i) => {
    const osc = g.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    const gn = g.ctx.createGain()
    const peak = 0.34 / (i + 1.3)
    gn.gain.setValueAtTime(0, at)
    gn.gain.linearRampToValueAtTime(peak, at + 0.01)
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 1.5 - i * 0.22)
    osc.connect(gn).connect(g.bus)
    osc.start(at)
    osc.stop(at + 1.6)
    track(osc)
  })
}

/** Ghungroo: a fistful of tiny bells shaken once. */
function ghungroo(g, at) {
  for (let i = 0; i < 14; i++) {
    const t = at + Math.random() * 0.22
    const src = g.ctx.createBufferSource()
    src.buffer = g.noise
    src.playbackRate.value = 2
    const bp = g.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 4200 + Math.random() * 3200
    bp.Q.value = 12
    const gn = g.ctx.createGain()
    gn.gain.setValueAtTime(0.16, t)
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    src.connect(bp).connect(gn).connect(g.bus)
    src.start(t)
    src.stop(t + 0.2)
    track(src)
  }
}

/* --- the three cues the mix uses ---------------------------------- */

/** Phase 1: a riffle shuffle across `ms`. */
export function playShuffle(ms = 1000) {
  cue((g, t0) => {
    const start = t0 + 0.01
    const secs = ms / 1000
    const n = 26
    for (let i = 0; i < n; i++) {
      // Bunch the bursts toward the middle, like a real riffle.
      const p = i / n
      riffle(g, start + p * secs * 0.9, {
        gain: 0.16 + Math.random() * 0.14,
        freq: 1800 + Math.random() * 2200,
        len: 0.05 + Math.random() * 0.05,
      })
    }
    drum(g, start + secs * 0.92, 'low', 0.45) // the deck squaring off
  })
}

/** Phase 2: one card passing through the reveal carousel. */
export function playFlip() {
  cue((g, t0) => {
    riffle(g, t0, {
      gain: 0.24,
      freq: 2500 + Math.random() * 700,
      len: 0.07,
    })
  })
}

/** Phase 3: the reveal. */
export function playLand() {
  cue((g, t0) => {
    drum(g, t0, 'low', 0.6)
    chime(g, t0 + 0.02)
    ghungroo(g, t0 + 0.04)
  })
}
