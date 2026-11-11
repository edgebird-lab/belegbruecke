/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports der Belegbrücke: Server 127.0.0.1:8784, Vorschau und Browsertests 4184 (nie 4173, das ist der Prozesslotse)
const api = { '/api': { target: 'http://127.0.0.1:8784' } }

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5184, proxy: api },
  preview: { host: '127.0.0.1', port: 4184, strictPort: true, proxy: api },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
