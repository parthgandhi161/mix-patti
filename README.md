# Mix Patti

A randomizer + rulebook for Teen Patti variations. Mobile-first, no stakes.
Tap to mix, get a random twist, play. Rules are on demand, not on screen.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/mix-patti/
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

The dev URL includes `/mix-patti/` because `base` is set for GitHub Pages
(see below). That's expected.

## Deploying

`vite.config.js` sets `base: '/mix-patti/'` so built asset URLs resolve at
`https://parthgandhi161.github.io/mix-patti/`.

`.github/workflows/deploy.yml` builds and publishes on every push to `main`
or `master`. One-time setup: **repo Settings → Pages → Source → GitHub
Actions**.

## Layout

```
src/
  App.jsx                     state machine: home → mixing → result, plus
                              the rules / house-rules overlays and the
                              header
  data/variations.json        the 20 twists (schema untouched)
  lib/
    pick.js                   random pick, never the same twist twice in a
                              row
    summary.js                builds the Deal / Win / Twist result badges
    timing.js                 the mix timeline, mirrored in global.css
    sound.js                  desi percussion, synthesised with Web Audio
    useMuted.js               mute preference, remembered in localStorage
    immersive.js              fullscreen + wake lock on mobile, entered on
                              tap
  components/
    Home.jsx                  Stage 1 - idle, big hero wordmark + tap-to-mix
                              card
    Mixing.jsx                Stage 2 - shuffle → name spin → flip
    Result.jsx                Stage 3 - name + up to 3 summary badges
    RulesSheet.jsx            Stage 4 - per-variation rules, "Show rules"
    HouseRulesSheet.jsx       Stage 5 - the four house rules, ☰ button
    Card.jsx                  shared card back / card face
    Header.jsx                centred small wordmark + mute toggle, shown on
                              every stage except the sheets
    Brand.jsx                 the "made with ♥" footer credit
    FloatingSuits.jsx         drifting background suit glyphs
    MuteToggle.jsx            the mute button, laid out inside Header
  styles/
    global.css                colour + type tokens (Baloo Bhaijaan 2
                              wordmark, Baloo 2 everywhere else), reset, app
                              shell
    buttons.css               shared button shapes
```

## Not built yet

Nothing outstanding - all five stages are wired up and playable.
