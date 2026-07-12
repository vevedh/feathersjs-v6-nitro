import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { feathers, type Params } from 'feathers'
import { createApp, toNodeListener } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { createFeathersV6NitroHandler } from '../src/runtime/handler.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createMockNitroApp } from './helpers.js'

interface Message {
  id: number
  text: string
  instanceId?: string
}

class MessageService {
  readonly messages: Message[] = [{ id: 1, text: 'hello' }]

  async find(params?: Params): Promise<{ data: Message[], instanceId?: string }> {
    const instanceId = params?.nitro?.instanceId
    return {
      data: this.messages,
      ...(instanceId === undefined ? {} : { instanceId }),
    }
  }

  async get(id: string | number): Promise<Message> {
    const message = this.messages.find(item => String(item.id) === String(id))
    if (!message) {
      throw new Error('not found')
    }
    return message
  }

  async create(data: Omit<Message, 'id'>, params?: Params): Promise<Message> {
    const instanceId = params?.nitro?.instanceId
    const message: Message = {
      id: this.messages.length + 1,
      text: data.text,
      ...(instanceId === undefined ? {} : { instanceId }),
    }
    this.messages.push(message)
    return message
  }
}

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })))
})

async function startFeathersServer(preserveCors = false): Promise<string> {
  const app = feathers()
  app.use('messages', new MessageService(), {
    methods: ['find', 'get', 'create'],
  })

  const nitroApp = createMockNitroApp()
  const entry = getFeathersV6NitroRegistry(nitroApp).register({
    id: 'main-api',
    app,
    basePath: '/api/feathers',
    preserveFeathersCorsHeaders: preserveCors,
  })

  const h3App = createApp()
  h3App.use(createFeathersV6NitroHandler(entry))
  const server = createServer(toNodeListener(h3App))
  servers.push(server)

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

describe('native Feathers v6 Nitro handler', () => {
  it('rewrites the mount path and exposes Nitro request context', async () => {
    const baseUrl = await startFeathersServer()
    const response = await fetch(`${baseUrl}/api/feathers/messages?$limit=10`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [{ id: 1, text: 'hello' }],
      instanceId: 'main-api',
    })
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('forwards JSON request bodies through Web Standard Request', async () => {
    const baseUrl = await startFeathersServer()
    const response = await fetch(`${baseUrl}/api/feathers/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '<script>alert(1)</script>' }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 2,
      text: '<script>alert(1)</script>',
      instanceId: 'main-api',
    })
  })

  it('can preserve Feathers CORS headers only when explicitly enabled', async () => {
    const baseUrl = await startFeathersServer(true)
    const response = await fetch(`${baseUrl}/api/feathers/messages`, {
      headers: { origin: 'https://client.example.invalid' },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe('https://client.example.invalid')
  })
})
