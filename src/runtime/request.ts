import type { H3Event } from 'h3'
import { toWebRequest } from 'h3'
import { rewriteRequestUrl } from './path.js'
import { createLimitedBodyStream, createRequestTimeoutController, type RequestTimeoutController } from './security.js'
import type { ResolvedFeathersV6NitroSecurityOptions } from './types.js'

const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

type StreamingRequestInit = RequestInit & { duplex?: 'half' }

export interface FeathersV6NitroPreparedRequest {
  readonly original: Request
  readonly request: Request
  readonly timeout: RequestTimeoutController
}

function createRequestLifecycleController(
  event: H3Event,
  upstream: AbortSignal,
  timeoutMs: number,
): RequestTimeoutController {
  const lifecycle = new AbortController()
  const abortFromUpstream = () => lifecycle.abort(upstream.reason)
  const abortFromRequest = () => lifecycle.abort(new DOMException('Client aborted request.', 'AbortError'))
  const abortFromResponse = () => lifecycle.abort(new DOMException('Client disconnected.', 'AbortError'))

  if (upstream.aborted) {
    abortFromUpstream()
  }
  else {
    upstream.addEventListener('abort', abortFromUpstream, { once: true })
  }
  event.node.req.once('aborted', abortFromRequest)
  event.node.res.once('close', abortFromResponse)

  const timeout = createRequestTimeoutController(lifecycle.signal, timeoutMs)
  return {
    signal: timeout.signal,
    clearTimeout() {
      timeout.clearTimeout()
    },
    dispose() {
      timeout.dispose()
      upstream.removeEventListener('abort', abortFromUpstream)
      event.node.req.removeListener('aborted', abortFromRequest)
      event.node.res.removeListener('close', abortFromResponse)
    },
  }
}

export function createFeathersV6Request(
  event: H3Event,
  basePath: string,
  security: ResolvedFeathersV6NitroSecurityOptions,
): FeathersV6NitroPreparedRequest {
  const original = toWebRequest(event)
  const timeout = createRequestLifecycleController(event, original.signal, security.requestTimeoutMs)
  const url = rewriteRequestUrl(original.url, basePath)
  const init: StreamingRequestInit = {
    method: original.method,
    headers: original.headers,
    signal: timeout.signal,
  }

  if (!BODYLESS_METHODS.has(original.method.toUpperCase()) && original.body) {
    init.body = createLimitedBodyStream(original.body, security.maxBodySize)
    init.duplex = 'half'
  }

  return {
    original,
    request: new Request(url, init),
    timeout,
  }
}
