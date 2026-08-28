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
  },
})
