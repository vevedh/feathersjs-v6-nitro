import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { feathers, type Params } from 'feathers'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { io as createSocket, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupFeathersV6NitroInstance } from '../src/runtime/lifecycle.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import {
  FeathersV6NitroSocketIoTransport,
  resolveFeathersV6NitroSocketIoOptions,
} from '../src/socket.io.js'
import { createMockNitroApp } from './helpers.js'

interface Message {
  id: number
  text: string
}

class MessageService {
  private readonly messages: Message[] = [{ id: 1, text: 'initial' }]

  async find(params?: Params): Promise<{ messages: Message[], provider?: string }> {
    const provider = params?.provider
    return {
      messages: [...this.messages],
      ...(provider === undefined ? {} : { provider }),
    }
  }

  async create(data: Pick<Message, 'text'>): Promise<Message> {
    const message = { id: this.messages.length + 1, text: data.text }
    this.messages.push(message)
    return message
  }
}

interface RunningSocketServer {
  readonly baseUrl: string
  readonly socket: Socket
  readonly transport: FeathersV6NitroSocketIoTransport
  readonly server: ReturnType<typeof createServer>
}

const running: RunningSocketServer[] = []

function acknowledgement<T>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket.emit(event, ...args, (error: unknown, result: T) => {
      if (error) {
        reject(error instanceof Error ? error : Object.assign(new Error('Socket method failed.'), { data: error }))
        return
      }
      resolve(result)
    })
  })
}

async function connect(baseUrl: string, path: string, extraHeaders?: Record<string, string>): Promise<Socket> {
  const socket = createSocket(baseUrl, {
    path,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(extraHeaders === undefined ? {} : { extraHeaders }),
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

async function startSocketServer(): Promise<RunningSocketServer> {
  const app = feathers()
  app.use('messages', new MessageService(), { methods: ['find', 'create'] })
  app.on('connection', connection => app.channel('public').join(connection))
  app.publish(() => app.channel('public'))

  const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
    id: 'socket-test',
    app,
    basePath: '/api/feathers',
  })
  await setupFeathersV6NitroInstance(entry)

  const h3App = createApp()
  h3App.use('/health', eventHandler(() => ({ status: 'ok' })))
  const server = createServer(toNodeListener(h3App))
  const transport = new FeathersV6NitroSocketIoTransport(entry, {
    path: '/realtime/socket.io',
    origins: ['https://trusted.example'],
    serverOptions: {
      transports: ['websocket'],
      maxHttpBufferSize: 64 * 1024,
    },
  })
  transport.ensureAttached(server)

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${String(address.port)}`
  const socket = await connect(baseUrl, transport.options.path)
  const result = { baseUrl, socket, transport, server }
  running.push(result)
  return result
}

afterEach(async () => {
  await Promise.all(running.splice(0).map(async ({ socket, transport, server }) => {
    socket.disconnect()
    await transport.close()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }))
})

describe('optional Feathers v6 Socket.IO transport', () => {
  it('validates paths, origins and method argument limits', () => {
    expect(resolveFeathersV6NitroSocketIoOptions()).toMatchObject({
      path: '/socket.io',
      bootstrapPath: '/_feathers/socket.io/bootstrap',
      allowMissingOrigin: true,
      maxMethodArguments: 8,
    })
    expect(() => resolveFeathersV6NitroSocketIoOptions({ path: '/' })).toThrow(/root/u)
    expect(() => resolveFeathersV6NitroSocketIoOptions({ path: '/socket', bootstrapPath: '/socket/bootstrap' })).toThrow(/outside/u)
    expect(() => resolveFeathersV6NitroSocketIoOptions({ path: '/socket/events', bootstrapPath: '/socket' })).toThrow(/outside/u)
    expect(() => resolveFeathersV6NitroSocketIoOptions({ origins: ['javascript:alert(1)'] })).toThrow(/origin/u)
    expect(() => resolveFeathersV6NitroSocketIoOptions({ maxMethodArguments: 0 })).toThrow(/between 1 and 32/u)

    const rootEntry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
      app: feathers(),
      basePath: '/',
    })
    expect(() => new FeathersV6NitroSocketIoTransport(rootEntry)).toThrow(/overlaps/u)
  })

  it('removes application listeners exactly once when the transport closes', async () => {
    const app = feathers()
    const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({
      id: 'socket-listener-cleanup',
      app,
      basePath: '/api/socket-listener-cleanup',
    })

    const before = {
      publish: app.listeners('publish').length,
      disconnect: app.listeners('disconnect').length,
      logout: app.listeners('logout').length,
    }

    const transport = new FeathersV6NitroSocketIoTransport(entry)
    expect(app.listeners('publish')).toHaveLength(before.publish + 1)
    expect(app.listeners('disconnect')).toHaveLength(before.disconnect + 1)
    expect(app.listeners('logout')).toHaveLength(before.logout + 1)

    await transport.close()
    await transport.close()

    expect(app.listeners('publish')).toHaveLength(before.publish)
    expect(app.listeners('disconnect')).toHaveLength(before.disconnect)
    expect(app.listeners('logout')).toHaveLength(before.logout)
  })

  it('runs Feathers service methods and publishes channel events', async () => {
    const { socket } = await startSocketServer()

    const found = await acknowledgement<{ messages: Message[], provider?: string }>(
      socket,
      'find',
      'messages',
      {},
    )
    expect(found).toEqual({ messages: [{ id: 1, text: 'initial' }], provider: 'socketio' })

    const event = new Promise<Message>(resolve => socket.once('messages created', resolve))
    const created = await acknowledgement<Message>(socket, 'create', 'messages', { text: 'socket' }, {})

    expect(created).toEqual({ id: 2, text: 'socket' })
    await expect(event).resolves.toEqual(created)
  })

  it('returns normalized Feathers errors through acknowledgements', async () => {
    const { socket } = await startSocketServer()

    await expect(acknowledgement(socket, 'find', 'missing', {})).rejects.toMatchObject({
      data: {
        code: 404,
        className: 'not-found',
      },
    })
  })

  it('rejects an untrusted Origin before a connection is established', async () => {
    const { baseUrl, transport } = await startSocketServer()
    const socket = createSocket(baseUrl, {
      path: transport.options.path,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Origin: 'https://evil.example' },
    })

    const error = await new Promise<Error>(resolve => socket.once('connect_error', resolve))
    expect(error.message).toBeTruthy()
    expect(socket.connected).toBe(false)
    socket.disconnect()
  })

  it('runs authorization before connection and does not close Nitro HTTP on transport cleanup', async () => {
    const app = feathers()
    app.use('identity', {
      async find(params?: Params) {
        return { tenant: params?.connection?.['tenant'] }
      },
    }, { methods: ['find'] })

    const entry = getFeathersV6NitroRegistry(createMockNitroApp()).register({ app, basePath: '/api/identity' })
    await setupFeathersV6NitroInstance(entry)
    const authorize = vi.fn(() => ({ tenant: 'tenant-a' }))
    const transport = new FeathersV6NitroSocketIoTransport(entry, { authorize })

    const h3App = createApp()
    h3App.use('/health', eventHandler(() => ({ status: 'ok' })))
    const server = createServer(toNodeListener(h3App))
    transport.ensureAttached(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${String(address.port)}`
    const socket = await connect(baseUrl, transport.options.path)
    running.push({ baseUrl, socket, transport, server })

    await expect(acknowledgement(socket, 'find', 'identity', {})).resolves.toEqual({ tenant: 'tenant-a' })
    expect(authorize).toHaveBeenCalledTimes(1)

    socket.disconnect()
    await transport.close()
    const health = await fetch(`${baseUrl}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
  })
})
