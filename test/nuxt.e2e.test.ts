import { fileURLToPath } from 'node:url'
import { $fetch, fetch as nuxtFetch, setup, url } from '@nuxt/test-utils/e2e'
import { io as createSocket, type Socket } from 'socket.io-client'
import { describe, expect, it } from 'vitest'

interface MessageRecord {
  id: number
  text: string
  createdAt: string
  updatedAt: string
}

interface SecurityProbeResult {
  id: string
  passed: boolean
  status?: number
}

interface DiagnosticResult {
  id: string
  basePath: string
  status: string
}

interface SsePayload {
  event?: string
  path?: string
  data?: unknown
}

interface SocketContextResult {
  provider?: string
  socketId?: string
  playgroundRole?: string
}

await setup({
  rootDir: fileURLToPath(new URL('../playground/nuxt-app', import.meta.url)),
  server: true,
})

function socketCall<T>(socket: Socket, method: string, path: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket.emit(method, path, ...args, (error: unknown, result?: T) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Socket.IO method failed.', { cause: error }))
      }
      else {
        resolve(result as T)
      }
    })
  })
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (payload: SsePayload) => boolean,
): Promise<SsePayload> {
  const decoder = new TextDecoder()
  let buffer = ''
  const timeoutAt = Date.now() + 5000

  while (Date.now() < timeoutAt) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const dataLine = frame.split('\n').find(line => line.startsWith('data: '))
      if (!dataLine) continue
      const payload = JSON.parse(dataLine.slice(6)) as SsePayload
      if (predicate(payload)) return payload
    }
  }

  throw new Error('Expected SSE payload was not received.')
}

describe('Nuxt 4 full-feature playground', () => {
  it('serves the interactive playground page', async () => {
    const response = await nuxtFetch('/')
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Playground fonctionnel HTTP, SSE et Socket.IO')
  })

  it('supports complete Feathers v6 CRUD through Nitro HTTP', async () => {
    const initial = await $fetch<MessageRecord[]>('/api/feathers/messages')
    expect(initial[0]?.text).toContain('Feathers v6')

    const created = await $fetch<MessageRecord>('/api/feathers/messages', {
      method: 'POST',
      body: { text: 'E2E Nuxt 4 CRUD' },
    })
    expect(created.text).toBe('E2E Nuxt 4 CRUD')

    await expect($fetch<MessageRecord>(`/api/feathers/messages/${String(created.id)}`)).resolves.toEqual(created)

    const updated = await $fetch<MessageRecord>(`/api/feathers/messages/${String(created.id)}`, {
      method: 'PUT',
      body: { text: 'E2E remplacement' },
    })
    expect(updated.text).toBe('E2E remplacement')

    const patched = await $fetch<MessageRecord>(`/api/feathers/messages/${String(created.id)}`, {
      method: 'PATCH',
      body: { text: 'E2E patch' },
    })
    expect(patched.text).toBe('E2E patch')

    const removed = await $fetch<MessageRecord>(`/api/feathers/messages/${String(created.id)}`, {
      method: 'DELETE',
    })
    expect(removed.id).toBe(created.id)
  })

  it('keeps three Feathers applications isolated and exposes redacted diagnostics', async () => {
    const response = await nuxtFetch('/api/admin-feathers/status')
    expect(await response.json()).toEqual({
      status: 'ready',
      instanceId: 'playground-admin',
      scope: 'admin',
      provider: 'rest',
    })
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/u)

    const diagnostics = await $fetch<DiagnosticResult[]>('/api/playground/diagnostics')
    expect(diagnostics.map(item => item.id)).toEqual(expect.arrayContaining([
      'playground-api',
      'playground-admin',
      'playground-security-lab',
    ]))
    expect(JSON.stringify(diagnostics)).not.toContain('metadata')
    expect(JSON.stringify(diagnostics)).not.toContain('services')
  })

  it('validates every security baseline probe from the playground', async () => {
    const results = await $fetch<SecurityProbeResult[]>('/api/playground/security-probes', {
      method: 'POST',
    })
    expect(results).toHaveLength(8)
    expect(results.every(result => result.passed)).toBe(true)
    expect(results.find(result => result.id === 'body-limit')?.status).toBe(413)
    expect(results.find(result => result.id === 'timeout')?.status).toBe(408)
    expect(results.find(result => result.id === 'cors-denied')?.status).toBe(403)
  })

  it('streams service events through native SSE', async () => {
    const abortController = new AbortController()
    const response = await nuxtFetch('/api/feathers/events', {
      signal: abortController.signal,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    if (!response.body) {
      throw new Error('SSE response body is missing.')
    }
    const reader = response.body.getReader()

    try {
      await readSseUntil(reader, payload => payload.event === 'connected')
      const eventPromise = readSseUntil(reader, payload => payload.event === 'created' && payload.path === 'messages')
      const created = await $fetch<MessageRecord>('/api/feathers/messages', {
        method: 'POST',
        body: { text: 'E2E SSE event' },
      })
      const payload = await eventPromise
      expect(payload.data).toMatchObject({ id: created.id, text: 'E2E SSE event' })
      await $fetch(`/api/feathers/messages/${String(created.id)}`, { method: 'DELETE' })
    }
    finally {
      abortController.abort()
      await reader.cancel().catch(() => undefined)
    }
  })

  it('serves methods, authorization context and channel events through Socket.IO', async () => {
    const bootstrap = await nuxtFetch('/_feathers/socket.io/bootstrap')
    expect(bootstrap.status).toBe(204)

    const socket = createSocket(url('/'), {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    })

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })

      const context = await socketCall<SocketContextResult>(socket, 'find', 'transport-context', {})
      expect(context).toMatchObject({
        provider: 'socketio',
        playgroundRole: 'tester',
      })
      expect(context.socketId).toBe(socket.id)

      const found = await socketCall<MessageRecord[]>(socket, 'find', 'messages', {})
      expect(found[0]?.text).toContain('Feathers v6')

      const received = new Promise<MessageRecord>(resolve => socket.once('messages created', resolve))
      const created = await socketCall<MessageRecord>(
        socket,
        'create',
        'messages',
        { text: 'E2E Socket.IO' },
        {},
      )

      expect(created.text).toBe('E2E Socket.IO')
      await expect(received).resolves.toEqual(created)
      const patched = await socketCall<MessageRecord>(
        socket,
        'patch',
        'messages',
        created.id,
        { text: 'E2E Socket.IO patch' },
        {},
      )
      expect(patched.text).toBe('E2E Socket.IO patch')
      await socketCall<MessageRecord>(socket, 'remove', 'messages', created.id, {})
    }
    finally {
      socket.disconnect()
    }
  })
})
