import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const guardPath = fileURLToPath(new URL('./assert-trusted-publish-context.mjs', import.meta.url))
const localEnv = { ...process.env }

for (const name of [
  'GITHUB_ACTIONS',
  'GITHUB_REPOSITORY',
  'GITHUB_REF',
  'GITHUB_WORKFLOW_REF',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
]) {
  delete localEnv[name]
}

const result = spawnSync(process.execPath, [guardPath], {
  env: localEnv,
  encoding: 'utf8',
  windowsHide: true,
})

if (result.error) {
  throw result.error
}

assert.notEqual(result.status, 0, 'The publish guard unexpectedly accepted a non-GitHub context.')

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
assert.match(
  output,
  /Direct local npm publish is disabled\. Use the GitHub Actions release workflow\./,
  'The publish guard failed for an unexpected reason.',
)

console.log('Local publish guard correctly rejected a non-GitHub context.')
