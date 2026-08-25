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

## Visual checks with Playwright

Playwright is a `devDependency`, kept around for one-off visual
verification during development - screenshotting the mix animation
(shuffle → carousel → land), mobile layout, etc. in headless Chromium instead
of eyeballing `npm run dev` by hand. It's not a test suite (see "Not built
yet" below) and nothing here runs in CI.

One-time per machine, the browser binary itself isn't part of the repo:

```bash
npx playwright install chromium
```

Then, with `npm run dev` running, drive it from a throwaway script:

```js
import { chromium, devices } from 'playwright'

const browser = await chromium.launch()
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
await page.goto('http://localhost:5173/mix-patti/')
await page.click('text=Mix a twist')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'out.png' })
await browser.close()
```

`devices['iPhone 13']` matters more than it looks: it gives the touch /
`pointer: coarse` emulation this app's mobile-only features key off (see
`isTouchPrimary()` in `src/lib/immersive.js`), not just the viewport size.

## Layout

```
src/
  App.jsx                     state machine: home → mixing → result, plus
                              the rules / house-rules overlays and the
                              header
  data/variations.json        the 21 twists (schema untouched)
  lib/
    pick.js                   random pick, never the same twist twice in a
                              row
    summary.js                builds the Deal / Win / Twist result badges
    timing.js                 the mix timeline (single source of truth)
    sound.js                  desi percussion, synthesised with Web Audio;
                              owns the AudioContext lifecycle
    useMuted.js               mute preference, remembered in localStorage
    immersive.js              fullscreen + wake lock on mobile, entered on
                              tap
  components/
    Home.jsx                  Stage 1 - idle, big hero wordmark + tap-to-mix
                              card
    Mixing.jsx                Stage 2 - shuffle → carousel → land
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
                              shell, and the shared three-band stage layout
                              that keeps the card in one place
    buttons.css               shared button shapes
```

## Not built yet

Nothing outstanding - all five stages are wired up and playable.
