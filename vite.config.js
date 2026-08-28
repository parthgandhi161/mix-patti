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
    // silently on the next natural load; no update toast, no forced
    // reload (this app has no server state to protect, and a reload
    // landing mid-mix would be worse than a stale version).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'favicon.svg',
        'manifest.json',
        'icons/*.png',
        'fonts/*.woff2',
      ],
      workbox: {
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
