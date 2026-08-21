import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo from https://<user>.github.io/mix-patti/,
// so every built asset URL has to be prefixed with /mix-patti/.
// Locally (npm run dev) Vite ignores this and serves from /.
export default defineConfig({
  base: '/mix-patti/',
  plugins: [react()],
})
