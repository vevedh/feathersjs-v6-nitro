import type { Socket } from 'socket.io-client'
import type {
  ConnectionStatus,
  RealtimeLogEntry,
  RealtimeMode,
} from '../types/playground'

interface SsePayload {
  event?: string
  path?: string
  data?: unknown
}

interface RealtimeEvent {
  event: string
  path?: string
  data?: unknown
}

type RealtimeListener = (event: RealtimeEvent) => void

type SocketAcknowledgement<T> = (error: unknown, result?: T) => void

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return new Error(String(error.message), { cause: error })
  }
  return new Error(fallback, { cause: error })
}

export function usePlaygroundRealtime() {
  const mode = ref<RealtimeMode>('sse')
  const status = ref<ConnectionStatus>('idle')
  const error = ref('')
  const logs = ref<RealtimeLogEntry[]>([])
  const listeners = new Set<RealtimeListener>()

  let eventSource: EventSource | undefined
  let socket: Socket | undefined

  function appendLog(transport: RealtimeMode, event: string, path?: string, data?: unknown): void {
    logs.value.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      transport,
      event,
      ...(path ? { path } : {}),
      ...(data === undefined ? {} : { data }),
    })
    logs.value = logs.value.slice(0, 60)
    for (const listener of listeners) {
      listener({ event, path, data })
    }
  }

  function clearLogs(): void {
    logs.value = []
  }

  function subscribe(listener: RealtimeListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  async function disconnect(): Promise<void> {
    eventSource?.close()
    eventSource = undefined
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = undefined
    }
    status.value = 'disconnected'
  }

  async function connectSse(): Promise<void> {
    await disconnect()
    mode.value = 'sse'
    status.value = 'connecting'
    error.value = ''

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const source = new EventSource('/api/feathers/events')
      eventSource = source
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true
          source.close()
          reject(new Error('La connexion SSE a expiré.'))
        }
      }, 5000)

      source.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data) as SsePayload
          const eventName = payload.event ?? 'message'
          appendLog('sse', eventName, payload.path, payload.data)
          if (eventName === 'connected') {
            status.value = 'connected'
            if (!settled) {
              settled = true
              window.clearTimeout(timer)
              resolve()
            }
          }
        }
        catch (parseError: unknown) {
          error.value = toError(parseError, 'Payload SSE invalide.').message
          status.value = 'error'
        }
      }

      source.onerror = () => {
        status.value = 'disconnected'
        if (!settled) {
          settled = true
          window.clearTimeout(timer)
          reject(new Error('La connexion SSE a échoué.'))
        }
      }
    })
  }

  async function connectSocketIo(): Promise<void> {
    await disconnect()
    mode.value = 'socketio'
    status.value = 'connecting'
    error.value = ''

    const bootstrap = await fetch('/_feathers/socket.io/bootstrap')
    if (!bootstrap.ok) {
      throw new Error(`Bootstrap Socket.IO refusé : HTTP ${bootstrap.status}.`)
    }

    const { io } = await import('socket.io-client')
    const candidate = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 4,
      timeout: 5000,
    })
    socket = candidate

    candidate.onAny((eventName: string, data: unknown) => {
      const separator = eventName.lastIndexOf(' ')
      const path = separator > 0 ? eventName.slice(0, separator) : undefined
      const event = separator > 0 ? eventName.slice(separator + 1) : eventName
      appendLog('socketio', event, path, data)
    })
    candidate.on('disconnect', reason => {
      appendLog('socketio', 'disconnect', undefined, reason)
      status.value = 'disconnected'
    })
    candidate.on('connect_error', (connectError) => {
      error.value = connectError.message
      status.value = 'error'
    })

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('La connexion Socket.IO a expiré.'))
      }, 5000)
      candidate.once('connect', () => {
        window.clearTimeout(timer)
        status.value = 'connected'
        appendLog('socketio', 'connected', undefined, { socketId: candidate.id })
        resolve()
      })
      candidate.once('connect_error', (connectError) => {
        window.clearTimeout(timer)
        reject(connectError)
      })
    })
  }

  async function connect(selectedMode: RealtimeMode = mode.value): Promise<void> {
    try {
      if (selectedMode === 'sse') {
        await connectSse()
      }
      else {
        await connectSocketIo()
      }
    }
    catch (connectError: unknown) {
      const normalized = toError(connectError, 'Connexion temps réel impossible.')
      error.value = normalized.message
      status.value = 'error'
      throw normalized
    }
  }

  async function socketCall<T>(method: string, servicePath: string, ...args: unknown[]): Promise<T> {
    if (!socket?.connected) {
      throw new Error('Socket.IO n’est pas connecté.')
    }

    return await new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error(`L’appel Socket.IO ${method} ${servicePath} a expiré.`))
      }, 5000)

      socket!.emit(method, servicePath, ...args, ((callError: unknown, result?: T) => {
        window.clearTimeout(timer)
        if (callError) {
          reject(toError(callError, `Échec de ${method} ${servicePath}.`))
          return
        }
        resolve(result as T)
      }) as SocketAcknowledgement<T>)
    })
  }

  function waitForEvent(
    predicate: (event: RealtimeEvent) => boolean,
    timeoutMs = 5000,
  ): Promise<RealtimeEvent> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        listeners.delete(listener)
        reject(new Error('L’événement temps réel attendu n’a pas été reçu.'))
      }, timeoutMs)
      const listener: RealtimeListener = (realtimeEvent) => {
        if (!predicate(realtimeEvent)) {
          return
        }
        window.clearTimeout(timer)
        listeners.delete(listener)
        resolve(realtimeEvent)
      }
      listeners.add(listener)
    })
  }

  onBeforeUnmount(() => {
    void disconnect()
  })

  return {
    mode,
    status,
    error,
    logs,
    connect,
    disconnect,
    clearLogs,
    subscribe,
    socketCall,
    waitForEvent,
  }
}
