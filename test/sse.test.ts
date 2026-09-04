import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { feathers } from 'feathers'
import { createApp, toNodeListener } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFeathersV6NitroHandler } from '../src/runtime/handler.js'
import { setupFeathersV6NitroInstance } from '../src/runtime/lifecycle.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { getFeathersV6NitroSsePath } from '../src/runtime/sse.js'
import { createMockNitroApp } from './helpers.js'

interface Message {
  id: number
  text: string
}

class MessageService {
  private readonly messages: Message[] = []

  async find(): Promise<Message[]> {
    return [...this.messages]
  }

  async create(data: Pick<Message, 'text'>): Promise<Message> {
    const message = { id: this.messages.length + 1, text: data.text }
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

async function readPayload(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 2000,
): Promise<{ event: string, data: unknown, path?: string }> {
  const decoder = new TextDecoder()
  let buffer = ''
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for SSE payload.')), timeoutMs)
    timer.unref()
  })

  while (!buffer.includes('\n\n')) {
    const chunk = await Promise.race([reader.read(), timeout])
    if (chunk.done) {
      throw new Error('SSE stream ended before a payload was received.')
    }
    buffer += decoder.decode(chunk.value, { stream: true })
  }

  const line = buffer.split('\n').find(value => value.startsWith('data: '))
  if (!line) {
    throw new Error('SSE payload did not contain a data line.')
  }
  return JSON.parse(line.slice(6)) as { event: string, data: unknown, path?: string }
}

async function startSseServer(heartbeatIntervalMs = 0) {
  const app = feathers()
  app.use('messages', new MessageService(), { methods: ['find', 'create'] })
  app.on('connection', connection => app.channel('all').join(connection))
  app.publish(() => app.channel('all'))

  const disconnect = vi.fn()
  app.on('disconnect', disconnect)

  const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
    id: 'realtime',
    app,
    basePath: '/api/realtime',
    sse: {
      path: 'events',
      heartbeatIntervalMs,
      maxBufferedEvents: 10,
    },
  })

  const h3App = createApp()
  h3App.use(createFeathersV6NitroHandler(entry))
  const server = createServer(toNodeListener(h3App))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return {
    app,
    entry,
    disconnect,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
  }
}

describe('native Feathers v6 SSE transport', () => {
  it('registers an isolated SSE service before application setup', async () => {
    const app = feathers()
    const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
      app,
      basePath: '/api/feathers',
      sse: { path: 'events' },
    })

    expect(app.services.events).toBeUndefined()
    await setupFeathersV6NitroInstance(entry)
    expect(app.services.events).toBeDefined()
    expect(getFeathersV6NitroSsePath(entry)).toBe('/api/feathers/events')
  })

  it('streams connected and service-created events, then cleans up on abort', async () => {
    const { app, baseUrl, disconnect } = await startSseServer()
    const publishListenersBefore = app.listeners('publish').length
    const controller = new AbortController()
    const response = await fetch(`${baseUrl}/api/realtime/events`, { signal: controller.signal })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(app.listeners('publish')).toHaveLength(publishListenersBefore + 1)

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Expected an SSE response body.')
    }

    expect(await readPayload(reader)).toMatchObject({
      event: 'connected',
      path: 'events',
    })

    const created = await fetch(`${baseUrl}/api/realtime/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'realtime message' }),
    })
    expect(created.status).toBe(201)

    expect(await readPayload(reader)).toMatchObject({
      event: 'created',
      path: 'messages',
      data: { id: 1, text: 'realtime message' },
    })

    await reader.cancel()
    controller.abort()
    await vi.waitFor(() => {
      expect(disconnect).toHaveBeenCalledTimes(1)
      expect(app.listeners('publish')).toHaveLength(publishListenersBefore)
    }, { timeout: 2000, interval: 20 })
  })

  it('emits heartbeat payloads without exposing the Nitro event', async () => {
    const { baseUrl } = await startSseServer(20)
    const controller = new AbortController()
    const response = await fetch(`${baseUrl}/api/realtime/events`, { signal: controller.signal })
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Expected an SSE response body.')
    }

    await readPayload(reader)
    const heartbeat = await readPayload(reader)
    expect(heartbeat).toMatchObject({ event: 'heartbeat', path: 'events' })
    expect(JSON.stringify(heartbeat)).not.toContain('nitro')
    await reader.cancel()
    controller.abort()
  })
})
