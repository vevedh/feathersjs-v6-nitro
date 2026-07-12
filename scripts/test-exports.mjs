import assert from 'node:assert/strict'

const main = await import('../dist/index.mjs')
const security = await import('../dist/runtime/security.mjs')
const sse = await import('../dist/runtime/sse.mjs')
const define = await import('../dist/runtime/define.mjs')
const diagnostics = await import('../dist/runtime/diagnostics.mjs')
const socketIo = await import('../dist/socket.io.mjs')

assert.equal(typeof main.createFeathersV6NitroPlugin, 'function')
assert.equal(typeof main.createFeathersV6MultiNitroPlugin, 'function')
assert.equal(typeof security.resolveSecurityOptions, 'function')
assert.equal(typeof security.createFeathersV6NitroMiddleware, 'function')
assert.equal(typeof sse.FeathersV6NitroSseService, 'function')
assert.equal(typeof sse.getFeathersV6NitroSsePath, 'function')

assert.equal(typeof define.defineFeathersV6NitroInstance, 'function')
assert.equal(typeof diagnostics.getFeathersV6NitroDiagnostics, 'function')
assert.equal(typeof socketIo.createFeathersV6NitroSocketIoPlugin, 'function')
assert.equal(typeof socketIo.FeathersV6NitroSocketIoTransport, 'function')
