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

Playwright is a `devDependency`. `scripts/shot.mjs` (plus
`scripts/offline-check.mjs` for the offline case) is a small committed
harness around it - not a test suite, and not wired into CI (only
`npm run lint` and `npm test` gate the deploy, see CLAUDE.md) - for
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
  data/variations.json        the 27 twists (schema untouched)
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
                              shown twist sit inset in the card's own
                              bottom-left corner, not a new band
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
