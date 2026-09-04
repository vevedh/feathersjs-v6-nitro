import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function normalizePackManifest(value) {
  if (Array.isArray(value)) {
    assert.equal(value.length, 1, `npm pack returned ${value.length} manifests; expected exactly one.`)
    return value[0]
  }

  if (value && typeof value === 'object' && Array.isArray(value.files)) {
    return value
  }

  if (value && typeof value === 'object') {
    const manifests = Object.values(value).filter(entry => (
      entry
      && typeof entry === 'object'
      && Array.isArray(entry.files)
      && typeof entry.filename === 'string'
    ))
    assert.equal(manifests.length, 1, `npm pack returned ${manifests.length} usable manifests; expected exactly one.`)
    return manifests[0]
  }

  return undefined
}

function parsePackOutput(output) {
  const lines = output.split(/\r?\n/u)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const first = lines[index].trimStart()[0]
    if (first !== '[' && first !== '{') {
      continue
    }

    try {
      const parsed = JSON.parse(lines.slice(index).join('\n').trim())
      const pack = normalizePackManifest(parsed)
      if (pack) {
        return pack
      }
    }
    catch {
      // Lifecycle output can precede the JSON payload. Keep scanning upward.
    }
  }

  assert.fail('npm pack did not return a supported JSON manifest.')
}

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
const pack = parsePackOutput(output)
assert.ok(pack, 'npm pack did not return package metadata.')
assert.ok(Array.isArray(pack.files), 'npm pack metadata does not contain a files array.')

const files = pack.files.map(entry => entry.path)
if (typeof pack.entryCount === 'number') {
  assert.equal(pack.entryCount, files.length, 'npm pack entryCount does not match the files manifest.')
}

const allowedRootFiles = new Set(['package.json', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'RELEASING.md', 'LICENSE'])
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
