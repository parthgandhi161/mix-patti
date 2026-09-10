import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.js: that file's VitePWA plugin
// hooks into dev-server/build lifecycle that Vitest has no clean
// substitute for and no use for (pick.js touches no DOM/service worker).
// Add plugins here only when a future test actually needs them (e.g.
// @vitejs/plugin-react once a .jsx file is under test).
export default defineConfig({
  test: {
    environment: 'node', // no DOM needed - pick.js only touches
                          // localStorage and Math.random as globals
    setupFiles: ['./test/setup.js'],
    // e2e/*.spec.js are Playwright tests (npm run test:e2e), not
    // Vitest's - vitest's default include glob matches *.spec.js too,
    // so without this it tries (and fails) to run them here as well.
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
