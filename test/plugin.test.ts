import { feathers } from 'feathers'
import { describe, expect, it, vi } from 'vitest'
import { createFeathersV6MultiNitroPlugin, createFeathersV6NitroPlugin } from '../src/runtime/plugin.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createMockNitroApp } from './helpers.js'

describe('Nitro plugin factories', () => {
  it('mounts exact and wildcard routes immediately', () => {
    const nitroApp = createMockNitroApp()
    const plugin = createFeathersV6NitroPlugin({
      app: feathers(),
      id: 'main',
      basePath: '/api/feathers',
      autoSetup: false,
    })

    plugin(nitroApp)

    expect(nitroApp.router.use).toHaveBeenCalledTimes(2)
    expect(nitroApp.router.use).toHaveBeenNthCalledWith(1, '/api/feathers', expect.any(Function))
    expect(nitroApp.router.use).toHaveBeenNthCalledWith(2, '/api/feathers/**', expect.any(Function))
    expect(getFeathersV6NitroRegistry(nitroApp).get('main')?.routeMounted).toBe(true)
  })

  it('registers one close hook for multiple instances', () => {
    const nitroApp = createMockNitroApp()
    const plugin = createFeathersV6MultiNitroPlugin([
      { app: feathers(), id: 'one', basePath: '/api/one', autoSetup: false },
      { app: feathers(), id: 'two', basePath: '/api/two', autoSetup: false },
    ])

    plugin(nitroApp)

    expect(getFeathersV6NitroRegistry(nitroApp).size).toBe(2)
    expect(vi.mocked(nitroApp.hooks.hook).mock.calls.filter((call: unknown[]) => call[0] === 'close')).toHaveLength(1)
  })

  it('rejects an empty multi-instance declaration', () => {
    expect(() => createFeathersV6MultiNitroPlugin([])).toThrow('At least one Feathers v6 instance')
  })
})

describe('advanced route mounting', () => {
  it('mounts the root wildcard explicitly and can disable the exact route', () => {
    const nitroApp = createMockNitroApp()
    const plugin = createFeathersV6NitroPlugin({
      app: feathers(),
      id: 'root-api',
      basePath: '/',
      autoSetup: false,
      routing: {
        mountExact: false,
        mountWildcard: true,
      },
    })

    plugin(nitroApp)

    expect(nitroApp.router.use).toHaveBeenCalledTimes(1)
    expect(nitroApp.router.use).toHaveBeenCalledWith('/**', expect.any(Function))
    expect(getFeathersV6NitroRegistry(nitroApp).get('root-api')?.mountedRoutes).toEqual({
      wildcard: '/**',
    })
  })

  it('preflights all instances before mounting any route', () => {
    const nitroApp = createMockNitroApp()
    const plugin = createFeathersV6MultiNitroPlugin([
      { app: feathers(), id: 'duplicate', basePath: '/api/one', autoSetup: false },
      { app: feathers(), id: 'duplicate', basePath: '/api/two', autoSetup: false },
    ])

    expect(() => plugin(nitroApp)).toThrow('instance id "duplicate" is already registered')
    expect(nitroApp.router.use).not.toHaveBeenCalled()
    expect(getFeathersV6NitroRegistry(nitroApp).size).toBe(0)
  })
})
