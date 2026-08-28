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
- `oxlint` for linting (`npm run lint`). No automated test suite or CI
  gate exists yet - Playwright is a `devDependency`, but only for one-off
  visual verification during development (see README's "Visual checks
  with Playwright"), nothing runs it automatically.
- Fonts are loaded via a Google Fonts `<link>` in `index.html`, not
  self-hosted or npm-installed.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/mix-patti/
npm run build    # production build into dist/
npm run lint      # oxlint
npm run preview  # serve the production build locally
```

Run `npm run build` (and `npm run lint`) after any non-trivial change -
there's no CI step that runs before the GitHub Pages deploy, so a broken
build only surfaces once it's already live.

## Architecture

- `src/App.jsx` is the whole app's state machine: `stage` (`home` →
  `mixing` → `result`) plus an independent `overlay` (`null` | `rules` |
  `house`) for the two rule sheets. There's no router - it's all one page.
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
- `src/data/variations.json` is the content: the 27 Teen Patti twists.
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
    widest case (deal + win + `★ Joker`, which 5 of the 27 variations
    produce) on that one line. Widen the pills and they wrap into the
    buttons. To recheck this count after editing `variations.json`:
    `node -e "const d=require('./src/data/variations.json');console.log(d.filter(v=>v.tableCards>0&&v.joker!==null).length)"`.
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
  exceed 1 and that every mix after a cycle still creates nodes. Real
  confirmation needs a device: background the iOS PWA for a minute, come
  back, mix.

## Deployment

`vite.config.js` sets `base: '/mix-patti/'` for GitHub Pages. A push to
`main` or `master` triggers `.github/workflows/deploy.yml`, which builds
and publishes to `https://parthgandhi161.github.io/mix-patti/` via GitHub
Actions - there's no separate deploy command to run locally, and no
staging environment. Pushing to `main`/`master` **is** the deploy.

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
