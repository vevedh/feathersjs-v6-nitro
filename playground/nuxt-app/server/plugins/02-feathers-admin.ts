import { createFeathersV6NitroPlugin } from '@vevedh/feathersjs-v6-nitro'
import { adminFeathersApp } from '../feathers/app'

export default createFeathersV6NitroPlugin({
  id: 'playground-admin',
  app: adminFeathersApp,
  basePath: '/api/admin-feathers',
  autoSetup: true,
  autoTeardown: true,
  routing: {
    methods: ['GET', 'HEAD', 'OPTIONS'],
  },
  security: {
    maxBodySize: 0,
    requestTimeoutMs: 5000,
    cors: false,
  },
  metadata: {
    environment: 'playground',
    scope: 'admin',
  },
})
