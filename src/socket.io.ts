import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type {
  Application,
  HookContext,
  Params,
  RealTimeConnection,
} from 'feathers'
import { createContext, getServiceOptions } from 'feathers'
import {
  BadRequest,
  FeathersError,
  GeneralError,
  MethodNotAllowed,
  NotFound,
} from 'feathers/errors'
import { eventHandler, type H3Event } from 'h3'
import type { NitroApp, NitroAppPlugin } from 'nitropack'
import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import {
  Server as SocketIoServer,
  type ServerOptions,
  type Socket,
} from 'socket.io'
import { setupFeathersV6NitroInstance } from './runtime/lifecycle.js'
import { isPathInsideBasePath, normalizeBasePath } from './runtime/path.js'
import { installFeathersV6NitroInstances } from './runtime/plugin.js'
import type {
  FeathersV6NitroInstanceEntry,
  FeathersV6NitroInstanceOptions,
} from './runtime/types.js'

const DEFAULT_MAX_METHOD_ARGUMENTS = 8
const DEFAULT_SOCKET_PATH = '/socket.io'
const DEFAULT_BOOTSTRAP_PATH = '/_feathers/socket.io/bootstrap'
const REQUEST_ORIGIN_PATTERN = /^https?:\/\/[^\s/]+(?::\d+)?$/u
const METHOD_NAME_PATTERN = /^[a-z][a-zA-Z0-9:_-]{0,63}$/u

export type FeathersV6NitroSocketIoConnection = RealTimeConnection & Params & {
  readonly provider: 'socketio'
  readonly socketId: string
}

export interface FeathersV6NitroSocketIoAuthorizationContext {
  readonly socket: Socket
  readonly connection: FeathersV6NitroSocketIoConnection
  readonly entry: FeathersV6NitroInstanceEntry
}

export interface FeathersV6NitroSocketIoOptions {
  /** Socket.IO/Engine.IO path. Default: `/socket.io`. */
  readonly path?: string

  /** HTTP endpoint used to eagerly attach Socket.IO to Nitro's Node server. */
  readonly bootstrapPath?: string

  /** Exact additional browser origins. Same-origin is always accepted. */
  readonly origins?: readonly string[]

  /** Allow clients without an Origin header. Default: true for non-browser clients. */
  readonly allowMissingOrigin?: boolean

  /** Trust x-forwarded-proto/host when deriving same-origin. Default: false. */
  readonly trustProxy?: boolean

  /** Maximum number of service arguments accepted before the acknowledgement callback. */
  readonly maxMethodArguments?: number

  /** Expose unknown 5xx messages to Socket.IO clients. Default: false. */
  readonly exposeErrors?: boolean

  /** Socket.IO server options. `path`, `allowRequest` and `serveClient` are controlled by this adapter. */
  readonly serverOptions?: Omit<Partial<ServerOptions>, 'path' | 'allowRequest' | 'serveClient'>

  /** Additional low-level Engine.IO admission check, composed after origin validation. */
  readonly allowRequest?: ServerOptions['allowRequest']

  /** Engine.IO attach options. `path` is controlled by this adapter. */
  readonly attachOptions?: Omit<Partial<ServerOptions>, 'path' | 'allowRequest' | 'serveClient'>

  /** Optional connection authorization/augmentation hook. */
  readonly authorize?: (
    context: FeathersV6NitroSocketIoAuthorizationContext,
  ) => undefined | Partial<FeathersV6NitroSocketIoConnection> | Promise<undefined | Partial<FeathersV6NitroSocketIoConnection>>
}

export interface ResolvedFeathersV6NitroSocketIoOptions {
  readonly path: string
  readonly bootstrapPath: string
  readonly origins: readonly string[]
  readonly allowMissingOrigin: boolean
  readonly trustProxy: boolean
  readonly maxMethodArguments: number
  readonly exposeErrors: boolean
  readonly serverOptions: Omit<Partial<ServerOptions>, 'path' | 'allowRequest' | 'serveClient'>
  readonly attachOptions: Omit<Partial<ServerOptions>, 'path' | 'allowRequest' | 'serveClient'>
  readonly allowRequest?: ServerOptions['allowRequest']
  readonly authorize?: FeathersV6NitroSocketIoOptions['authorize']
}

interface PublishChannel {
  readonly connections: readonly RealTimeConnection[]
  readonly dataFor?: (connection: RealTimeConnection) => unknown
}

type Acknowledgement = (error: unknown, result?: unknown) => void

function normalizeSocketPath(value: string | undefined, fallback: string): string {
  const path = normalizeBasePath(value ?? fallback)
  if (path === '/') {
    throw new TypeError('Socket.IO paths cannot be mounted at the root path.')
  }
  return path
}

function normalizeOrigins(origins: readonly string[] | undefined): readonly string[] {
  const normalized = [...new Set(origins ?? [])].map((origin) => {
    let parsed: URL
    try {
      parsed = new URL(origin)
    }
    catch {
      throw new TypeError(`Invalid Socket.IO origin "${origin}".`)
    }

    if (!REQUEST_ORIGIN_PATTERN.test(parsed.origin) || parsed.origin !== origin) {
      throw new TypeError(`Socket.IO origin "${origin}" must be an exact HTTP(S) origin.`)
    }
    return parsed.origin
  })

  return Object.freeze(normalized)
}

export function resolveFeathersV6NitroSocketIoOptions(
  options: FeathersV6NitroSocketIoOptions = {},
): ResolvedFeathersV6NitroSocketIoOptions {
  const path = normalizeSocketPath(options.path, DEFAULT_SOCKET_PATH)
  const bootstrapPath = normalizeSocketPath(options.bootstrapPath, DEFAULT_BOOTSTRAP_PATH)
  if (isPathInsideBasePath(path, bootstrapPath) || isPathInsideBasePath(bootstrapPath, path)) {
    throw new TypeError('socketIo.bootstrapPath must be outside the Socket.IO transport path.')
  }

  const maxMethodArguments = options.maxMethodArguments ?? DEFAULT_MAX_METHOD_ARGUMENTS
  if (!Number.isSafeInteger(maxMethodArguments) || maxMethodArguments < 1 || maxMethodArguments > 32) {
    throw new TypeError('socketIo.maxMethodArguments must be an integer between 1 and 32.')
  }

  return Object.freeze({
    path,
    bootstrapPath,
    origins: normalizeOrigins(options.origins),
    allowMissingOrigin: options.allowMissingOrigin !== false,
    trustProxy: options.trustProxy === true,
    maxMethodArguments,
    exposeErrors: options.exposeErrors === true,
    serverOptions: Object.freeze({ ...(options.serverOptions ?? {}) }),
    attachOptions: Object.freeze({ ...(options.attachOptions ?? {}) }),
    ...(options.allowRequest === undefined ? {} : { allowRequest: options.allowRequest }),
    ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
  })
}

function requestOrigin(request: IncomingMessage, trustProxy: boolean): string | undefined {
  const forwardedHost = trustProxy ? request.headers['x-forwarded-host'] : undefined
  const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost
  const host = rawHost ?? request.headers.host
  if (!host) {
    return undefined
  }

  const forwardedProto = trustProxy ? request.headers['x-forwarded-proto'] : undefined
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const encrypted = 'encrypted' in request.socket && request.socket.encrypted === true
  const protocol = rawProto?.split(',')[0]?.trim() ?? (encrypted ? 'https' : 'http')
  if (protocol !== 'http' && protocol !== 'https') {
    return undefined
  }

  return `${protocol}://${host}`
}

function originAllowed(request: IncomingMessage, options: ResolvedFeathersV6NitroSocketIoOptions): boolean {
  const origin = request.headers.origin
  if (!origin) {
    return options.allowMissingOrigin
  }

  const sameOrigin = requestOrigin(request, options.trustProxy)
  return origin === sameOrigin || options.origins.includes(origin)
}

function callbackFrom(args: unknown[]): Acknowledgement {
  const candidate = args.at(-1)
  if (typeof candidate === 'function') {
    args.pop()
    return candidate as Acknowledgement
  }
  return () => undefined
}

function serializedError(error: unknown, exposeErrors: boolean): Record<string, unknown> {
  if (error instanceof FeathersError) {
    if (error.code >= 500 && !exposeErrors) {
      return new GeneralError('Internal server error.').toJSON() as unknown as Record<string, unknown>
    }
    return error.toJSON() as unknown as Record<string, unknown>
  }

  const message = exposeErrors && error instanceof Error ? error.message : 'Internal server error.'
  return new GeneralError(message).toJSON() as unknown as Record<string, unknown>
}

function leaveChannels(app: Application, connection: RealTimeConnection): void {
  if (app.channels.length > 0) {
    app.channel(...app.channels).leave(connection)
  }
}

async function runSocketMethod(
  app: Application,
  connection: FeathersV6NitroSocketIoConnection,
  options: ResolvedFeathersV6NitroSocketIoOptions,
  method: string,
  incomingArgs: unknown[],
): Promise<void> {
  const args = [...incomingArgs]
  const callback = callbackFrom(args)

  try {
    if (args.length > options.maxMethodArguments) {
      throw new BadRequest(`Too many arguments for '${method}' method.`)
    }

    const rawPath = args.shift()
    if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 256) {
      throw new NotFound('Invalid service path.')
    }

    const lookup = (app.lookup as unknown as (path: string) => ReturnType<Application['lookup']> | null)(rawPath)
    if (lookup === null) {
      throw new NotFound(`Service '${rawPath}' not found.`)
    }

    const { service, params: route = {} } = lookup
    const { methods } = getServiceOptions(service)
    if (!(methods ?? []).includes(method)) {
      throw new MethodNotAllowed(`Method '${method}' not allowed on service '${rawPath}'.`)
    }

    const paramsPosition = method === 'find' ? 0 : (method === 'update' || method === 'patch' ? 2 : 1)
    if (args.length > paramsPosition + 1) {
      throw new BadRequest(`Too many arguments for '${method}' method.`)
    }

    const queryCandidate = args[paramsPosition]
    if (queryCandidate !== undefined && queryCandidate !== null && typeof queryCandidate !== 'object') {
      throw new BadRequest(`Invalid query arguments for '${method}' method.`)
    }

    const query = Object.assign({}, queryCandidate ?? {})
    const params: Params = Object.assign({}, connection, {
      provider: 'socketio',
      query,
      route,
      connection,
    })
    args[paramsPosition] = params

    const context = createContext(service, method)
    const returnedContext = await (service as any)[method](...args, context) as HookContext
    callback(null, returnedContext.dispatch ?? returnedContext.result)
  }
  catch (error: unknown) {
    callback(serializedError(error, options.exposeErrors))
  }
}

function serviceMethods(app: Application): readonly string[] {
  const methods = new Set<string>()
  for (const path of Object.keys(app.services)) {
    for (const method of getServiceOptions(app.service(path)).methods ?? []) {
      if (METHOD_NAME_PATTERN.test(method)) {
        methods.add(method)
      }
    }
  }
  return [...methods]
}

export class FeathersV6NitroSocketIoTransport {
  readonly io: SocketIoServer
  readonly options: ResolvedFeathersV6NitroSocketIoOptions

  private readonly socketByConnection = new WeakMap<RealTimeConnection, Socket>()
  private readonly activeSockets = new Set<Socket>()
  private attachedServer?: HttpServer
  private closed = false
  private readonly publishHandler: (...args: any[]) => void
  private readonly applicationDisconnectHandler: (connection: RealTimeConnection) => void
  private readonly logoutHandler: (_result: unknown, params: Params) => void

  constructor(
    readonly entry: FeathersV6NitroInstanceEntry,
    options: FeathersV6NitroSocketIoOptions = {},
  ) {
    this.options = resolveFeathersV6NitroSocketIoOptions(options)
    const { basePath } = entry.options
    for (const transportPath of [this.options.path, this.options.bootstrapPath]) {
      if (isPathInsideBasePath(transportPath, basePath) || isPathInsideBasePath(basePath, transportPath)) {
        throw new TypeError(
          `Socket.IO path "${transportPath}" overlaps Feathers HTTP basePath "${basePath}".`,
        )
      }
    }

    const userAllowRequest = this.options.allowRequest
    const serverOptions = { ...this.options.serverOptions }

    this.io = new SocketIoServer({
      ...serverOptions,
      path: this.options.path,
      serveClient: false,
      allowRequest: (request, callback) => {
        if (!originAllowed(request, this.options)) {
          callback('Origin is not allowed.', false)
          return
        }

        if (!userAllowRequest) {
          callback(null, true)
          return
        }

        userAllowRequest(request, callback)
      },
    })

    this.publishHandler = (
      event: string,
      channel: PublishChannel,
      context: HookContext,
      data: unknown,
    ) => {
      for (const connection of channel.connections) {
        const socket = this.socketByConnection.get(connection)
        if (!socket?.connected) {
          continue
        }

        const mapped = channel.dataFor?.(connection)
        const payload = mapped ?? data ?? context.dispatch ?? context.result
        const eventName = `${context.path} ${event}`.trim()
        socket.emit(eventName, payload)
      }
    }

    this.applicationDisconnectHandler = (connection) => {
      const socket = this.socketByConnection.get(connection)
      if (socket) {
        this.socketByConnection.delete(connection)
        socket.disconnect(true)
      }
      leaveChannels(this.entry.options.app, connection)
    }

    this.logoutHandler = (_result, params) => {
      if (params.connection) {
        leaveChannels(this.entry.options.app, params.connection)
      }
    }

    this.entry.options.app.addListener('publish', this.publishHandler)
    this.entry.options.app.addListener('disconnect', this.applicationDisconnectHandler)
    this.entry.options.app.addListener('logout', this.logoutHandler)

    this.io.use((socket, next) => {
      const connection: FeathersV6NitroSocketIoConnection = {
        provider: 'socketio',
        socketId: socket.id,
        headers: Object.freeze({ ...socket.handshake.headers }),
        query: Object.freeze({ ...socket.handshake.query }),
      }

      Promise.resolve(this.options.authorize?.({ socket, connection, entry: this.entry }))
        .then((additional) => {
          if (additional) {
            Object.assign(connection, additional)
          }
          socket.data.feathersConnection = connection
          next()
        })
        .catch((error: unknown) => {
          const message = this.options.exposeErrors && error instanceof Error
            ? error.message
            : 'Socket.IO authorization failed.'
          next(new Error(message))
        })
    })

    this.io.on('connection', (socket) => {
      const connection = socket.data.feathersConnection as FeathersV6NitroSocketIoConnection | undefined
      if (!connection) {
        socket.disconnect(true)
        return
      }

      this.activeSockets.add(socket)
      this.socketByConnection.set(connection, socket)
      this.entry.options.app.emit('connection', connection)

      for (const method of serviceMethods(this.entry.options.app)) {
        socket.on(method, (...args: unknown[]) => {
          void runSocketMethod(this.entry.options.app, connection, this.options, method, args)
        })
      }

      let finalized = false
      socket.once('disconnect', () => {
        if (finalized) {
          return
        }
        finalized = true
        this.activeSockets.delete(socket)
        this.socketByConnection.delete(connection)
        leaveChannels(this.entry.options.app, connection)
        this.entry.options.app.emit('disconnect', connection)
      })
    })

    this.entry.cleanupCallbacks.add(async () => {
      await this.close()
    })
  }

  get isAttached(): boolean {
    return this.attachedServer !== undefined
  }

  ensureAttached(server: HttpServer): void {
    if (this.closed) {
      throw new Error('Socket.IO transport is already closed.')
    }
    if (this.attachedServer && this.attachedServer !== server) {
      throw new Error('Socket.IO transport cannot be attached to more than one HTTP server.')
    }
    if (this.attachedServer) {
      return
    }

    this.io.attach(server, {
      ...this.options.attachOptions,
      path: this.options.path,
    })
    this.attachedServer = server
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true

    this.entry.options.app.removeListener('publish', this.publishHandler)
    this.entry.options.app.removeListener('disconnect', this.applicationDisconnectHandler)
    this.entry.options.app.removeListener('logout', this.logoutHandler)

    for (const socket of this.activeSockets) {
      socket.disconnect(true)
    }
    this.activeSockets.clear()

    const engine = (this.io as unknown as { engine?: { close(): unknown } }).engine
    engine?.close()
  }
}

function nodeServerFromNitroEvent(event: H3Event): HttpServer | undefined {
  const candidate = (event.node.req.socket as typeof event.node.req.socket & { server?: HttpServer }).server
  return candidate && typeof candidate.on === 'function' ? candidate : undefined
}

function captureSetupFailure(entry: FeathersV6NitroInstanceEntry): void {
  void setupFeathersV6NitroInstance(entry).catch((error: unknown) => {
    const normalized = error instanceof Error ? error : new Error('Unknown Feathers Socket.IO setup failure.', { cause: error })
    entry.nitroApp.captureError(normalized, {
      tags: ['feathers-v6-nitro', 'socket.io', 'setup'],
      context: {
        instanceId: entry.options.id,
        basePath: entry.options.basePath,
      },
    })
  })
}

export function installFeathersV6NitroSocketIoTransport(
  entry: FeathersV6NitroInstanceEntry,
  options: FeathersV6NitroSocketIoOptions = {},
): FeathersV6NitroSocketIoTransport {
  const transport = new FeathersV6NitroSocketIoTransport(entry, options)
  const { nitroApp } = entry

  nitroApp.hooks.hook('request', (event: H3Event) => {
    const server = nodeServerFromNitroEvent(event)
    if (server) {
      transport.ensureAttached(server)
    }
  })

  nitroApp.router.use(transport.options.bootstrapPath, eventHandler((event) => {
    const server = nodeServerFromNitroEvent(event)
    if (!server) {
      return new Response('Socket.IO requires the Nitro Node server preset.', { status: 501 })
    }
    transport.ensureAttached(server)
    return new Response(null, { status: 204 })
  }))

  const delegate = eventHandler((event) => {
    const server = nodeServerFromNitroEvent(event)
    if (!server) {
      return new Response('Socket.IO requires the Nitro Node server preset.', { status: 501 })
    }
    transport.ensureAttached(server)
    transport.io.engine.handleRequest(event.node.req, event.node.res)
    event._handled = true
  })
  nitroApp.router.use(transport.options.path, delegate)
  nitroApp.router.use(`${transport.options.path}/**`, delegate)

  return transport
}

/**
 * Creates one Nitro plugin that mounts the native Feathers HTTP/SSE bridge and
 * the optional Node-only Socket.IO compatibility transport.
 */
export function createFeathersV6NitroSocketIoPlugin(
  instance: FeathersV6NitroInstanceOptions,
  socketIo: FeathersV6NitroSocketIoOptions = {},
): NitroAppPlugin {
  return defineNitroPlugin((nitroApp: NitroApp) => {
    const [entry] = installFeathersV6NitroInstances(nitroApp, [instance], false)
    if (!entry) {
      throw new Error('Unable to register the Feathers Socket.IO instance.')
    }

    installFeathersV6NitroSocketIoTransport(entry, socketIo)
    if (entry.options.autoSetup) {
      captureSetupFailure(entry)
    }
  })
}
