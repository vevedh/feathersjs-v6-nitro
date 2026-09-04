import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const registry = 'https://registry.npmjs.org'
const packagePath = encodeURIComponent(pkg.name)
const versionPath = encodeURIComponent(pkg.version)
const url = `${registry}/${packagePath}/${versionPath}`

const response = await fetch(url, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
})

if (response.status === 404) {
  console.log(`npm version is available: ${pkg.name}@${pkg.version}`)
  process.exit(0)
}

if (response.ok) {
  assert.fail(`npm version already exists and cannot be overwritten: ${pkg.name}@${pkg.version}`)
}

assert.fail(`Unable to verify npm version availability: registry returned HTTP ${response.status} for ${pkg.name}@${pkg.version}.`)
