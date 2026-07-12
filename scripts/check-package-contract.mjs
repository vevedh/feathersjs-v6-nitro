import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lockfile = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')

assert.equal(pkg.name, '@vevedh/feathersjs-v6-nitro')
assert.equal(pkg.type, 'module')
assert.equal(pkg.sideEffects, false)
assert.ok(pkg.engines?.node?.includes('22.12'))
assert.equal(pkg.peerDependenciesMeta?.['socket.io']?.optional, true)
assert.ok(pkg.exports?.['./socket.io'])
assert.ok(pkg.exports?.['./diagnostics'])
assert.ok(pkg.exports?.['./define'])
for (const requiredFile of ['dist', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE']) {
  assert.ok(pkg.files.includes(requiredFile), `Missing package file declaration: ${requiredFile}`)
}

for (const [name, target] of Object.entries(pkg.exports)) {
  assert.equal(typeof target, 'object', `Export ${name} must use a condition map.`)
  assert.ok(target.types, `Export ${name} must expose TypeScript declarations.`)
  assert.ok(target.import, `Export ${name} must expose an ESM import target.`)
  assert.equal(target.require, undefined, `Export ${name} must not advertise CommonJS.`)
}

for (const forbidden of ['patch-memory', 'docs-private', 'AGENTS.md', 'test', 'playground']) {
  assert.ok(!pkg.files.includes(forbidden), `${forbidden} must not be published.`)
}

assert.ok(!/[A-Za-z]:\\/u.test(lockfile), 'The lockfile contains a Windows absolute path.')
assert.ok(!lockfile.includes('file:///'), 'The lockfile contains an absolute file URL.')

try {
  const mainBundle = await readFile(new URL('../dist/index.mjs', import.meta.url), 'utf8')
  assert.ok(!mainBundle.includes('socket.io'), 'The main bundle must not load the optional Socket.IO peer.')
}
catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error
  }
}

console.log('Package contract is valid.')
