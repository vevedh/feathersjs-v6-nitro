import type { FeathersV6NitroInstanceEntry } from '../src/runtime/types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  setupFeathersV6NitroInstance,
  teardownFeathersV6NitroInstance,
} from '../src/runtime/lifecycle.js'
import { getFeathersV6NitroRegistry } from '../src/runtime/registry.js'
import { createLifecycleApp, createMockNitroApp } from './helpers.js'

function createEntry(): FeathersV6NitroInstanceEntry {
  const nitroApp = createMockNitroApp()
  return getFeathersV6NitroRegistry(nitroApp).register({
    app: createLifecycleApp(),
    id: 'lifecycle',
    basePath: '/api/lifecycle',
  })
}

describe('Feathers v6 lifecycle', () => {
  it('deduplicates concurrent setup calls', async () => {
    const entry = createEntry()

    await Promise.all([
      setupFeathersV6NitroInstance(entry),
      setupFeathersV6NitroInstance(entry),
      setupFeathersV6NitroInstance(entry),
    ])

    expect(entry.options.app.setup).toHaveBeenCalledTimes(1)
    expect(entry.status).toBe('ready')
    expect(entry.nitroApp.hooks.callHook).toHaveBeenCalledWith(
      'feathers:v6:beforeSetup',
      expect.objectContaining({ entry }),
    )
  })

  it('stores setup failures and reuses the rejected promise', async () => {
    const entry = createEntry()
    const failure = new Error('database unavailable')
    vi.mocked(entry.options.app.setup).mockRejectedValueOnce(failure)

    const first = setupFeathersV6NitroInstance(entry)
    const second = setupFeathersV6NitroInstance(entry)

    await expect(first).rejects.toBe(failure)
    await expect(second).rejects.toBe(failure)
    expect(entry.options.app.setup).toHaveBeenCalledTimes(1)
    expect(entry.status).toBe('setup-failed')
    expect(entry.setupError).toBe(failure)
  })

  it('tears down exactly once after setup', async () => {
    const entry = createEntry()
    await setupFeathersV6NitroInstance(entry)

    await Promise.all([
      teardownFeathersV6NitroInstance(entry),
      teardownFeathersV6NitroInstance(entry),
    ])

    expect(entry.options.app.teardown).toHaveBeenCalledTimes(1)
    expect(entry.status).toBe('closed')
  })

  it('runs registered cleanup when teardown happens before setup', async () => {
    const entry = createEntry()
    const cleanup = vi.fn().mockResolvedValue(undefined)
    entry.cleanupCallbacks.add(cleanup)

    await teardownFeathersV6NitroInstance(entry)

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(entry.options.app.setup).not.toHaveBeenCalled()
    expect(entry.options.app.teardown).not.toHaveBeenCalled()
    expect(entry.cleanupCallbacks.size).toBe(0)
    expect(entry.status).toBe('closed')
  })

  it('runs registered cleanup after setup failure', async () => {
    const entry = createEntry()
    const failure = new Error('database unavailable')
    const cleanup = vi.fn().mockResolvedValue(undefined)
    entry.cleanupCallbacks.add(cleanup)
    vi.mocked(entry.options.app.setup).mockRejectedValueOnce(failure)

    await expect(setupFeathersV6NitroInstance(entry)).rejects.toBe(failure)
    await teardownFeathersV6NitroInstance(entry)

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(entry.options.app.teardown).not.toHaveBeenCalled()
    expect(entry.cleanupCallbacks.size).toBe(0)
    expect(entry.status).toBe('closed')
  })

  it('continues cleanup and application teardown when a teardown hook fails', async () => {
    const entry = createEntry()
    const hookFailure = new Error('before teardown hook failed')
    const cleanup = vi.fn().mockResolvedValue(undefined)
    entry.cleanupCallbacks.add(cleanup)

    await setupFeathersV6NitroInstance(entry)
    vi.mocked(entry.nitroApp.hooks.callHook).mockRejectedValueOnce(hookFailure)

    await expect(teardownFeathersV6NitroInstance(entry)).rejects.toMatchObject({
      errors: [hookFailure],
    })

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(entry.options.app.teardown).toHaveBeenCalledTimes(1)
    expect(entry.cleanupCallbacks.size).toBe(0)
    expect(entry.status).toBe('closed')
    expect(entry.nitroApp.hooks.callHook).toHaveBeenCalledWith(
      'feathers:v6:afterTeardown',
      expect.objectContaining({ entry }),
    )
  })

  it('aggregates cleanup and application teardown failures after attempting a full close', async () => {
    const entry = createEntry()
    const cleanupFailure = new Error('transport cleanup failed')
    const teardownFailure = new Error('application teardown failed')
    const cleanup = vi.fn().mockRejectedValue(cleanupFailure)
    entry.cleanupCallbacks.add(cleanup)

    await setupFeathersV6NitroInstance(entry)
    vi.mocked(entry.options.app.teardown).mockRejectedValueOnce(teardownFailure)

    await expect(teardownFeathersV6NitroInstance(entry)).rejects.toMatchObject({
      errors: [cleanupFailure, teardownFailure],
    })

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(entry.options.app.teardown).toHaveBeenCalledTimes(1)
    expect(entry.cleanupCallbacks.size).toBe(0)
    expect(entry.status).toBe('closed')
    expect(entry.nitroApp.hooks.callHook).toHaveBeenCalledWith(
      'feathers:v6:afterTeardown',
      expect.objectContaining({ entry }),
    )
  })

  it('runs registered transport cleanup before application teardown', async () => {
    const entry = createEntry()
    const order: string[] = []
    entry.cleanupCallbacks.add(() => {
      order.push('transport')
    })
    vi.mocked(entry.options.app.teardown).mockImplementation(async () => {
      order.push('application')
      return entry.options.app
    })

    await setupFeathersV6NitroInstance(entry)
    await teardownFeathersV6NitroInstance(entry)

    expect(order).toEqual(['transport', 'application'])
    expect(entry.cleanupCallbacks.size).toBe(0)
  })
})
