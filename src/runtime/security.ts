import { randomUUID } from 'node:crypto'
import { BadRequest, FeathersError } from 'feathers/errors'
import {
  BODY_METHODS,
  errorHandler,
  queryParser,
  type HandlerContext,
  type Middleware,
} from 'feathers/http'
import type {
  FeathersV6NitroHttpMethod,
  FeathersV6NitroRoutingOptions,
  FeathersV6NitroSecurityOptions,
  ResolvedFeathersV6NitroCorsOptions,
  ResolvedFeathersV6NitroRoutingOptions,
  ResolvedFeathersV6NitroSecurityOptions,
} from './types.js'

export const DEFAULT_HTTP_METHODS: readonly FeathersV6NitroHttpMethod[] = Object.freeze([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

const DEFAULT_CORS_HEADERS = Object.freeze([
  'accept',
  'accept-language',
  'content-language',
  'content-type',
  'range',
  'authorization',
  'x-service-method',
])
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
const REQUEST_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u
const BODY_METHOD_SET = new Set(BODY_METHODS)

export class FeathersV6NitroPayloadTooLargeError extends FeathersError {
  constructor(maxBodySize: number) {
    super(
      `Request body exceeds the configured limit of ${String(maxBodySize)} bytes.`,
      'PayloadTooLarge',
      413,
      'payload-too-large',
      { maxBodySize },
    )
  }
}

function assertIntegerInRange(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be a safe integer between ${String(minimum)} and ${String(maximum)}.`)
  }
  return value
}

function normalizeMethods(
  methods: readonly FeathersV6NitroHttpMethod[] | undefined,
): readonly FeathersV6NitroHttpMethod[] {
  const normalized = [...new Set((methods ?? DEFAULT_HTTP_METHODS).map(method => method.toUpperCase() as FeathersV6NitroHttpMethod))]
  if (normalized.length === 0 || normalized.some(method => !DEFAULT_HTTP_METHODS.includes(method))) {
    throw new TypeError('Feathers Nitro routing methods must contain supported HTTP methods.')
  }
  return Object.freeze(normalized)
}

function normalizeHeaderNames(values: readonly string[] | undefined, fallback: readonly string[] = []): readonly string[] {
  const result = [...new Set((values ?? fallback).map(value => value.trim().toLowerCase()))]
  if (result.some(value => !HEADER_NAME_PATTERN.test(value))) {
    throw new TypeError('Feathers Nitro CORS headers must contain valid HTTP header names.')
  }
  return Object.freeze(result)
}

function normalizeOrigins(origins: readonly string[]): readonly string[] {
  if (origins.length === 0) {
    throw new TypeError('Feathers Nitro CORS origins must contain at least one origin.')
  }

  const normalized = origins.map((origin) => {
    const trimmed = origin.trim()
    if (trimmed === '*') {
      return trimmed
    }

    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol) || trimmed !== url.origin) {
      throw new TypeError(`Invalid CORS origin "${trimmed}". Origins must be exact HTTP(S) origins.`)
    }
    return url.origin
  })

  return Object.freeze([...new Set(normalized)])
}

export function resolveRoutingOptions(
  options: FeathersV6NitroRoutingOptions | undefined,
): ResolvedFeathersV6NitroRoutingOptions {
  const mountExact = options?.mountExact !== false
  const mountWildcard = options?.mountWildcard !== false
  if (!mountExact && !mountWildcard) {
    throw new TypeError('Feathers Nitro routing must mount at least one exact or wildcard route.')
  }

  return Object.freeze({
    methods: normalizeMethods(options?.methods),
    mountExact,
    mountWildcard,
  })
}

export function resolveSecurityOptions(
  options: FeathersV6NitroSecurityOptions | undefined,
): ResolvedFeathersV6NitroSecurityOptions {
  const maxBodySize = assertIntegerInRange('security.maxBodySize', options?.maxBodySize ?? 1_048_576, 0, 1_073_741_824)
  const maxUrlLength = assertIntegerInRange('security.maxUrlLength', options?.maxUrlLength ?? 8192, 256, 65_536)
  const requestTimeoutMs = assertIntegerInRange('security.requestTimeoutMs', options?.requestTimeoutMs ?? 30_000, 0, 3_600_000)

  let cors: false | ResolvedFeathersV6NitroCorsOptions = false
  if (options?.cors) {
    const origins = normalizeOrigins(options.cors.origins)
    const credentials = options.cors.credentials === true
    if (credentials && origins.includes('*')) {
      throw new TypeError('Feathers Nitro CORS cannot combine origin "*" with credentials.')
    }

    cors = Object.freeze({
      origins,
      methods: normalizeMethods(options.cors.methods),
      headers: normalizeHeaderNames(options.cors.headers, DEFAULT_CORS_HEADERS),
      exposedHeaders: normalizeHeaderNames(options.cors.exposedHeaders),
      credentials,
      maxAge: assertIntegerInRange('security.cors.maxAge', options.cors.maxAge ?? 600, 0, 86_400),
    })
  }

  let requestId: ResolvedFeathersV6NitroSecurityOptions['requestId'] = Object.freeze({
    headerName: 'x-request-id',
    acceptIncoming: false,
  })
  if (options?.requestId === false) {
    requestId = false
  }
  else if (options?.requestId) {
    const headerName = options.requestId.headerName === undefined
      ? 'x-request-id'
      : options.requestId.headerName.trim().toLowerCase()
    if (!HEADER_NAME_PATTERN.test(headerName)) {
      throw new TypeError('security.requestId.headerName must be a valid HTTP header name.')
    }
    requestId = Object.freeze({
      headerName,
      acceptIncoming: options.requestId.acceptIncoming === true,
    })
  }

  return Object.freeze({
    maxBodySize,
    maxUrlLength,
    requestTimeoutMs,
    exposeErrors: options?.exposeErrors === true,
    cors,
    requestId,
  })
}

export function createRequestId(request: Request, security: ResolvedFeathersV6NitroSecurityOptions): string | undefined {
  if (security.requestId === false) {
    return undefined
  }

  if (security.requestId.acceptIncoming) {
    const incoming = request.headers.get(security.requestId.headerName)?.trim()
    if (incoming && REQUEST_ID_PATTERN.test(incoming)) {
      return incoming
    }
  }

  return randomUUID()
}

async function drainReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    while (!(await reader.read()).done) {
      // Drain the upstream H3 stream to avoid enqueueing into a cancelled controller.
    }
  }
  catch {
    // The client may disconnect while the remaining request body is drained.
  }
}

export function createLimitedBodyStream(
  body: ReadableStream<Uint8Array>,
  maxBodySize: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let total = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }

        total += value.byteLength
        if (total > maxBodySize) {
          controller.error(new FeathersV6NitroPayloadTooLargeError(maxBodySize))
          void drainReader(reader)
          return
        }
        controller.enqueue(value)
      }
      catch (error: unknown) {
        controller.error(error)
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

async function readBodyBytes(request: Request, maxBodySize: number): Promise<Uint8Array> {
  if (!request.body) {
    return new Uint8Array()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  let completed = false
  while (!completed) {
    const { done, value } = await reader.read()
    if (done) {
      completed = true
      continue
    }

    total += value.byteLength
    if (total > maxBodySize) {
      void drainReader(reader)
      throw new FeathersV6NitroPayloadTooLargeError(maxBodySize)
    }
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function formDataToObject(formData: FormData): Record<string, File | string | (File | string)[]> {
  const result: Record<string, File | string | (File | string)[]> = Object.create(null) as Record<string, File | string | (File | string)[]>
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key) as (File | string)[]
    const [first] = values
    result[key] = values.length === 1 && first !== undefined ? first : values
  }
  return result
}

export function secureBodyParser(maxBodySize: number): Middleware {
  return async (context: HandlerContext, next) => {
    if (!BODY_METHOD_SET.has(context.request.method)) {
      await next()
      return
    }

    const contentType = context.request.headers.get('content-type')?.toLowerCase() ?? ''
    try {
      if (contentType.includes('application/json')) {
        const bytes = await readBodyBytes(context.request.clone(), maxBodySize)
        if (bytes.byteLength === 0) {
          throw new BadRequest('Invalid request body')
        }
        context.data = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
      }
      else if (contentType.includes('application/x-www-form-urlencoded')) {
        const bytes = await readBodyBytes(context.request.clone(), maxBodySize)
        context.data = Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)))
      }
      else if (contentType.includes('multipart/form-data')) {
        const bytes = await readBodyBytes(context.request.clone(), maxBodySize)
        const multipartRequest = new Request(context.request.url, {
          method: context.request.method,
          headers: context.request.headers,
          body: bytes as BodyInit,
        })
        context.data = formDataToObject(await multipartRequest.formData()) as unknown as Record<string, unknown>
      }
      else {
        context.data = context.request.body as unknown as Record<string, unknown>
      }
    }
    catch (error: unknown) {
      if (error instanceof FeathersV6NitroPayloadTooLargeError || error instanceof BadRequest) {
        throw error
      }
      throw new BadRequest('Invalid request body')
    }

    await next()
  }
}

export function createFeathersV6NitroMiddleware(
  maxBodySize: number,
  additional: readonly Middleware[],
): Middleware[] {
  return [
    errorHandler(),
    queryParser(),
    secureBodyParser(maxBodySize),
    ...additional,
  ]
}

function createErrorBody(status: number, name: string, className: string, message: string, requestId?: string) {
  return {
    name,
    message,
    code: status,
    className,
    ...(requestId === undefined ? {} : { data: { requestId } }),
  }
}

export function createSecurityResponse(
  status: number,
  name: string,
  className: string,
  message: string,
  requestId?: string,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('cache-control', 'no-store')
  return Response.json(createErrorBody(status, name, className, message, requestId), {
    status,
    headers: responseHeaders,
  })
}

export function validateRequestBeforeFeathers(
  request: Request,
  routing: ResolvedFeathersV6NitroRoutingOptions,
  security: ResolvedFeathersV6NitroSecurityOptions,
  requestId?: string,
): Response | undefined {
  if (request.url.length > security.maxUrlLength) {
    return createSecurityResponse(414, 'URITooLong', 'uri-too-long', 'Request URL is too long.', requestId)
  }

  const method = request.method.toUpperCase() as FeathersV6NitroHttpMethod
  if (!routing.methods.includes(method)) {
    return createSecurityResponse(
      405,
      'MethodNotAllowed',
      'method-not-allowed',
      `Method ${method} is not allowed for this Feathers Nitro instance.`,
      requestId,
      { allow: routing.methods.join(', ') },
    )
  }

  const contentLengthValue = request.headers.get('content-length')
  if (contentLengthValue) {
    const contentLength = Number(contentLengthValue)
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return createSecurityResponse(400, 'BadRequest', 'bad-request', 'Invalid Content-Length header.', requestId)
    }
    if (contentLength > security.maxBodySize) {
      return createSecurityResponse(
        413,
        'PayloadTooLarge',
        'payload-too-large',
        `Request body exceeds the configured limit of ${String(security.maxBodySize)} bytes.`,
        requestId,
      )
    }
  }

  return createCorsPreflightResponse(request, security, requestId)
}

function isOriginAllowed(origin: string, cors: ResolvedFeathersV6NitroCorsOptions): boolean {
  return cors.origins.includes('*') || cors.origins.includes(origin)
}

function appendVary(headers: Headers, values: readonly string[]): void {
  const existing = headers.get('vary')?.split(',').map(value => value.trim()).filter(Boolean) ?? []
  headers.set('vary', [...new Set([...existing, ...values])].join(', '))
}

function applyCorsHeaders(headers: Headers, origin: string, cors: ResolvedFeathersV6NitroCorsOptions): void {
  headers.set('access-control-allow-origin', cors.origins.includes('*') ? '*' : origin)
  if (cors.credentials) {
    headers.set('access-control-allow-credentials', 'true')
  }
  if (cors.exposedHeaders.length > 0) {
    headers.set('access-control-expose-headers', cors.exposedHeaders.join(', '))
  }
  appendVary(headers, ['Origin'])
}

function createCorsPreflightResponse(
  request: Request,
  security: ResolvedFeathersV6NitroSecurityOptions,
  requestId?: string,
): Response | undefined {
  if (request.method !== 'OPTIONS' || !request.headers.has('access-control-request-method')) {
    return undefined
  }

  const origin = request.headers.get('origin')
  if (!origin || security.cors === false || !isOriginAllowed(origin, security.cors)) {
    return createSecurityResponse(403, 'Forbidden', 'forbidden', 'CORS origin is not allowed.', requestId)
  }

  const requestedMethod = request.headers.get('access-control-request-method')?.toUpperCase() as FeathersV6NitroHttpMethod
  if (!security.cors.methods.includes(requestedMethod)) {
    return createSecurityResponse(405, 'MethodNotAllowed', 'method-not-allowed', 'CORS method is not allowed.', requestId, {
      allow: security.cors.methods.join(', '),
    })
  }

  const requestedHeaders = request.headers.get('access-control-request-headers')
    ?.split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean) ?? []
  if (requestedHeaders.some(header => !security.cors || !security.cors.headers.includes(header))) {
    return createSecurityResponse(403, 'Forbidden', 'forbidden', 'One or more CORS request headers are not allowed.', requestId)
  }

  const headers = new Headers({
    'access-control-allow-methods': security.cors.methods.join(', '),
    'access-control-allow-headers': security.cors.headers.join(', '),
    'access-control-max-age': String(security.cors.maxAge),
  })
  applyCorsHeaders(headers, origin, security.cors)
  appendVary(headers, ['Access-Control-Request-Method', 'Access-Control-Request-Headers'])
  if (requestId && security.requestId !== false) {
    headers.set(security.requestId.headerName, requestId)
  }

  return new Response(null, { status: 204, headers })
}

export function applySecurityResponsePolicy(
  request: Request,
  response: Response,
  security: ResolvedFeathersV6NitroSecurityOptions,
  requestId: string | undefined,
  preserveFeathersCorsHeaders: boolean,
): Response {
  const headers = new Headers(response.headers)
  const corsHeaderNames = [
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'access-control-max-age',
  ]

  if (!preserveFeathersCorsHeaders || security.cors !== false) {
    corsHeaderNames.forEach(name => headers.delete(name))
  }

  const origin = request.headers.get('origin')
  if (origin && security.cors !== false && isOriginAllowed(origin, security.cors)) {
    applyCorsHeaders(headers, origin, security.cors)
  }

  if (requestId && security.requestId !== false) {
    headers.set(security.requestId.headerName, requestId)
  }

  const isSse = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') === true
  if (isSse) {
    headers.set('cache-control', 'no-cache, no-transform')
    headers.set('x-accel-buffering', 'no')
  }

  if (response.status >= 500 && !security.exposeErrors) {
    headers.delete('content-length')
    headers.set('content-type', 'application/json')
    headers.set('cache-control', 'no-store')
    return Response.json(
      createErrorBody(response.status, 'GeneralError', 'general-error', 'Internal server error.', requestId),
      { status: response.status, statusText: response.statusText, headers },
    )
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export interface RequestTimeoutController {
  readonly signal: AbortSignal
  clearTimeout(): void
  dispose(): void
}

export function createRequestTimeoutController(
  upstream: AbortSignal,
  timeoutMs: number,
): RequestTimeoutController {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined

  const abortFromUpstream = () => controller.abort(upstream.reason)
  if (upstream.aborted) {
    abortFromUpstream()
  }
  else {
    upstream.addEventListener('abort', abortFromUpstream, { once: true })
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
    timeout.unref()
  }

  const clearRequestTimeout = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = undefined
    }
  }

  return {
    signal: controller.signal,
    clearTimeout: clearRequestTimeout,
    dispose() {
      clearRequestTimeout()
      upstream.removeEventListener('abort', abortFromUpstream)
    },
  }
}
