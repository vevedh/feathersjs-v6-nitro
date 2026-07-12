import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { feathers, type Params } from 'feathers'
import { createApp, toNodeListener } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { createFeathersV6NitroHandler } from '../src/runtime/handler.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import type {
  FeathersV6NitroRoutingOptions,
  FeathersV6NitroSecurityOptions,
} from '../src/runtime/types.js'
import { createMockNitroApp } from './helpers.js'

class SecurityService {
  async find(params?: Params) {
    if (params?.query?.['slow'] === 'true') {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (params?.query?.['explode'] === 'true') {
      throw new Error('database password must never leak')
    }
    return {
      requestId: params?.nitro?.requestId,
    }
  }

  async create(data: unknown) {
    return data
  }
}

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })))
})

async function startSecurityServer(
  security?: FeathersV6NitroSecurityOptions,
  routing?: FeathersV6NitroRoutingOptions,
): Promise<string> {
  const app = feathers()
  app.use('security', new SecurityService(), { methods: ['find', 'create'] })

  const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
    id: 'security-api',
    app,
    basePath: '/api/security',
    ...(security === undefined ? {} : { security }),
    ...(routing === undefined ? {} : { routing }),
  })

  const h3App = createApp()
  h3App.use(createFeathersV6NitroHandler(entry))
  const server = createServer(toNodeListener(h3App))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

describe('security baseline', () => {
  it('generates a server request id and exposes the same value to Feathers', async () => {
    const baseUrl = await startSecurityServer()
    const response = await fetch(`${baseUrl}/api/security/security`)
    const body = await response.json() as { requestId: string }

    expect(response.status).toBe(200)
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/u)
    expect(response.headers.get('x-request-id')).toBe(body.requestId)
  })

  it('accepts an incoming request id only when explicitly enabled', async () => {
    const baseUrl = await startSecurityServer({
      requestId: { acceptIncoming: true },
    })
    const response = await fetch(`${baseUrl}/api/security/security`, {
      headers: { 'x-request-id': 'client-correlation-42' },
    })

    expect(response.headers.get('x-request-id')).toBe('client-correlation-42')
    expect(await response.json()).toEqual({ requestId: 'client-correlation-42' })
  })

  it('rejects long URLs and disallowed methods before service execution', async () => {
    const baseUrl = await startSecurityServer(
      { maxUrlLength: 256 },
      { methods: ['GET', 'OPTIONS'] },
    )

    const tooLong = await fetch(`${baseUrl}/api/security/security?q=${'x'.repeat(300)}`)
    expect(tooLong.status).toBe(414)

    const disallowed = await fetch(`${baseUrl}/api/security/security`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(disallowed.status).toBe(405)
    expect(disallowed.headers.get('allow')).toBe('GET, OPTIONS')
  })

  it('enforces the body limit for chunked requests without Content-Length', async () => {
    const baseUrl = await startSecurityServer({ maxBodySize: 16 })
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'))
        controller.enqueue(encoder.encode('x'.repeat(32)))
        controller.enqueue(encoder.encode('"}'))
        controller.close()
      },
    })

    const response = await fetch(`${baseUrl}/api/security/security`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 413, className: 'payload-too-large' })
  })

  it('applies an explicit CORS allowlist and rejects unknown preflight origins', async () => {
    const baseUrl = await startSecurityServer({
      cors: {
        origins: ['https://allowed.example'],
        methods: ['GET', 'POST', 'OPTIONS'],
        headers: ['content-type', 'authorization'],
        credentials: true,
      },
    })

    const allowed = await fetch(`${baseUrl}/api/security/security`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example')
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')

    const denied = await fetch(`${baseUrl}/api/security/security`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://denied.example',
        'access-control-request-method': 'GET',
      },
    })
    expect(denied.status).toBe(403)
  })

  it('redacts internal errors by default and can expose them for diagnostics', async () => {
    const baseUrl = await startSecurityServer()
    const redacted = await fetch(`${baseUrl}/api/security/security?explode=true`)
    expect(redacted.status).toBe(500)
    expect(JSON.stringify(await redacted.json())).not.toContain('database password')

    const diagnosticUrl = await startSecurityServer({ exposeErrors: true })
    const exposed = await fetch(`${diagnosticUrl}/api/security/security?explode=true`)
    expect(exposed.status).toBe(500)
    expect(JSON.stringify(await exposed.json())).toContain('database password')
  })

  it('returns 408 when Feathers does not produce response headers before the timeout', async () => {
    const baseUrl = await startSecurityServer({ requestTimeoutMs: 10 })
    const response = await fetch(`${baseUrl}/api/security/security?slow=true`)

    expect(response.status).toBe(408)
    expect(await response.json()).toMatchObject({ code: 408, className: 'timeout' })
  })
})
