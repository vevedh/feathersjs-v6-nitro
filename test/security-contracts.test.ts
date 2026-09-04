import { describe, expect, it } from 'vitest'
import {
  applySecurityResponsePolicy,
  createLimitedBodyStream,
  createRequestId,
  createRequestTimeoutController,
  resolveRoutingOptions,
  resolveSecurityOptions,
  validateRequestBeforeFeathers,
} from '../src/runtime/security.js'
import { applyFeathersV6NitroResponsePolicy } from '../src/runtime/response.js'

describe('security option and response branch contracts', () => {
  it('rejects invalid routing and security option combinations', () => {
    expect(() => resolveRoutingOptions({ mountExact: false, mountWildcard: false })).toThrow(/mount at least one/u)
    expect(() => resolveRoutingOptions({ methods: ['TRACE' as never] })).toThrow(/supported HTTP methods/u)
    expect(() => resolveSecurityOptions({ maxBodySize: -1 })).toThrow(/maxBodySize/u)
    expect(() => resolveSecurityOptions({ cors: { origins: [] } })).toThrow(/at least one origin/u)
    expect(() => resolveSecurityOptions({ cors: { origins: ['https://example.test/path'] } })).toThrow(/exact HTTP\(S\) origins/u)
    expect(() => resolveSecurityOptions({ cors: { origins: ['*'], credentials: true } })).toThrow(/credentials/u)
    expect(() => resolveSecurityOptions({ cors: { origins: ['https://example.test'], headers: ['bad header'] } })).toThrow(/valid HTTP header names/u)
    expect(() => resolveSecurityOptions({ requestId: { headerName: 'bad header' } })).toThrow(/valid HTTP header name/u)
  })

  it('supports disabled request ids and rejects invalid incoming correlation ids', () => {
    const disabled = resolveSecurityOptions({ requestId: false })
    expect(createRequestId(new Request('https://service.test/'), disabled)).toBeUndefined()

    const accepting = resolveSecurityOptions({ requestId: { acceptIncoming: true } })
    const request = new Request('https://service.test/', {
      headers: { 'x-request-id': ' invalid correlation id ' },
    })
    const generated = createRequestId(request, accepting)
    expect(generated).toMatch(/^[0-9a-f-]{36}$/u)
  })

  it('rejects malformed and oversized Content-Length values before Feathers', async () => {
    const routing = resolveRoutingOptions(undefined)
    const security = resolveSecurityOptions({ maxBodySize: 8 })

    const malformed = validateRequestBeforeFeathers(
      new Request('https://service.test/api', { method: 'POST', headers: { 'content-length': 'NaN' } }),
      routing,
      security,
      'request-a',
    )
    expect(malformed?.status).toBe(400)
    await expect(malformed?.json()).resolves.toMatchObject({ className: 'bad-request' })

    const oversized = validateRequestBeforeFeathers(
      new Request('https://service.test/api', { method: 'POST', headers: { 'content-length': '9' } }),
      routing,
      security,
      'request-b',
    )
    expect(oversized?.status).toBe(413)
    await expect(oversized?.json()).resolves.toMatchObject({ className: 'payload-too-large' })
  })

  it('covers CORS preflight method and header rejection plus wildcard success', async () => {
    const routing = resolveRoutingOptions(undefined)
    const restricted = resolveSecurityOptions({
      cors: {
        origins: ['https://allowed.example'],
        methods: ['GET', 'OPTIONS'],
        headers: ['content-type'],
      },
    })

    const disallowedMethod = validateRequestBeforeFeathers(new Request('https://service.test/api', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.example',
        'access-control-request-method': 'POST',
      },
    }), routing, restricted)
    expect(disallowedMethod?.status).toBe(405)

    const disallowedHeader = validateRequestBeforeFeathers(new Request('https://service.test/api', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-private-header',
      },
    }), routing, restricted)
    expect(disallowedHeader?.status).toBe(403)

    const wildcard = resolveSecurityOptions({
      requestId: false,
      cors: {
        origins: ['*'],
        methods: ['GET', 'OPTIONS'],
        headers: ['content-type'],
        exposedHeaders: ['x-public'],
      },
    })
    const accepted = validateRequestBeforeFeathers(new Request('https://service.test/api', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://other.example',
        'access-control-request-method': 'GET',
      },
    }), routing, wildcard)
    expect(accepted?.status).toBe(204)
    expect(accepted?.headers.get('access-control-allow-origin')).toBe('*')
    expect(accepted?.headers.get('access-control-expose-headers')).toBe('x-public')
    expect(accepted?.headers.has('x-request-id')).toBe(false)
  })

  it('preserves or strips Feathers CORS headers according to the explicit response policy', () => {
    const original = new Response('ok', {
      status: 202,
      headers: {
        'access-control-allow-origin': 'https://feathers.example',
        'access-control-max-age': '600',
        'x-custom': 'present',
      },
    })

    const preserved = applyFeathersV6NitroResponsePolicy(original, true)
    expect(preserved).toBe(original)

    const stripped = applyFeathersV6NitroResponsePolicy(original, false)
    expect(stripped.status).toBe(202)
    expect(stripped.headers.get('access-control-allow-origin')).toBeNull()
    expect(stripped.headers.get('access-control-max-age')).toBeNull()
    expect(stripped.headers.get('x-custom')).toBe('present')
  })

  it('applies SSE, request-id, CORS and internal-error response policy branches', async () => {
    const request = new Request('https://service.test/api', {
      headers: { origin: 'https://allowed.example' },
    })
    const security = resolveSecurityOptions({
      cors: {
        origins: ['https://allowed.example'],
        exposedHeaders: ['x-public'],
      },
    })
    const sse = applySecurityResponsePolicy(
      request,
      new Response('data: {}\n\n', {
        headers: {
          'content-type': 'text/event-stream',
          'access-control-allow-origin': 'https://stale.example',
        },
      }),
      security,
      'request-42',
      true,
    )
    expect(sse.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(sse.headers.get('x-accel-buffering')).toBe('no')
    expect(sse.headers.get('x-request-id')).toBe('request-42')
    expect(sse.headers.get('access-control-allow-origin')).toBe('https://allowed.example')
    expect(sse.headers.get('access-control-expose-headers')).toBe('x-public')

    const redacted = applySecurityResponsePolicy(
      new Request('https://service.test/api'),
      new Response('secret stack', { status: 503 }),
      resolveSecurityOptions(undefined),
      undefined,
      false,
    )
    expect(redacted.status).toBe(503)
    expect(JSON.stringify(await redacted.json())).not.toContain('secret stack')

    const exposed = applySecurityResponsePolicy(
      new Request('https://service.test/api'),
      new Response('diagnostic detail', { status: 503 }),
      resolveSecurityOptions({ exposeErrors: true, requestId: false }),
      undefined,
      true,
    )
    expect(await exposed.text()).toBe('diagnostic detail')
  })

  it('covers limited-stream completion and cancellation paths', async () => {
    const encoder = new TextEncoder()
    let cancelledWith: unknown
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('ok'))
        controller.close()
      },
      cancel(reason) {
        cancelledWith = reason
      },
    })
    const limited = createLimitedBodyStream(upstream, 16)
    const reader = limited.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('ok')
    expect((await reader.read()).done).toBe(true)

    const cancellableUpstream = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelledWith = reason
      },
    })
    const cancellable = createLimitedBodyStream(cancellableUpstream, 16)
    await cancellable.cancel('consumer-stop')
    expect(cancelledWith).toBe('consumer-stop')
  })

  it('covers already-aborted and zero-timeout request controllers', () => {
    const upstream = new AbortController()
    upstream.abort(new Error('upstream closed'))
    const inherited = createRequestTimeoutController(upstream.signal, 0)
    expect(inherited.signal.aborted).toBe(true)
    expect(inherited.signal.reason).toBe(upstream.signal.reason)
    inherited.clearTimeout()
    inherited.dispose()

    const active = new AbortController()
    const controller = createRequestTimeoutController(active.signal, 0)
    expect(controller.signal.aborted).toBe(false)
    active.abort('stop')
    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe('stop')
    controller.dispose()
  })
})
