import type { Application, HookContext, Params } from 'feathers'
import { joinBasePath, normalizeServicePath } from './path.js'
import type {
  FeathersV6NitroInstanceEntry,
  FeathersV6NitroSseOptions,
  ResolvedFeathersV6NitroSseOptions,
} from './types.js'

export interface FeathersV6NitroSsePayload {
  readonly event: string
  readonly data: unknown
  readonly path?: string
}

interface SseConnectionParams extends Params {
  readonly request?: Request
}

interface PublishChannel {
  readonly connections: readonly Params[]
  readonly dataFor?: (connection: Params) => unknown
}

export function resolveSseOptions(
  options: false | FeathersV6NitroSseOptions | undefined,
): false | ResolvedFeathersV6NitroSseOptions {
  if (!options) {
    return false
  }

  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 0 || heartbeatIntervalMs > 300_000) {
    throw new TypeError('sse.heartbeatIntervalMs must be an integer between 0 and 300000.')
  }

  const maxBufferedEvents = options.maxBufferedEvents ?? 1000
  if (!Number.isSafeInteger(maxBufferedEvents) || maxBufferedEvents < 1 || maxBufferedEvents > 100_000) {
    throw new TypeError('sse.maxBufferedEvents must be an integer between 1 and 100000.')
  }

  return Object.freeze({
    path: normalizeServicePath(options.path),
    autoRegister: options.autoRegister !== false,
    heartbeatIntervalMs,
    maxBufferedEvents,
  })
}

export class FeathersV6NitroSseService {
  private app?: Application
  private path?: string

  constructor(private readonly options: ResolvedFeathersV6NitroSseOptions) {}

  async find(connection: Params): Promise<AsyncGenerator<FeathersV6NitroSsePayload>> {
    const eventBuffer: FeathersV6NitroSsePayload[] = []
    const { app, path } = this

    if (!app || !path) {
      throw new Error('Can not initialize SSE. Did you call app.setup()?')
    }

    let isActive = true
    let pendingResolve: (() => void) | undefined
    const sseConnection = connection as SseConnectionParams
    const request = sseConnection.request instanceof Request ? sseConnection.request : undefined
    const signal = request?.signal

    const wake = () => {
      pendingResolve?.()
      pendingResolve = undefined
    }

    const abortHandler = () => {
      isActive = false
      wake()
    }

    const publishHandler = (
      event: string,
      channel: PublishChannel,
      hook: HookContext,
      data: unknown,
    ) => {
      if (!isActive || !channel.connections.includes(connection)) {
        return
      }

      if (eventBuffer.length >= this.options.maxBufferedEvents) {
        eventBuffer.length = 0
        eventBuffer.push({
          event: 'overflow',
          data: { maxBufferedEvents: this.options.maxBufferedEvents },
          path,
        })
        isActive = false
        wake()
        return
      }

      const eventData = channel.dataFor ? (channel.dataFor(connection) ?? data) : data
      eventBuffer.push({ event, data: eventData, path: hook.path })
      wake()
    }

    signal?.addEventListener('abort', abortHandler, { once: true })
    app.emit('connection', connection)
    app.addListener('publish', publishHandler as (...args: any[]) => void)

    const waitForActivity = async (): Promise<'event' | 'heartbeat'> => {
      if (eventBuffer.length > 0 || !isActive) {
        return 'event'
      }

      if (this.options.heartbeatIntervalMs === 0) {
        await new Promise<void>((resolve) => {
          pendingResolve = resolve
        })
        return 'event'
      }

      return await new Promise<'event' | 'heartbeat'>((resolve) => {
        const timer = setTimeout(() => {
          pendingResolve = undefined
          resolve('heartbeat')
        }, this.options.heartbeatIntervalMs)
        timer.unref()

        pendingResolve = () => {
          clearTimeout(timer)
          resolve('event')
        }
      })
    }

    const stream = async function* () {
      try {
        yield {
          event: 'connected',
          data: connection.query ?? {},
          path,
        }

        while (isActive || eventBuffer.length > 0) {
          while (eventBuffer.length > 0) {
            const payload = eventBuffer.shift()
            if (payload) {
              yield payload
            }
          }

          if (!isActive) {
            break
          }

          const activity = await waitForActivity()
          if (activity === 'heartbeat') {
            yield {
              event: 'heartbeat',
              data: { timestamp: new Date().toISOString() },
              path,
            }
          }
        }
      }
      finally {
        isActive = false
        signal?.removeEventListener('abort', abortHandler)
        app.removeListener('publish', publishHandler as (...args: any[]) => void)
        app.emit('disconnect', connection)
      }
    }

    return stream()
  }

  async setup(app: Application, path: string): Promise<void> {
    this.app = app
    this.path = path
  }
}

export function registerFeathersV6NitroSse(entry: FeathersV6NitroInstanceEntry): void {
  const { sse, app } = entry.options
  if (!sse || entry.sseRegistered || !sse.autoRegister) {
    return
  }

  if (Object.prototype.hasOwnProperty.call(app.services, sse.path)) {
    throw new Error(
      `Cannot auto-register Feathers Nitro SSE service "${sse.path}" because that service path already exists.`,
    )
  }

  app.use(sse.path, new FeathersV6NitroSseService(sse), {
    methods: ['find'],
  })
  entry.sseRegistered = true
}

export function getFeathersV6NitroSsePath(entry: FeathersV6NitroInstanceEntry): string | undefined {
  return entry.options.sse ? joinBasePath(entry.options.basePath, entry.options.sse.path) : undefined
}
