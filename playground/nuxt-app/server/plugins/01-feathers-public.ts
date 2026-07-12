import { createFeathersV6NitroSocketIoPlugin } from '@vevedh/feathersjs-v6-nitro/socket.io'
import { feathersApp } from '../feathers/app'

export default createFeathersV6NitroSocketIoPlugin(
  {
    id: 'playground-api',
    app: feathersApp,
    basePath: '/api/feathers',
    autoSetup: true,
    autoTeardown: true,
    security: {
      maxBodySize: 64 * 1024,
      maxUrlLength: 4096,
      requestTimeoutMs: 15_000,
      cors: false,
    },
    sse: {
      path: 'events',
      heartbeatIntervalMs: 15_000,
      maxBufferedEvents: 100,
    },
    metadata: {
      environment: 'playground',
      scope: 'public',
    },
  },
  {
    path: '/socket.io',
    bootstrapPath: '/_feathers/socket.io/bootstrap',
    serverOptions: {
      transports: ['polling', 'websocket'],
      maxHttpBufferSize: 64 * 1024,
    },
    authorize: () => ({
      playgroundRole: 'tester',
    }),
  },
)
