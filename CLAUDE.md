# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo.

## What this is

Mix Patti - a mobile-first randomizer + rulebook for Teen Patti (Indian
card game) variations. No stakes, no scoring, no multiplayer/backend: tap
a card, get a random twist, optionally read its rules. Everything is
client-side static React, deployed as a static site to GitHub Pages.

## Stack

- React 19 + Vite 8, plain CSS (no Tailwind/CSS-in-JS/component library).
- Framer Motion for the few animated transitions (stage crossfade, the
  mixing carousel, sheet slide-up).
- `oxlint` for linting (`npm run lint`) and `vitest` for unit tests
  (`npm test`) - both run in CI (`.github/workflows/deploy.yml`) before
  every deploy build. Playwright backs two separate things, neither wired
  into CI (only `oxlint`/`vitest` are - see "Testing" below for why):
  `e2e/*.spec.js`, a real assertion-based suite (`npm run test:e2e`), and
  the older committed manual visual-verification harness in `scripts/`
  (see README's "Visual checks with Playwright") - don't confuse the two.
- Fonts (Baloo Bhaijaan 2, Baloo 2) are self-hosted as woff2 in
  `public/fonts/`, declared via `@font-face` in `src/styles/global.css` -
  not loaded from Google Fonts at runtime.
- `vite-plugin-pwa` generates the service worker at build time
  (`registerType: 'autoUpdate'`) and precaches the whole app shell -
  JS/CSS bundle, `index.html`, the self-hosted fonts, and the icons - so
  an installed or offline load renders identically to online. Because the
  whole shell is precached, installing a new version is a real background
  download that doesn't always finish inside one short session - so
  registration isn't the plugin's auto-injected script but a manual
  `virtual:pwa-register` call in `src/lib/pwaUpdate.js` (`injectRegister:
  false` in `vite.config.js`), which checks for updates proactively (on
  a timer and on every `visibilitychange`, not only on a fresh
  navigation - an installed PWA resuming from the background fires
  neither) and reloads once a new worker activates, but *only* when
  `App.jsx`'s `setReloadSafe` says it's safe - idle Home stage, no sheet
  open. Anywhere else (mid-mix, a sheet open) it never reloads; the
  update just applies silently on the next natural reopen.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/mix-patti/
npm run build    # production build into dist/
npm run lint      # oxlint
npm test         # vitest (src/lib unit tests)
npm run test:e2e # playwright (e2e/ - real-browser assertions)
npm run test:all # lint + npm test + test:e2e, one command - run this
                 # before every commit (see "Testing" below)
npm run preview  # serve the production build locally
```

`npm run lint`, `npm test`, and `npm run build` all run in CI
(`.github/workflows/deploy.yml`) before every GitHub Pages deploy - a
broken lint/test/build fails the `build` job and blocks `deploy` (which
`needs: build`), so nothing broken reaches production. `test:e2e` does
NOT run in CI (kept out deliberately - see "Testing" below), so it's on
you (or whichever agent is working here) to run it locally; still run all
of lint/test/build after any non-trivial change even though CI also
checks them - CI catching it is a safety net, not a substitute for a fast
local loop.

## Testing

Two committed suites - **when you add a new feature or change
user-visible behavior, add or update a test for it in the SAME change,
then run `npm run test:all` before committing.** Don't treat this as
optional polish; a change without a test for it is not done. If you're
unsure whether something needs one, default to adding it - see the two
conventions below for where it goes.

- **Unit tests** (`src/lib/*.test.js`, vitest, `npm test`): for pure logic
  in `src/lib`. The existing convention (`pick.test.js`, `usePlayers.test.js`,
  `judge/*.test.js`, `storage.test.js`, `summary.test.js`,
  `useVariationPrefs.test.js`) is to test EXPORTED PURE FUNCTIONS, not to
  mount React components or hooks - `vitest.config.js` deliberately runs
  with `environment: 'node'` and no `@testing-library/react`, so there's
  no DOM and no hook-rendering harness. When a hook's logic is worth
  covering and isn't trivial (see `usePlayers.js`'s
  `nextDealerIndexAfterRemoval`/`nextDealerIndexAfterMove` and
  `useVariationPrefs.js`'s `canToggleMuteId`/`sanitizeIdList`), extract it
  as a standalone exported function the hook calls internally, and test
  that function directly - don't reach for a DOM-rendering library to
  test a hook in place. A hook that's pure persistence glue around
  `useState`/`useEffect` with no interesting branching (`useMuted.js`,
  `useReadingMode.js`) doesn't need its own unit test - its behavior is
  covered by the e2e suite instead (e.g. `e2e/header.spec.js`'s mute
  toggle reload-persistence test).
- **End-to-end tests** (`e2e/*.spec.js`, Playwright's own test runner via
  `@playwright/test`, `npm run test:e2e`): for anything that needs the
  real running app - a new screen/sheet, a new user flow, state that
  round-trips through `localStorage`, anything wiring a component to a
  `src/lib` hook. `playwright.config.js` auto-manages the dev server (no
  need to have `npm run dev` already running first), defaults to
  `devices['iPhone 13']` forced to Chromium (see the Playwright note
  further down for why the device emulation matters, and why Chromium -
  this repo only installs that one browser binary), and most specs ask
  for `prefers-reduced-motion` via `e2e/helpers.js`'s `gotoApp()` - which
  `Mixing.jsx`/`Result.jsx` already honor by skipping their theatrical
  animations (see "Respect prefers-reduced-motion" below), so this is
  real, already-existing behavior being exercised, not a test-only
  bypass. Only skip it (as `e2e/home-to-result.spec.js`'s chrome-dim test
  does) when the animation/timing itself is what's under test. Kept
  deliberately OUT of CI, same reasoning as the older `scripts/`
  Playwright harness: CI here gates a static-site deploy and stays fast;
  this suite is the local pre-commit gate instead (`npm run test:all`).
  This is separate from `scripts/shot.mjs`/`scripts/offline-check.mjs`
  (README's "Visual checks with Playwright") - those are a
  screenshot/measurement harness with no pass/fail assertions, still
  useful for eyeballing layout/animation, not a substitute for `e2e/`'s
  assertions and not the other way around.

## Architecture

- `src/App.jsx` is the whole app's state machine: `stage` (`home` →
  `mixing` → `result`) plus an independent `overlay` (`null` | `rules` |
  `house` | `browse` | `players`) for the four sheets. `browse` (BrowseSheet,
  the searchable "All twists" list) additionally uses its own `browseTarget`
  state to layer RulesSheet on top when a row is picked, without touching
  `current` (the mixed winner). `players` (PlayersSheet) is the optional
  player roster + rotating dealer, opened from Result's band-1 dealer line;
  it has no such nested layering. There's no router - it's all one page.
- RulesSheet has two reading modes, toggled by a button in `.sheet__head`:
  dense (today's always-scrolling section list, still the default) and
  "explain" (one step at a time - joker, then each `setup`/`play` entry
  individually, then winner, then notes - for a dealer walking a table
  through a twist out loud). The choice persists across sessions via
  `mixpatti.rulesMode` in `localStorage` (`useReadingMode.js`, same shape
  as `useMuted.js`); the step index itself does not persist and always
  starts at 0, since RulesSheet is always a fresh mount on open (neither
  the `overlay === 'rules'` path nor the `browseTarget` path ever
  re-renders it in place with a different `variation`). RulesSheet-only
  classes (`rulesSheet__*`) live in the shared `Sheet.css`, per that
  file's existing per-component prefix convention.
- `src/components/` is one component + one same-named `.css` file per
  piece of UI (`Card.jsx`/`Card.css`, etc.) - no CSS modules, no styled-
  components. Class names follow a light BEM convention:
  `.block__element--modifier`.
- `src/styles/global.css` holds every design token (colours, the two font
  vars, animation durations) as CSS custom properties on `:root`. Change
  the theme there, not in individual component files.
- `src/lib/` is small framework-free helper modules (random pick, sound
  synthesis, timing constants, summary-badge text) - keep logic here
  testable and out of components where practical.
- **Starring and muting** are per-browser preferences on top of the base
  `pick.js` randomizer: starred twists are drawn more often, muted twists
  are never drawn (but stay fully readable in Browse/RulesSheet - muting
  only removes a twist from the draw, never from the rulebook). Both live
  in `useVariationPrefs.js`, persisted as separate id arrays under
  `mixpatti.starredVariations`/`mixpatti.mutedVariations` (deliberately
  not `mixpatti.muted` - that key and `useMuted.js` already mean *audio*
  mute; the two concepts share an English word, not a key or a hook).
  `pick.js`'s `pickNext()` takes an optional third argument,
  `{ mutedIds, starredIds }`. Every variation is equal weight (the old
  priority-based bagA/bagB split - a "classics" bag drawn a fifth of the
  time vs everything else - is gone along with the `priority` field
  itself); there is only ONE shuffle-bag now, `bagMain` (all unmuted ids).
  A starred unmuted id is simply listed `STARRED_MULTIPLIER` (2) times in
  `bagMain`'s own source list instead of once, so it's drawn exactly that
  many times per full cycle while everything else is drawn once - a flat,
  bag-size-independent boost that comes for free out of the same
  single-bag machinery (`drawFrom()`'s previousId swap and
  `avoidRecentInFront()` both already have to handle a bag's own
  duplicate/repeat entries). An earlier design used a SEPARATE `bagStar`
  pre-roll bag (a flat ~30% chance per draw, regardless of how many things
  were starred) - replaced after a user reported exactly the symptom that
  design produces: one favorite repeating 3+ times in a short session
  while most other twists never showed at all. See `pick.js`'s own JSDoc
  on `pickNext()`/`STARRED_MULTIPLIER` for the full reasoning, and
  `pick.test.js`'s "short-session characterization" describe block for the
  regression coverage. A floor (`MIN_UNMUTED`, exported from `pick.js`)
  stops muting from ever starving the draw to nothing - the UI greys out
  the mute control at that exact number (`useVariationPrefs.js`'s
  `canToggleMute`), and `pick.js` ignores the mute set outright as a
  backstop if that floor is ever violated anyway (stale state, a smaller
  `variations.json`, etc.). Result's controls float beside the card's
  right edge, vertically centred (see the `--band-under` note below for
  why not `.stage__under`); BrowseSheet's live per-row plus an
  All/Starred/Muted filter above the list.
- **The sideshow-ban reroll's target share isn't the same number you'd
  naively plug in.** `pick.js`'s reroll (see `pickNext()`) discards a
  pick and redraws when it's banned AND the previous round was too -
  which actively suppresses back-to-back bans, pulling the STEADY-STATE
  share of ACCEPTED rounds that land banned below the raw per-draw
  probability that feeds it, and the gap widens sharply as that
  probability rises. `requiredPerDrawRate()` inverts this (a small
  Markov-chain-derived formula, solved by bisection) so `TARGET_BANNED_SHARE`
  keeps meaning what it says - the share a PLAYER actually experiences -
  rather than a pre-reroll input that happens to get discounted on the way
  out. Discovered when raising the target from 0.2 to 0.33: naively using
  0.33 as the per-draw rate only converged to an observed ~25% share.
- **`pick.js`'s own draw state (the shuffle-bag contents, its recent-draw
  history, and the last-banned flag) persists to `sessionStorage`, not
  `localStorage`** - deliberately different from every other piece of
  persisted state in this app (starred/muted prefs, players, audio mute,
  reading mode all stay on `localStorage`). A user asked for the "what's
  been drawn already" state to start fresh every time the app is
  genuinely reopened (a new PWA launch, a new tab) rather than carrying
  over indefinitely; `sessionStorage` gives that for free while still
  surviving an in-session reload (a manual refresh, or `pwaUpdate.js`'s
  own silent update-reload), so the never-repeats-immediately guarantee
  doesn't break mid-session. `storage.js`'s `getSessionJSON`/
  `setSessionJSON` mirror the existing `getStorageJSON`/`setStorageJSON`
  pair one-for-one, just against the other store.
- `src/data/variations.json` is the content: the 32 Teen Patti twists.
  Treat its schema as fixed unless the user asks to change it. When adding
  or removing entries, also check for two things that don't come from the
  schema: the hardcoded twist count in `Home.jsx`'s tagline and the
  `README.md` layout table, and whether the change shifts how many
  variations hit the three-badge "widest case" noted below (re-run the
  check there rather than hand-counting). Before adding a new variation,
  check `alsoKnownAs` across the file for overlap and prune for mechanical
  overlap, not just count - a twist that only tweaks a number relative to
  an existing one (e.g. a fourth "flip a card to set the joker" variant)
  adds upkeep without adding anything a player would notice at the table.

See the README's "Layout" section for the full file-by-file map.

## Conventions worth knowing before editing

- **Single dark theme, deliberately.** There is no light mode and none is
  planned - don't add `prefers-color-scheme` handling.
- **Mobile-first, fixed-width shell.** `.shell` cap at `max-width: 430px`
  and is meant to look like a native app screen, not a responsive website.
  Don't widen layouts for desktop; the desktop view is just the same
  phone-shaped card floating on a backdrop.
- **Two fonts only, on purpose:** `--font-poster` (currently Baloo
  Bhaijaan 2) is the one "fun" display face, used only for the wordmark
  (Home hero title, the header logo, and the card-back monogram).
  `--font-head` / `--font-body` (currently both Baloo 2) cover everything
  else. Don't introduce a third typeface without checking with the user -
  this has been explicitly trimmed down before.
- **Safe-area handling is layered, be careful with it.** `.shell` applies
  `env(safe-area-inset-*)` as real padding, so normal-flow children
  (the header, stage content) get it for free. Anything absolutely
  positioned against `.shell` (or another positioned ancestor) needs to
  add the inset back manually, since absolute offsets ignore the parent's
  own padding - see `Brand.css`'s `.credit` for the pattern.
- **`src/lib/timing.js` is the only source for the mix timeline.** There
  are deliberately no matching CSS duration tokens. There used to be
  (`--dur-shuffle` / `--dur-reveal`), nothing ever read them, and the
  duplication is exactly what let a temporary 7000ms diagnostic value
  strand itself across three files. The CSS durations that remain
  (`cascadeCut`, `glowPulse`, `landPop`, `shimmerSweep`) are independent
  loop/flourish timings, not timeline-derived.
- **One card size, one card position, across all three stages.** Every
  stage is the same four-band grid in `global.css` - title, card
  (`.stage__card`), caption (`.stage__under`), controls (`.stage__foot`)
  - which puts Home's face-down card, the mixing deck, the carousel and
  the result card in the *same box*. That's what makes the crossfades
  read as one continuous card instead of three screens. Change a band and
  you move the card on all three stages at once, which is the point.
  - The card row is `auto`, sized exactly to the card, so it holds **no
    slack**. All leftover height goes to the controls row. This matters:
    when the card row was `1fr` the card floated centred in it and the
    slack piled up *underneath* the card - 83px between the card and its
    own summary badges on a tall screen - while the buttons crushed
    against the credit line.
  - `--card-w` is therefore derived from `100dvh` minus `--chrome`, not
    from the band. `--chrome` sums `--header-h` and the three fixed
    bands, so `--header-h` is load-bearing: `.appHeader` is pinned to it
    and the formula subtracts it. On a short screen the card shrinks
    rather than overflowing into the title or the buttons.
  - `--band-under` reserves exactly **one** line of Result's badge pills.
    Their font/padding in `Result.css` and the terse `dealLabel` wording
    for table-card variations in `src/lib/summary.js` exist to keep the
    widest case (deal + win + `★ Joker`, which 7 of the 32 variations
    produce) on that one line. Widen the pills and they wrap into the
    buttons. To recheck this count after editing `variations.json`:
    `node -e "const d=require('./src/data/variations.json');console.log(d.filter(v=>v.tableCards>0&&v.joker!==null).length)"`.
    Anything else that wants a home near the card without eating into this
    one reserved line - the star/mute controls (`.result__prefs`), the
    sideshow-ban stamp (`.result__banStamp`) - goes `position: absolute`
    inside `.result__cardWrap` instead, contributing zero height to
    `.stage__card`'s `auto` row. `.result__prefs` was first tried INSET
    over the card's bottom-left corner, but an inset overlay clipped
    straight through wide/multi-line names at narrower widths (e.g.
    "Parda Faash" on iPhone SE) since the card's name text is centred and
    can span nearly the full card width - it now floats OUTSIDE the
    card's right edge instead (`left: 100%` plus a fixed gap, vertically
    centred), in the margin `--card-cap` already leaves between the card
    and the stage's own side padding, so it can never collide with the
    card's own content regardless of name length.
  - Band 1 (`--band-top`, 88px) started out Home-only (`.home__head`,
    the wordmark/tagline). Result now also claims it, but only once a
    player roster exists - `.result__dealer` (the "X deals" line) is
    conditionally rendered, not always-present, and renders nothing at
    all on an empty roster. Anything placed there has to fit inside the
    existing 88px, since `--band-top` feeds `--chrome`/`--card-w`
    directly; don't grow the track itself. Mixing still leaves it empty
    on purpose (that stage is dimmed/theatrical - a dealer name there
    would be noise). The header's players icon (see below) is the entry
    point that's always there regardless of roster state - band 1's
    dealer line is a second, Result-only shortcut into the same sheet
    once a dealer exists, not the only way in.
  - `.appHeader`'s two side columns are 136px each (`Header.css`), not a
    round number - it's sized for **three** 40px circular buttons, not
    two, because the right side isn't a reliable 2-slot column:
    `FullscreenToggle` shows/hides itself by platform and fullscreen
    state (and never hides at all on iOS Safari, which has no Fullscreen
    API - it shows a permanent "Add to Home Screen" hint there instead),
    so it can coexist with `MuteToggle` AND the players icon at the same
    time. The players icon itself is always rendered, not conditional on
    an empty roster - it's the one entry point guaranteed reachable from
    every stage, so hiding it once players exist would strand anyone who
    needs to manage the roster from Home or Mixing, or from Result before
    a dealer's been set; only its label swaps ("Add players" vs "Manage
    players"). Both columns widen together, symmetrically, purely so the
    wordmark - centred in the middle track - stays exactly centred
    regardless of how many icons actually render on either side; don't
    widen only one side.
  - **Result is the one deliberate exception to "one card size."** It
    overrides `--card-cap` down to `min(62%, 216px)` (`Result.css`,
    scoped to `.stage.result`), so its card is visibly a little smaller
    than the card Mixing lands on - the crossfade isn't perfectly
    seamless there anymore. Added when Result gained a 3rd footer
    button (Hand Judge's "Compare hands") and tightening the footer's
    own spacing alone couldn't guarantee zero scrolling on every real
    device: `--card-w` is normally WIDTH-capped, not height-capped, so
    a taller footer doesn't actually shrink an already-width-bound card
    at all - only `--card-cap` itself does. Result must never scroll,
    full stop, so this was accepted on purpose rather than chased
    further with footer-only tweaks.
- **No 3D in the mix.** The reveal is `translateX` + `scale` + `opacity`
  only. Mobile WebKit stops honouring `backface-visibility: hidden` once
  the rotating parent's transform is a JS-driven `matrix3d`, which ghosts
  the away-facing card through; a card rotating edge-on at phone width is
  also unreadable for much of each turn. Don't reintroduce `perspective`
  / `preserve-3d` / `rotateY` here.
- **The shuffle→reveal handoff is a no-op, not a transition.** The deck's
  `cascadeCut` runs once (not `infinite`) and its stagger is tuned so all
  five cards are at rest by 880ms, well before the 1000ms phase change;
  the carousel's strip then *starts with a card back* (`BACK`, index 0),
  so at `pos` 0 it is pixel-identical to the settled deck and the swap
  changes nothing on screen. The reveal deals that back away as the first
  face arrives. Three things keep it invisible and are easy to break:
  the deck's non-top slots zero out `--card-drop` (five stacked shadows
  otherwise composite into a much darker halo), only the non-zero slots
  get the `slotIn` fade, and `WIN_INDEX` is `1 + TRAVEL` because of that
  leading back.
- **Sound is synthesised, not sampled.** `src/lib/sound.js` uses the Web
  Audio API directly; there are no audio asset files to manage.
- **The audio context is rebuilt, not kept alive.** An AudioContext does
  not survive app-switching, and two earlier attempts to nurse one back
  failed because they trusted `ctx.state`. So: liveness is *measured*
  (does `currentTime` actually advance between two samples?), never
  inspected - that's the only thing that catches iOS's non-standard
  `'interrupted'` and bfcache zombies. The context is torn down on hide
  and rebuilt at the next gesture, always `close()`ing before
  constructing (browsers cap concurrent contexts at ~6 and a leak is only
  recoverable by reload). Cues are synchronous fire-and-forget and
  **must never become `async`** - a late cue doesn't sound late, it
  sounds wrong, because a different card is on screen by then. Mute is a
  gain node on the output, never `if (!muted)` at the call sites.
- **The version shown in the footer comes straight from `package.json`.**
  `Brand.jsx` does `import { version } from '../../package.json'` - Vite's
  built-in JSON loader exports it as a named binding, no `vite.config.js`
  changes or `import.meta.env` plumbing needed. Don't add a second place
  that stores the version number.
- **Respect `prefers-reduced-motion`.** Both `global.css` (a blanket
  animation-duration override) and `Mixing.jsx` (skips straight to the
  landed state) already handle it - preserve that when touching animation
  code.
- **Verify animation/layout changes with a real screenshot, not just
  reasoning about the CSS.** This app is almost entirely mobile-only
  animation (the mix timeline, the carousel reveal, safe-area layout), so
  it's easy for a change to be correct in principle and still clip or
  look wrong at the actual 430px phone width. Use Playwright against
  `npm run dev` with `devices['iPhone 13']` (touch emulation matters here,
  see `isTouchPrimary()`) - see the README section for the exact recipe.
  Measure boxes, don't just eyeball: `boundingBox()` on the card in each
  stage is what proves the bands still line up. Also check a short
  viewport (`devices['iPhone SE']`) - that's where the card band gets
  tight. Note the idle `breathe` / `cardBreathe` loops mean Playwright
  never considers the card "stable", so clicks need `{ force: true }`.
- **The audio lifecycle can't be verified this way.** Headless Chromium
  has no real audio output and no iOS backgrounding semantics. What you
  *can* automate is a proxy: wrap `window.AudioContext` in an init script
  to count constructions/`close()`s and created source nodes, override
  `document.visibilityState` and dispatch `visibilitychange` to fake a
  background/foreground cycle, then assert that live contexts never
  exceed 1 and that every mix after a cycle still creates nodes. This is
  exactly what `e2e/audio-lifecycle.spec.js` already automates as part of
  `npm run test:e2e` - extend that spec rather than starting a new
  throwaway script if `sound.js`'s lifecycle logic changes. Real
  confirmation still needs a device for anything beyond that proxy:
  background the iOS PWA for a minute, come back, mix.

## Deployment

`vite.config.js` sets `base: '/mix-patti/'` for GitHub Pages. A push to
`main` or `master` triggers `.github/workflows/deploy.yml`, which builds
and publishes to `https://parthgandhi161.github.io/mix-patti/` via GitHub
Actions - there's no separate deploy command to run locally, and no
staging environment. Pushing to `main`/`master` **is** the deploy.

`index.html`'s `og:url` / `og:image` / `twitter:image` meta tags also
hardcode this same `https://parthgandhi161.github.io/mix-patti/` origin,
as an absolute URL (Open Graph requires one, and `%BASE_URL%` - used
elsewhere in that file for `manifest.json`/`apple-touch-icon.png` - only
resolves to the relative `/mix-patti/`). That makes `index.html` a second
place storing this domain, alongside `vite.config.js`'s `base` - if the
deploy URL ever changes, update both together.

## Releasing

`npm version patch|minor|major` bumps `package.json`, commits, and tags in
one step; `git push --follow-tags` pushes both. The tag push fires
`.github/workflows/release.yml`, which publishes a GitHub Release with
auto-generated notes - nothing to run by hand beyond those two commands.

**On every commit you make to this repo that changes app behavior, bump
the version and push the tag yourself, without being asked** - patch for
fixes/polish, minor for new features or content, major reserved for a
deliberate breaking relaunch (nothing so far has warranted one - this is a
UI app with no public API, so "major" isn't about compatibility, it's about
signalling a genuine relaunch). Tag pushes only trigger `release.yml`; they
don't add a new deploy pathway - pushing to `main`/`master` already deploys
today regardless of tags, per the paragraph above.
