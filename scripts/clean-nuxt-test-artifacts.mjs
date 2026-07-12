import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('playground/nuxt-app')

await Promise.all([
  rm(resolve(root, '.output'), { recursive: true, force: true }),
  rm(resolve(root, 'node_modules/.cache/nuxt'), { recursive: true, force: true }),
])
