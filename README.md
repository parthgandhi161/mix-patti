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

## Testing

Two suites, both committed (nothing to write from scratch per change):

```bash
npm test              # vitest - unit tests for src/lib's pure logic
npm run test:e2e      # playwright - real-browser assertions against the
                       # actual running app (see e2e/)
npm run test:all      # lint + both suites, one command - run this before
                       # every commit
```

`test:e2e` manages its own dev server (`playwright.config.js`'s
`webServer`) - it starts `npm run dev` if nothing is already listening on
5173 and reuses it otherwise, so a plain `npm run test:e2e` (or
`test:all`) works standalone with nothing else running first. It emulates
`devices['iPhone 13']` for the same reason `scripts/shot.mjs` does (see
below) and asks for `prefers-reduced-motion` in most specs, since
`src/components/Mixing.jsx`/`Result.jsx` already skip their theatrical
animations for that preference - real code, not a test-only shortcut - so
the suite runs in ~30s instead of minutes of shuffle animation.

One-time per machine, same as "Visual checks with Playwright" below (both
share the one browser binary, kept at the same version in `package.json`):

```bash
npx playwright install chromium
```

`npm test` and `npm run lint` gate every deploy in CI
(`.github/workflows/deploy.yml`); `test:e2e` does not (see "Visual checks
with Playwright" below for why Playwright as a whole stays out of CI) -
run `test:all` locally before pushing instead.

**Whenever you add a new feature or user-visible behavior, add a test for
it in the same change**: a unit test in `src/lib/*.test.js` for new pure
logic, an e2e spec in `e2e/*.spec.js` for new UI/flows, or both - then run
`npm run test:all` before committing. See CLAUDE.md's Architecture section
for the project's existing testing conventions (what gets a unit test vs.
what's better covered by e2e).

## Deploying

`vite.config.js` sets `base: '/mix-patti/'` so built asset URLs resolve at
`https://parthgandhi161.github.io/mix-patti/`.

`.github/workflows/deploy.yml` builds and publishes on every push to `main`
or `master`. One-time setup: **repo Settings → Pages → Source → GitHub
Actions**.

## Releasing

The version in `package.json` is shown live on the site, under the "made
with ♥" footer credit (`src/components/Brand.jsx` imports it straight from
`package.json`). To cut a release:

```bash
npm version patch   # or minor / major
git push --follow-tags
```

`npm version` bumps `package.json`, commits, and tags in one step. Pushing
the tag triggers `.github/workflows/release.yml`, which publishes a GitHub
Release with auto-generated notes - no separate release step to run by
hand.

## Visual checks with Playwright

Playwright backs two different things in this repo - don't confuse them:
`e2e/` (see "Testing" above) is a real pass/fail assertion suite; this
section's `scripts/shot.mjs` (plus `scripts/offline-check.mjs` for the
offline case) is a separate, smaller committed harness with no
assertions - not wired into CI either (only `npm run lint`, `npm test`
and `npm run build` gate the deploy, see CLAUDE.md) - for
screenshotting the mix animation (shuffle → carousel → land), mobile
layout, etc. in headless Chromium instead of eyeballing `npm run dev` by
hand.

One-time per machine, the browser binary itself isn't part of the repo:

```bash
npx playwright install chromium
```

Then, with `npm run dev` running in another terminal:

```bash
npm run shot            # screenshots + boundingBox() measurements at
                         # iPhone 13 and iPhone SE -> scripts/output/
                         # (gitignored); compare against scripts/baseline.json
npm run shot:offline    # builds + serves the production build, then
                         # checks the full mix flow still works with the
                         # network off (real service worker + Cache
                         # Storage - see scripts/offline-check.mjs)
```

`devices['iPhone 13']` (and `devices['iPhone SE']`) matter more than they
look: they give the touch / `pointer: coarse` emulation this app's
mobile-only features key off (see `isTouchPrimary()` in
`src/lib/immersive.js`), not just the viewport size.

## Layout

```
public/
  fonts/                       self-hosted Baloo Bhaijaan 2 / Baloo 2
                                woff2s, latin + latin-ext subsets only
src/
  main.jsx                    React entry point, mounts <App /> into #root
  App.jsx                     state machine: home → mixing → result, plus
                              the rules / house-rules / browse / players
                              overlays and the header
  data/variations.json        the 30 twists (schema untouched)
  lib/
    pick.js                   random pick, never the same twist twice in a
                              row - now also starring (drawn more often)
                              and muting (never drawn) layered on top; see
                              the file's own JSDoc for the three-bag
                              design and the MIN_UNMUTED floor
    storage.js                shared localStorage get/set (raw string +
                              JSON), used by pick.js, useMuted.js and
                              useVariationPrefs.js
    summary.js                builds the Deal / Win / Twist result badges
    timing.js                 the mix timeline (single source of truth)
    sound.js                  desi percussion, synthesised with Web Audio;
                              owns the AudioContext lifecycle
    useMuted.js                mute preference, remembered in localStorage
    useReadingMode.js          RulesSheet's dense/explain toggle,
                              remembered in localStorage
    usePlayers.js              optional player roster + rotating dealer,
                              remembered in localStorage
    useVariationPrefs.js       starred/muted twist ids, remembered in
                              localStorage under two separate keys
    immersive.js               fullscreen + wake lock on mobile, entered on
                              tap
  components/                 one component + one same-named .css file per
                              piece of UI, except RulesSheet.jsx,
                              HouseRulesSheet.jsx, BrowseSheet.jsx, and
                              PlayersSheet.jsx, which share Sheet.css
    Home.jsx / Home.css       Stage 1 - idle, big hero wordmark + tap-to-mix
                              card
    Mixing.jsx / Mixing.css   Stage 2 - shuffle → carousel → land
    Result.jsx / Result.css   Stage 3 - name + up to 3 summary badges; once
                              a player roster exists, also uses band 1 for
                              the dealer line; star/mute toggles for the
                              shown twist float beside the card's right
                              edge, vertically centred, not a new band
    RulesSheet.jsx            Stage 4 - per-variation rules, "Show rules";
                              toggle in the sheet head switches between the
                              dense list and a one-step-at-a-time "explain"
                              mode for reading rules aloud at the table
    HouseRulesSheet.jsx       Stage 5 - the four house rules, ☰ button
    BrowseSheet.jsx           Stage 6 - searchable list of every twist, 📖
                              button; picking a row opens RulesSheet on
                              top; each row also has star/mute toggles,
                              plus an All/Starred/Muted filter above the
                              list
    PlayersSheet.jsx          Stage 7 - optional roster + dealer rotation;
                              opened from the header's players icon
                              (always there) or, once a dealer exists,
                              Result's band-1 dealer line too
    Sheet.css                 shared sheet chrome for stages 4, 5, 6 and 7
    Card.jsx / Card.css       shared card back / card face
    Header.jsx / Header.css   centred small wordmark, mute + fullscreen +
                              players (always visible - add or manage,
                              label depends on roster state), shown on
                              every stage except the sheets
    MuteToggle.jsx / MuteToggle.css  the mute button, laid out inside Header
    FullscreenToggle.jsx / FullscreenToggle.css  requests fullscreen +
                              wake lock on the first tap, mobile only
    Brand.jsx / Brand.css     the "made with ♥" footer credit
    FloatingSuits.jsx / FloatingSuits.css  drifting background suit glyphs
  styles/
    global.css                colour + type tokens (Baloo Bhaijaan 2
                              wordmark, Baloo 2 everywhere else), reset, app
                              shell, and the shared three-band stage layout
                              that keeps the card in one place
    buttons.css                shared button shapes
```

## Not built yet

Nothing outstanding - all seven stages are wired up and playable.
