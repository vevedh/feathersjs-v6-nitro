import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
const jsonStart = output.search(/\[\s*\{\s*"id"/u)
assert.notEqual(jsonStart, -1, 'npm pack did not return a JSON manifest.')
const [pack] = JSON.parse(output.slice(jsonStart))
assert.ok(pack, 'npm pack did not return package metadata.')

const files = pack.files.map(entry => entry.path)
const allowedRootFiles = new Set(['package.json', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE'])
for (const required of allowedRootFiles) {
  assert.ok(files.includes(required), `Required published file is missing: ${required}`)
}
for (const file of files) {
  assert.ok(file.startsWith('dist/') || allowedRootFiles.has(file), `Unexpected published file: ${file}`)
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
for (const [name, target] of Object.entries(pkg.exports)) {
  for (const condition of ['types', 'import']) {
    const path = target[condition]?.replace(/^\.\//u, '')
    assert.ok(path && files.includes(path), `Export ${name}.${condition} is missing from the tarball: ${path}`)
  }
}

for (const forbidden of ['patch-memory/', 'docs-private/', 'test/', 'playground/', 'AGENTS.md']) {
  assert.ok(files.every(file => !file.startsWith(forbidden)), `Forbidden content published: ${forbidden}`)
}

console.log(JSON.stringify({
  name: pack.name,
  version: pack.version,
  filename: pack.filename,
  size: pack.size,
  unpackedSize: pack.unpackedSize,
  entries: files.length,
}, null, 2))
