import assert from 'node:assert/strict'

const expectedRepository = 'vevedh/feathersjs-v6-nitro'
const expectedRef = 'refs/heads/main'
const workflowSuffix = '/.github/workflows/release.yml@refs/heads/main'

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Direct local npm publish is disabled. Use the GitHub Actions release workflow.')
assert.equal(process.env.GITHUB_REPOSITORY, expectedRepository, `Publishing is restricted to ${expectedRepository}.`)
assert.equal(process.env.GITHUB_REF, expectedRef, 'Publishing is restricted to the main branch.')
assert.ok(
  process.env.GITHUB_WORKFLOW_REF?.endsWith(workflowSuffix),
  'Publishing is restricted to .github/workflows/release.yml from main.',
)
assert.ok(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'GitHub OIDC request URL is unavailable. Ensure id-token: write is granted.')
assert.ok(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'GitHub OIDC request token is unavailable. Ensure id-token: write is granted.')
assert.equal(process.env.NODE_AUTH_TOKEN, undefined, 'Trusted Publishing must not use NODE_AUTH_TOKEN.')
assert.equal(process.env.NPM_TOKEN, undefined, 'Trusted Publishing must not use NPM_TOKEN.')

console.log('Trusted Publishing runtime context is valid.')
