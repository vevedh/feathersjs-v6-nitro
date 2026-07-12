import { createFeathersV6NitroPlugin } from '@vevedh/feathersjs-v6-nitro'
import { labFeathersApp } from '../feathers/app'

export default createFeathersV6NitroPlugin({
  id: 'playground-security-lab',
  app: labFeathersApp,
  basePath: '/api/lab',
  autoSetup: true,
  autoTeardown: true,
  routing: {
    methods: ['GET', 'POST', 'OPTIONS'],
  },
  security: {
    maxBodySize: 1024,
    maxUrlLength: 512,
    requestTimeoutMs: 600,
    exposeErrors: false,
    requestId: {
      acceptIncoming: true,
    },
    cors: {
      origins: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['content-type', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      credentials: true,
      maxAge: 300,
    },
  },
  metadata: {
    environment: 'playground',
    scope: 'security-lab',
  },
})
