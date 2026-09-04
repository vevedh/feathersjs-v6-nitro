import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readJson = async relativePath => JSON.parse(
  await readFile(new URL(relativePath, import.meta.url), 'utf8'),
)

const root = await readJson('../package.json')
const playground = await readJson('../playground/nuxt-app/package.json')

const expected = Object.freeze({
  node: '^22.19.0 || ^24.11.0 || >=26.0.0',
  packageManager: 'pnpm@9.15.9',
  feathers: '6.0.0-pre.11',
  nuxt: '4.5.2',
  nitropack: '2.13.4',
  h3: '1.15.11',
  vite: '8.2.2',
  vue: '3.5.42',
  vueRouter: '5.2.0',
  testUtils: '4.2.0',
  vitest: '4.1.11',
  vueTsc: '3.3.11',
  typescript: '5.9.3',
  coverageV8: '4.1.11',
  publint: '0.3.24',
  typesNode: '22.20.1',
  typescriptEslint: '8.69.0',
})

assert.equal(root.engines?.node, expected.node)
assert.equal(root.packageManager, expected.packageManager)
assert.equal(root.devDependencies?.feathers, expected.feathers)
assert.equal(root.devDependencies?.nuxt, expected.nuxt)
assert.equal(root.devDependencies?.nitropack, expected.nitropack)
assert.equal(root.devDependencies?.h3, expected.h3)
assert.equal(root.devDependencies?.vite, expected.vite)
assert.equal(root.devDependencies?.['@nuxt/test-utils'], expected.testUtils)
assert.equal(root.devDependencies?.vitest, expected.vitest)
assert.equal(root.devDependencies?.['vue-tsc'], expected.vueTsc)
assert.equal(root.devDependencies?.typescript, expected.typescript)
assert.equal(root.devDependencies?.['@vitest/coverage-v8'], expected.coverageV8)
assert.equal(root.devDependencies?.publint, expected.publint)
assert.equal(root.devDependencies?.['@types/node'], expected.typesNode)
assert.equal(root.devDependencies?.['@typescript-eslint/eslint-plugin'], expected.typescriptEslint)
assert.equal(root.devDependencies?.['@typescript-eslint/parser'], expected.typescriptEslint)
assert.equal(root.devDependencies?.['typescript-eslint'], expected.typescriptEslint)
assert.equal(root.pnpm?.overrides?.vite, expected.vite)
assert.equal(root.pnpm?.overrides?.vue, expected.vue)
assert.equal(root.pnpm?.overrides?.['vue-router'], expected.vueRouter)
assert.equal(root.peerDependencies?.h3, '>=1.15.0 <2.0.0')
assert.equal(root.peerDependencies?.nitropack, '>=2.13.0 <3.0.0')
assert.equal(root.peerDependencies?.feathers, '>=6.0.0-pre.11 <7.0.0')
assert.equal(root.peerDependencies?.nuxt, undefined, 'Nuxt must remain a development validation dependency, not a runtime peer.')
assert.equal(root.peerDependencies?.vite, undefined, 'Vite must remain a development validation dependency, not a runtime peer.')

assert.equal(playground.dependencies?.nuxt, expected.nuxt)
assert.equal(playground.dependencies?.feathers, expected.feathers)
assert.equal(playground.devDependencies?.['vue-tsc'], expected.vueTsc)
assert.equal(playground.devDependencies?.typescript, expected.typescript)

console.log('Toolchain contract is valid.')
