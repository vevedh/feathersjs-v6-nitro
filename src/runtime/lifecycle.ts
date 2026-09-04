import { registerFeathersV6NitroSse } from './sse.js'
import type { FeathersV6NitroInstanceEntry, FeathersV6NitroSetupHookContext } from './types.js'

function contextFor(entry: FeathersV6NitroInstanceEntry): FeathersV6NitroSetupHookContext {
  return {
    nitroApp: entry.nitroApp,
    entry,
  }
}

async function runCleanupCallbacks(
  entry: FeathersV6NitroInstanceEntry,
  errors: unknown[],
): Promise<void> {
  const cleanupCallbacks = [...entry.cleanupCallbacks].reverse()
  entry.cleanupCallbacks.clear()

  for (const cleanup of cleanupCallbacks) {
    try {
      await cleanup()
    }
    catch (error: unknown) {
      errors.push(error)
    }
  }
}

function throwTeardownErrors(entry: FeathersV6NitroInstanceEntry, errors: readonly unknown[]): void {
  if (errors.length > 0) {
    throw new AggregateError(errors, `Feathers Nitro instance "${entry.options.id}" failed to close cleanly.`)
  }
}

export function setupFeathersV6NitroInstance(entry: FeathersV6NitroInstanceEntry): Promise<void> {
  if (entry.status === 'ready') {
    return Promise.resolve()
  }

  if (entry.setupPromise) {
    return entry.setupPromise
  }

  if (entry.status === 'closed' || entry.status === 'tearing-down') {
    return Promise.reject(new Error(`Feathers Nitro instance "${entry.options.id}" is closing or already closed.`))
  }

  entry.status = 'setting-up'
  entry.setupPromise = (async () => {
    const context = contextFor(entry)

    try {
      registerFeathersV6NitroSse(entry)
      await entry.nitroApp.hooks.callHook('feathers:v6:beforeSetup', context)
      await entry.options.app.setup()
      entry.status = 'ready'
      entry.setupError = undefined
      await entry.nitroApp.hooks.callHook('feathers:v6:afterSetup', context)
    }
    catch (error: unknown) {
      entry.status = 'setup-failed'
      entry.setupError = error
      await entry.nitroApp.hooks.callHook('feathers:v6:setupError', { ...context, error })
      throw error
    }
  })()

  return entry.setupPromise
}

export function teardownFeathersV6NitroInstance(entry: FeathersV6NitroInstanceEntry): Promise<void> {
  if (entry.status === 'closed') {
    return Promise.resolve()
  }

  if (entry.teardownPromise) {
    return entry.teardownPromise
  }

  entry.teardownPromise = (async () => {
    if (entry.setupPromise) {
      try {
        await entry.setupPromise
      }
      catch {
        const errors: unknown[] = []
        await runCleanupCallbacks(entry, errors)
        entry.status = 'closed'
        throwTeardownErrors(entry, errors)
        return
      }
    }

    if (entry.status !== 'ready') {
      const errors: unknown[] = []
      await runCleanupCallbacks(entry, errors)
      entry.status = 'closed'
      throwTeardownErrors(entry, errors)
      return
    }

    entry.status = 'tearing-down'
    const context = contextFor(entry)
    const errors: unknown[] = []

    try {
      await entry.nitroApp.hooks.callHook('feathers:v6:beforeTeardown', context)
    }
    catch (error: unknown) {
      errors.push(error)
    }

    await runCleanupCallbacks(entry, errors)

    try {
      await entry.options.app.teardown()
    }
    catch (error: unknown) {
      errors.push(error)
    }
    finally {
      entry.status = 'closed'
    }

    try {
      await entry.nitroApp.hooks.callHook('feathers:v6:afterTeardown', context)
    }
    catch (error: unknown) {
      errors.push(error)
    }

    throwTeardownErrors(entry, errors)
  })()

  return entry.teardownPromise
}

export async function teardownFeathersV6NitroInstances(
  entries: readonly FeathersV6NitroInstanceEntry[],
): Promise<void> {
  const teardownEntries = entries.filter(entry => entry.options.autoTeardown)
  const results = await Promise.allSettled(teardownEntries.map(teardownFeathersV6NitroInstance))
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason)

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more Feathers Nitro instances failed to teardown.')
  }
}
