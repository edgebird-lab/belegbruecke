/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// Ports der Belegbrücke: Server 127.0.0.1:8784, Vorschau und Browsertests 4184 (nie 4173, das ist der Prozesslotse)
const SERVER = 'http://127.0.0.1:8784'

// Der Server beantwortet nur Anfragen an seinen eigenen Host und Origin (Schutz vor DNS-Rebinding).
// Die Weiterleitung von Vite tritt deshalb als Server selbst auf; das betrifft nur die Entwicklung auf 127.0.0.1.
const api: Record<string, ProxyOptions> = {
  '/api': {
    target: SERVER,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (anfrage) => {
        if (anfrage.getHeader('origin')) anfrage.setHeader('origin', SERVER)
      })
    },
  },
}

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
