import { feathers } from 'feathers'
import { describe, expect, it } from 'vitest'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createMockNitroApp } from './helpers.js'

describe('FeathersV6NitroRegistry', () => {
  it('is scoped to a Nitro application instead of a process singleton', () => {
    const firstNitro = createMockNitroApp()
    const secondNitro = createMockNitroApp()

    const first = getFeathersV6NitroRegistry(firstNitro)
    const firstAgain = getFeathersV6NitroRegistry(firstNitro)
    const second = getFeathersV6NitroRegistry(secondNitro)

    expect(firstAgain).toBe(first)
    expect(second).not.toBe(first)
  })

  it('registers normalized immutable options', () => {
    const nitroApp = createMockNitroApp()
    const registry = getFeathersV6NitroRegistry(nitroApp)
    const metadata = { tenant: 'anonymous-a' }

    const entry = registry.register({
      id: 'api-a',
      app: feathers(),
      basePath: '/api//a/',
      metadata,
    })

    metadata.tenant = 'changed-outside'

    expect(entry.options.id).toBe('api-a')
    expect(entry.options.basePath).toBe('/api/a')
    expect(entry.options.metadata).toEqual({ tenant: 'anonymous-a' })
    expect(entry.status).toBe('registered')
  })

  it('rejects duplicate identifiers, paths and application objects', () => {
    const nitroApp = createMockNitroApp()
    const registry = getFeathersV6NitroRegistry(nitroApp)
    const sharedApp = feathers()

    registry.register({ id: 'one', app: sharedApp, basePath: '/api/one' })

    expect(() => registry.register({ id: 'one', app: feathers(), basePath: '/api/two' })).toThrow(
      'instance id "one" is already registered',
    )
    expect(() => registry.register({ id: 'two', app: feathers(), basePath: '/api/one' })).toThrow(
      'basePath "/api/one" overlaps',
    )
    expect(() => registry.register({ id: 'nested', app: feathers(), basePath: '/api/one/admin' })).toThrow(
      'basePath "/api/one/admin" overlaps',
    )
    expect(() => registry.register({ id: 'two', app: sharedApp, basePath: '/api/two' })).toThrow(
      'same Feathers application is already registered',
    )
  })
})

describe('atomic multi-instance registration', () => {
  it('does not keep a partial registration when a later candidate conflicts', () => {
    const nitroApp = createMockNitroApp()
    const registry = getFeathersV6NitroRegistry(nitroApp)

    expect(() => registry.registerMany([
      { id: 'first', app: feathers(), basePath: '/api/first' },
      { id: 'first', app: feathers(), basePath: '/api/second' },
    ])).toThrow('instance id "first" is already registered')

    expect(registry.size).toBe(0)
  })

  it('locates an instance only on complete base-path segments', () => {
    const nitroApp = createMockNitroApp()
    const registry = getFeathersV6NitroRegistry(nitroApp)
    registry.register({ id: 'public', app: feathers(), basePath: '/api/public' })

    expect(registry.getByPath('/api/public/messages')?.options.id).toBe('public')
    expect(registry.getByPath('/api/public-admin')).toBeUndefined()
  })
})
