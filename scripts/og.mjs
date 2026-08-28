#!/usr/bin/env node
// Renders public/og.png, the 1200x630 social-preview image referenced by
// index.html's og:image / twitter:image tags. Unlike scripts/shot.mjs,
// this never talks to `npm run dev` - there's no app screen to capture,
// just a small bespoke composition - so it hands Playwright a
// self-contained HTML string via page.setContent() instead of
// navigating to a URL. Re-run `npm run og` any time the wordmark
// gradient, colour tokens, or card-back design in
// src/styles/global.css / Card.css change, since none of that is
// imported here - it's re-declared to match by hand.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FONTS_DIR = path.join(ROOT, 'public', 'fonts')
const OUTPUT_PATH = path.join(ROOT, 'public', 'og.png')

const WIDTH = 1200
const HEIGHT = 630

// Dynamic, not hardcoded: CLAUDE.md already tracks Home.jsx's tagline
// and the README layout table as manual-sync points whenever
// variations.json changes - importing the count here instead of
// hardcoding a third one removes a sync point rather than adding one.
const variations = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'data', 'variations.json'), 'utf8'),
)
const twistCount = variations.length

// page.setContent() gives the page an about:blank origin with no base
// URL, so relative url()s never resolve - and an absolute file:// URL
// isn't a safe substitute either, since Chromium's local-file access
// checks treat a font src load from a non-file:// document as
// cross-origin and this isn't a well-exercised code path. Reading the
// woff2 bytes and inlining them as base64 data URIs sidesteps both
// problems: the fonts are physically part of the HTML string, nothing
// left to resolve over the network or filesystem. Four files, ~30KB
// each - fine to inline for a one-shot script whose output is a PNG,
// not something that ships these bytes to end users.
function fontDataUri(filename) {
  const bytes = fs.readFileSync(path.join(FONTS_DIR, filename))
  return `data:font/woff2;base64,${bytes.toString('base64')}`
}

const fonts = {
  balooLatin: fontDataUri('baloo-2-latin.woff2'),
  balooLatinExt: fontDataUri('baloo-2-latin-ext.woff2'),
  posterLatin: fontDataUri('baloo-bhaijaan-2-latin.woff2'),
  posterLatinExt: fontDataUri('baloo-bhaijaan-2-latin-ext.woff2'),
}

// Card is sized off the same 5:7 ratio as .card in Card.css. 340x476
// leaves real breathing room above/below at this canvas height, echoing
// how the card never runs edge-to-edge in the app itself.
function buildHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  @font-face {
    font-family: "Baloo 2";
    font-weight: 400 800;
    src: url(${fonts.balooLatin}) format("woff2");
  }
  @font-face {
    font-family: "Baloo 2";
    font-weight: 400 800;
    src: url(${fonts.balooLatinExt}) format("woff2");
  }
  @font-face {
    font-family: "Baloo Bhaijaan 2";
    font-weight: 400 800;
    src: url(${fonts.posterLatin}) format("woff2");
  }
  @font-face {
    font-family: "Baloo Bhaijaan 2";
    font-weight: 400 800;
    src: url(${fonts.posterLatinExt}) format("woff2");
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    font-family: "Baloo 2", sans-serif;
    background-color: #160821;
    /* .shell's gradient as the base, plus body's own pink/teal glows -
       same three layers global.css uses, just composited here since
       this HTML has no separate .shell element. */
    background-image:
      linear-gradient(180deg, #1f0d30, #160821),
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(255, 78, 142, 0.18), transparent 70%),
      radial-gradient(ellipse 70% 50% at 50% 110%, rgba(37, 205, 185, 0.12), transparent 70%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 64px;
    padding: 0 76px;
  }

  .card {
    position: relative;
    width: 340px;
    aspect-ratio: 5 / 7;
    flex-shrink: 0;
    border-radius: 18px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(244, 198, 74, 0.14), transparent 60%),
      linear-gradient(160deg, #43206a, #2a1240 55%, #1d0c2e);
    border: 1px solid rgba(244, 198, 74, 0.35);
    box-shadow:
      inset 0 0 0 6px rgba(22, 8, 33, 0.55),
      inset 0 0 0 7px rgba(244, 198, 74, 0.28),
      0 18px 40px rgba(0, 0, 0, 0.5);
  }

  .card__lattice {
    position: absolute;
    inset: 14px;
    border-radius: 10px;
    background-image:
      repeating-linear-gradient(45deg, rgba(244, 198, 74, 0.13) 0 1px, transparent 1px 11px),
      repeating-linear-gradient(-45deg, rgba(255, 78, 142, 0.11) 0 1px, transparent 1px 11px);
  }

  .card__medallion {
    position: relative;
    width: 44%;
    aspect-ratio: 1;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 35%, #2f1549, #1b0a2b);
    border: 1px solid rgba(244, 198, 74, 0.45);
    box-shadow: 0 0 26px rgba(244, 198, 74, 0.18);
  }

  .card__monogram {
    font-family: "Baloo Bhaijaan 2", sans-serif;
    font-weight: 700;
    font-size: 62px;
    letter-spacing: 0.04em;
    background: linear-gradient(180deg, #f4c64a, #d99b28);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .wordmark {
    font-family: "Baloo Bhaijaan 2", sans-serif;
    font-weight: 700;
    font-size: 100px;
    line-height: 1.05;
    /* Exact treatment from .home__wordmark / .appHeader__word - reused,
       not simplified to a flat gold fill. */
    background: linear-gradient(180deg, #ffe9a8, #f4c64a 45%, #d99b28);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 4px 24px rgba(244, 198, 74, 0.3));
  }

  .tagline {
    font-family: "Baloo 2", sans-serif;
    font-weight: 500;
    font-size: 32px;
    letter-spacing: 0.06em;
    text-transform: lowercase;
    color: #b79ccf;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="card__lattice"></div>
    <div class="card__medallion">
      <span class="card__monogram">MP</span>
    </div>
  </div>
  <div class="copy">
    <h1 class="wordmark">Mix Patti</h1>
    <p class="tagline">${twistCount} twists on Teen Patti</p>
  </div>
</body>
</html>`
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  try {
    await page.setContent(buildHtml())
    // Fonts are only fetched once something actually needs to lay out
    // with them - waiting on document.fonts.ready (not just the load
    // event setContent already waits for) is what stops Playwright from
    // capturing the fallback system font mid-swap.
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.screenshot({ path: OUTPUT_PATH })
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${WIDTH}x${HEIGHT})`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
