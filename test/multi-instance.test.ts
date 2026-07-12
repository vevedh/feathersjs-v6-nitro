import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { feathers, type Params } from 'feathers'
import { createApp, createError, eventHandler, toNodeListener } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { createFeathersV6NitroHandler } from '../src/runtime/handler.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createMockNitroApp } from './helpers.js'

class IdentityService {
  constructor(private readonly value: string) {}

  async find(params?: Params) {
    return {
      value: this.value,
      instanceId: params?.nitro?.instanceId,
      tenant: params?.nitro?.metadata['tenant'],
    }
  }
}

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })))
})

describe('multi-instance HTTP isolation', () => {
  it('keeps applications, metadata and lifecycle state isolated', async () => {
    const firstApp = feathers()
    const secondApp = feathers()
    firstApp.use('identity', new IdentityService('first'), { methods: ['find'] })
    secondApp.use('identity', new IdentityService('second'), { methods: ['find'] })

    const registry = getFeathersV6NitroRegistry(createMockNitroApp())
    const [first, second] = registry.registerMany([
      { id: 'first', app: firstApp, basePath: '/api/first', metadata: { tenant: 'tenant-a' } },
      { id: 'second', app: secondApp, basePath: '/api/second', metadata: { tenant: 'tenant-b' } },
    ])
    if (!first || !second) {
      throw new Error('Expected both test instances to be registered.')
    }

    const handlers = new Map([
      ['first', createFeathersV6NitroHandler(first)],
      ['second', createFeathersV6NitroHandler(second)],
    ])
    const h3App = createApp()
    h3App.use(eventHandler(async (event) => {
      const pathname = event.path.split('?')[0] ?? '/'
      const entry = registry.getByPath(pathname)
      const handler = entry ? handlers.get(entry.options.id) : undefined
      if (!handler) {
        throw createError({ statusCode: 404, statusMessage: 'Instance not found.' })
      }
      return await handler(event)
    }))
    const server = createServer(toNodeListener(h3App))
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${String(address.port)}`

    const firstResponse = await fetch(`${baseUrl}/api/first/identity`)
    const secondResponse = await fetch(`${baseUrl}/api/second/identity`)

    expect(await firstResponse.json()).toEqual({ value: 'first', instanceId: 'first', tenant: 'tenant-a' })
    expect(await secondResponse.json()).toEqual({ value: 'second', instanceId: 'second', tenant: 'tenant-b' })
    expect(first.status).toBe('ready')
    expect(second.status).toBe('ready')
    expect(first.options.app).not.toBe(second.options.app)
  })
})
