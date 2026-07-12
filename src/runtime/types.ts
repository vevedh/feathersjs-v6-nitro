import type { Application, Params } from 'feathers'
import type { Middleware } from 'feathers/http'
import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack'

export type FeathersV6NitroLifecycleStatus
  = | 'registered'
    | 'setting-up'
    | 'ready'
    | 'setup-failed'
    | 'tearing-down'
    | 'closed'

export type FeathersV6NitroHttpMethod
  = | 'GET'
    | 'HEAD'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'OPTIONS'

export interface FeathersV6NitroRoutingOptions {
  /** HTTP methods accepted before the request reaches Feathers. */
  readonly methods?: readonly FeathersV6NitroHttpMethod[]

  /** Register the exact `basePath` route. Default: true. */
  readonly mountExact?: boolean

  /** Register the recursive `basePath/**` route. Default: true. */
  readonly mountWildcard?: boolean
}

export interface FeathersV6NitroCorsOptions {
  /** Exact allowed origins. `*` is accepted only when credentials are disabled. */
  readonly origins: readonly string[]
  readonly methods?: readonly FeathersV6NitroHttpMethod[]
  readonly headers?: readonly string[]
  readonly exposedHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAge?: number
}

export interface FeathersV6NitroRequestIdOptions {
  readonly headerName?: string
  readonly acceptIncoming?: boolean
}

export interface FeathersV6NitroSecurityOptions {
  /** Maximum request body size in bytes. Default: 1 MiB. */
  readonly maxBodySize?: number

  /** Maximum absolute request URL length. Default: 8192 characters. */
  readonly maxUrlLength?: number

  /** Timeout applied until Feathers returns response headers. Default: 30000 ms. */
  readonly requestTimeoutMs?: number

  /** Preserve internal 5xx error details. Default: false. */
  readonly exposeErrors?: boolean

  /** Explicit CORS policy. Default: false (same-origin baseline). */
  readonly cors?: false | FeathersV6NitroCorsOptions

  /** Request correlation identifier policy. Default: generated `x-request-id`. */
  readonly requestId?: false | FeathersV6NitroRequestIdOptions
}

export interface FeathersV6NitroSseOptions {
  /** Feathers service path, relative to the application. Default: `_events`. */
  readonly path?: string

  /** Automatically register the Nitro-aware SSE service. Default: true. */
  readonly autoRegister?: boolean

  /** Keep-alive payload interval. Set to 0 to disable. Default: 15000 ms. */
  readonly heartbeatIntervalMs?: number

  /** Maximum queued events per connection. Default: 1000. */
  readonly maxBufferedEvents?: number
}

export interface ResolvedFeathersV6NitroRoutingOptions {
  readonly methods: readonly FeathersV6NitroHttpMethod[]
  readonly mountExact: boolean
  readonly mountWildcard: boolean
}

export interface ResolvedFeathersV6NitroCorsOptions {
  readonly origins: readonly string[]
  readonly methods: readonly FeathersV6NitroHttpMethod[]
  readonly headers: readonly string[]
  readonly exposedHeaders: readonly string[]
  readonly credentials: boolean
  readonly maxAge: number
}

export interface ResolvedFeathersV6NitroRequestIdOptions {
  readonly headerName: string
  readonly acceptIncoming: boolean
}

export interface ResolvedFeathersV6NitroSecurityOptions {
  readonly maxBodySize: number
  readonly maxUrlLength: number
  readonly requestTimeoutMs: number
  readonly exposeErrors: boolean
  readonly cors: false | ResolvedFeathersV6NitroCorsOptions
  readonly requestId: false | ResolvedFeathersV6NitroRequestIdOptions
}

export interface ResolvedFeathersV6NitroSseOptions {
  readonly path: string
  readonly autoRegister: boolean
  readonly heartbeatIntervalMs: number
  readonly maxBufferedEvents: number
}

export interface FeathersV6NitroRequestContext {
  readonly event: H3Event
  readonly instanceId: string
  readonly basePath: string
  readonly requestId?: string
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface FeathersV6NitroInstanceOptions {
  /** Unique identifier inside one Nitro application. */
  readonly id?: string

  /** Feathers v6 application to expose. */
  readonly app: Application

  /** Nitro mount path. It is removed before Feathers route lookup. */
  readonly basePath?: string

  /** Start `app.setup()` during Nitro plugin registration. Default: true. */
  readonly autoSetup?: boolean

  /** Run `app.teardown()` when Nitro closes. Default: true. */
  readonly autoTeardown?: boolean

  /** Advanced Nitro route restrictions. */
  readonly routing?: FeathersV6NitroRoutingOptions

  /** Security controls applied before and after Feathers. */
  readonly security?: FeathersV6NitroSecurityOptions

  /** Enable the Nitro-aware Feathers v6 SSE service. Default: false. */
  readonly sse?: false | FeathersV6NitroSseOptions

  /**
   * Preserve the permissive CORS headers emitted by the Feathers v6 HTTP
   * handler. Deprecated: use `security.cors`. Disabled by default.
   */
  readonly preserveFeathersCorsHeaders?: boolean

  /** Additional Feathers v6 HTTP middleware executed after secure parsing. */
  readonly middleware?: readonly Middleware[]

  /** Server-only data exposed at `params.nitro.metadata`. */
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface ResolvedFeathersV6NitroInstanceOptions {
  readonly id: string
  readonly app: Application
  readonly basePath: string
  readonly autoSetup: boolean
  readonly autoTeardown: boolean
  readonly routing: ResolvedFeathersV6NitroRoutingOptions
  readonly security: ResolvedFeathersV6NitroSecurityOptions
  readonly sse: false | ResolvedFeathersV6NitroSseOptions
  readonly preserveFeathersCorsHeaders: boolean
  readonly middleware: readonly Middleware[]
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface FeathersV6NitroMountedRoutes {
  exact?: string
  wildcard?: string
}

export interface FeathersV6NitroInstanceEntry {
  readonly nitroApp: NitroApp
  readonly options: ResolvedFeathersV6NitroInstanceOptions
  status: FeathersV6NitroLifecycleStatus
  setupPromise?: Promise<void>
  teardownPromise?: Promise<void>
  setupError?: unknown
  routeMounted: boolean
  readonly mountedRoutes: FeathersV6NitroMountedRoutes
  sseRegistered: boolean

  /** Generic transport/resource cleanup callbacks executed before app.teardown(). */
  readonly cleanupCallbacks: Set<() => void | Promise<void>>
}

export interface FeathersV6NitroHandlerParams extends Params {
  nitro: FeathersV6NitroRequestContext
}

export interface FeathersV6NitroSetupHookContext {
  readonly nitroApp: NitroApp
  readonly entry: FeathersV6NitroInstanceEntry
}

declare module 'feathers' {
  interface Params {
    nitro?: FeathersV6NitroRequestContext
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    'feathers:v6:beforeSetup'(context: FeathersV6NitroSetupHookContext): void | Promise<void>
    'feathers:v6:afterSetup'(context: FeathersV6NitroSetupHookContext): void | Promise<void>
    'feathers:v6:setupError'(context: FeathersV6NitroSetupHookContext & { readonly error: unknown }): void | Promise<void>
    'feathers:v6:beforeTeardown'(context: FeathersV6NitroSetupHookContext): void | Promise<void>
    'feathers:v6:afterTeardown'(context: FeathersV6NitroSetupHookContext): void | Promise<void>
  }
}
