import type { NitroApp, NitroAppPlugin } from 'nitropack'
import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { createFeathersV6NitroHandler } from './handler.js'
import { setupFeathersV6NitroInstance, teardownFeathersV6NitroInstances } from './lifecycle.js'
import { getFeathersV6NitroRegistry } from './registry.js'
import type { FeathersV6NitroInstanceEntry, FeathersV6NitroInstanceOptions } from './types.js'

function mountEntry(nitroApp: NitroApp, entry: FeathersV6NitroInstanceEntry): void {
  if (entry.routeMounted) {
    return
  }

  const handler = createFeathersV6NitroHandler(entry)
  const { basePath, routing } = entry.options

  if (routing.mountExact) {
    nitroApp.router.use(basePath, handler)
    entry.mountedRoutes.exact = basePath
  }

  if (routing.mountWildcard) {
    const wildcard = basePath === '/' ? '/**' : `${basePath}/**`
    nitroApp.router.use(wildcard, handler)
    entry.mountedRoutes.wildcard = wildcard
  }

  entry.routeMounted = true
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unknown Feathers Nitro setup failure', { cause: error })
}

function captureEagerSetupFailure(entry: FeathersV6NitroInstanceEntry): void {
  void setupFeathersV6NitroInstance(entry).catch((error: unknown) => {
    entry.nitroApp.captureError(normalizeError(error), {
      tags: ['feathers-v6-nitro', 'setup'],
      context: {
        instanceId: entry.options.id,
        basePath: entry.options.basePath,
      },
    })
  })
}

export function installFeathersV6NitroInstances(
  nitroApp: NitroApp,
  options: readonly FeathersV6NitroInstanceOptions[],
  eagerSetup = true,
): readonly FeathersV6NitroInstanceEntry[] {
  const registry = getFeathersV6NitroRegistry(nitroApp)
  const entries = registry.registerMany(options)

  for (const entry of entries) {
    mountEntry(nitroApp, entry)
    if (eagerSetup && entry.options.autoSetup) {
      captureEagerSetupFailure(entry)
    }
  }

  registry.ensureCloseHook(async () => {
    await teardownFeathersV6NitroInstances(registry.getAll())
  })

  return entries
}

export function createFeathersV6NitroPlugin(options: FeathersV6NitroInstanceOptions): NitroAppPlugin {
  return defineNitroPlugin((nitroApp: NitroApp) => {
    installFeathersV6NitroInstances(nitroApp, [options])
  })
}

export function createFeathersV6MultiNitroPlugin(
  instances: readonly FeathersV6NitroInstanceOptions[],
): NitroAppPlugin {
  if (instances.length === 0) {
    throw new TypeError('At least one Feathers v6 instance is required.')
  }

  return defineNitroPlugin((nitroApp: NitroApp) => {
    installFeathersV6NitroInstances(nitroApp, instances)
  })
}
