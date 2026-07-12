import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-10',
  devtools: { enabled: true },
  alias: {
    '@vevedh/feathersjs-v6-nitro': fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
    '@vevedh/feathersjs-v6-nitro/socket.io': fileURLToPath(new URL('../../src/socket.io.ts', import.meta.url)),
  },
  nitro: {
    experimental: {
      websocket: false,
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
