import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const releaseWorkflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const publishGuard = await readFile(new URL('./assert-trusted-publish-context.mjs', import.meta.url), 'utf8')
const localGuardCheck = await readFile(new URL('./check-local-publish-guard.mjs', import.meta.url), 'utf8')

assert.equal(pkg.repository?.url, 'git+https://github.com/vevedh/feathersjs-v6-nitro.git')
assert.equal(pkg.publishConfig?.access, 'public')
assert.equal(pkg.publishConfig?.tag, 'next')
assert.equal(pkg.publishConfig?.provenance, undefined, 'Trusted Publishing generates provenance automatically; do not force local provenance.')
assert.equal(pkg.scripts?.prepublishOnly, 'node scripts/assert-trusted-publish-context.mjs')
assert.equal(pkg.scripts?.['check:version-available'], 'node scripts/assert-version-unpublished.mjs')
assert.equal(
  pkg.scripts?.['check:publishing'],
  'node scripts/check-publishing-contract.mjs && node scripts/check-local-publish-guard.mjs',
)
assert.ok(pkg.scripts?.verify?.includes('check:publishing'), 'verify must enforce the Trusted Publishing contract.')

for (const required of [
  'permissions:',
  'contents: read',
  'id-token: write',
  "if: github.ref == 'refs/heads/main'",
  'runs-on: ubuntu-latest',
  'environment: npm',
  'actions/checkout@v6',
  'actions/setup-node@v7',
  'node-version: 24.15.0',
  'package-manager-cache: false',
  'npm install --global npm@12.0.2',
  'npm install --global pnpm@9.15.9',
  'node scripts/assert-version-unpublished.mjs',
  'pnpm install --frozen-lockfile',
  'pnpm verify:release',
  'npm publish --access public --tag next',
]) {
  assert.ok(releaseWorkflow.includes(required), `Missing Trusted Publishing workflow contract: ${required}`)
}

for (const forbidden of [
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  '--provenance',
  'provenance=true',
  'provenance: true',
  'self-hosted',
  '--tag latest',
  '- latest',
]) {
  assert.ok(!releaseWorkflow.includes(forbidden), `Forbidden release workflow token: ${forbidden}`)
}

for (const requiredGuard of [
  "process.env.GITHUB_ACTIONS",
  "process.env.GITHUB_REPOSITORY",
  "process.env.GITHUB_REF",
  "process.env.GITHUB_WORKFLOW_REF",
  "process.env.ACTIONS_ID_TOKEN_REQUEST_URL",
  "process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "process.env.NODE_AUTH_TOKEN",
  "process.env.NPM_TOKEN",
]) {
  assert.ok(publishGuard.includes(requiredGuard), `Missing publish guard: ${requiredGuard}`)
}

for (const requiredLocalCheck of [
  'spawnSync',
  'GITHUB_ACTIONS',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'assert.notEqual(result.status, 0',
  'Direct local npm publish is disabled',
]) {
  assert.ok(localGuardCheck.includes(requiredLocalCheck), `Missing local publish guard self-test: ${requiredLocalCheck}`)
}

console.log('Trusted Publishing contract is valid.')
