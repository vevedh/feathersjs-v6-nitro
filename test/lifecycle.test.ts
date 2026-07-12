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
