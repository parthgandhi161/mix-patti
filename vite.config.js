import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo from https://<user>.github.io/mix-patti/,
// so every built asset URL has to be prefixed with /mix-patti/. This base
// is live in npm run dev too, not just the production build.
export default defineConfig({
  base: '/mix-patti/',
  plugins: [
    react(),
    // Precaches the app shell so an installed/offline load isn't a blank
    // screen. manifest: false because public/manifest.json is already
    // hand-written and correct - don't let the plugin generate a
    // competing one. registerType: 'autoUpdate' takes a new build
    // silently - src/lib/pwaUpdate.js checks for updates proactively
    // (not just on a fresh navigation, which an installed PWA resuming
    // from the background may never fire) and only reloads once one
    // finishes activating while the app is genuinely idle; a reload
    // landing mid-mix would still be worse than a stale version, so it
    // never happens there. injectRegister: false because that module
    // registers manually via virtual:pwa-register instead of the
    // plugin's auto-injected script, so it can hook onRegisteredSW /
    // onNeedReload - skipWaiting/clientsClaim are spelled out below
    // rather than relied on as an implicit side effect of that.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      includeAssets: [
        'favicon.svg',
        'manifest.json',
        'icons/*.png',
        'fonts/*.woff2',
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
