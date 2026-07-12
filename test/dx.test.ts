import { feathers } from 'feathers'
import { describe, expect, it } from 'vitest'
import { getFeathersV6NitroDiagnostics } from '../src/runtime/diagnostics.js'
import {
  defineFeathersV6NitroInstance,
  defineFeathersV6NitroInstances,
} from '../src/runtime/define.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createMockNitroApp } from './helpers.js'

describe('developer experience helpers', () => {
  it('preserves one and many instance declarations', () => {
    const app = feathers()
    const instance = defineFeathersV6NitroInstance({
      id: 'typed',
      app,
      basePath: '/api/typed',
      metadata: { scope: 'test' as const },
    })
    const instances = defineFeathersV6NitroInstances([instance] as const)

    expect(instance.metadata.scope).toBe('test')
    expect(instances[0]).toBe(instance)
  })

  it('rejects an empty multi-instance declaration', () => {
    expect(() => defineFeathersV6NitroInstances([])).toThrow(/At least one/u)
  })

  it('returns redacted diagnostics without application or metadata objects', () => {
    const nitroApp = createMockNitroApp()
    const entry = getFeathersV6NitroRegistry(nitroApp).register({
      id: 'diagnostic',
      app: feathers(),
      basePath: '/api/diagnostic',
      metadata: { secret: 'not-exposed' },
      sse: { path: 'events' },
    })
    entry.routeMounted = true
    entry.mountedRoutes.exact = '/api/diagnostic'

    const [diagnostic] = getFeathersV6NitroDiagnostics(nitroApp)
    expect(diagnostic).toEqual({
      id: 'diagnostic',
      basePath: '/api/diagnostic',
      status: 'registered',
      mountedRoutes: { exact: '/api/diagnostic' },
      ssePath: '/api/diagnostic/events',
    })
    expect(JSON.stringify(diagnostic)).not.toContain('secret')
  })
})
