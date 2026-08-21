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
  mixing carousel flip, sheet slide-up).
- `oxlint` for linting (`npm run lint`). No test suite exists yet.
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
- `src/data/variations.json` is the content: the 20 Teen Patti twists.
  Treat its schema as fixed unless the user asks to change it.

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
- **The mix timeline is duplicated by necessity.** `--dur-shuffle` /
  `--dur-reveal` in `global.css` and the constants in `src/lib/timing.js`
  must be kept in sync by hand - the CSS drives keyframe animations, the
  JS drives `setTimeout`/Framer Motion sequencing for the same moments.
- **Sound is synthesised, not sampled.** `src/lib/sound.js` uses the Web
  Audio API directly; there are no audio asset files to manage.
- **Respect `prefers-reduced-motion`.** Both `global.css` (a blanket
  animation-duration override) and `Mixing.jsx` (skips straight to the
  landed state) already handle it - preserve that when touching animation
  code.

## Deployment

`vite.config.js` sets `base: '/mix-patti/'` for GitHub Pages. A push to
`main` or `master` triggers `.github/workflows/deploy.yml`, which builds
and publishes to `https://parthgandhi161.github.io/mix-patti/` via GitHub
Actions - there's no separate deploy command to run locally, and no
staging environment. Pushing to `main`/`master` **is** the deploy.
