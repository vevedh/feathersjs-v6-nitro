import type { NitroApp } from 'nitropack'
import { isPathInsideBasePath, normalizeBasePath, normalizeInstanceId } from './path.js'
import { resolveRoutingOptions, resolveSecurityOptions } from './security.js'
import { resolveSseOptions } from './sse.js'
import type {
  FeathersV6NitroInstanceEntry,
  FeathersV6NitroInstanceOptions,
  ResolvedFeathersV6NitroInstanceOptions,
} from './types.js'

const registries = new WeakMap<NitroApp, FeathersV6NitroRegistry>()

export function resolveFeathersV6NitroInstanceOptions(
  options: FeathersV6NitroInstanceOptions,
): ResolvedFeathersV6NitroInstanceOptions {
  return Object.freeze({
    id: normalizeInstanceId(options.id),
    app: options.app,
    basePath: normalizeBasePath(options.basePath),
    autoSetup: options.autoSetup !== false,
    autoTeardown: options.autoTeardown !== false,
    routing: resolveRoutingOptions(options.routing),
    security: resolveSecurityOptions(options.security),
    sse: resolveSseOptions(options.sse),
    preserveFeathersCorsHeaders: options.preserveFeathersCorsHeaders === true,
    middleware: Object.freeze([...(options.middleware ?? [])]),
    metadata: Object.freeze({ ...(options.metadata ?? {}) }),
  })
}

function pathsOverlap(first: string, second: string): boolean {
  return isPathInsideBasePath(first, second) || isPathInsideBasePath(second, first)
}

export class FeathersV6NitroRegistry {
  readonly #nitroApp: NitroApp
  readonly #entries = new Map<string, FeathersV6NitroInstanceEntry>()
  #closeHookRegistered = false

  constructor(nitroApp: NitroApp) {
    this.#nitroApp = nitroApp
  }

  register(options: FeathersV6NitroInstanceOptions): FeathersV6NitroInstanceEntry {
    const [entry] = this.registerMany([options])
    if (!entry) {
      throw new Error('Feathers Nitro failed to register the requested instance.')
    }
    return entry
  }

  registerMany(options: readonly FeathersV6NitroInstanceOptions[]): readonly FeathersV6NitroInstanceEntry[] {
    if (options.length === 0) {
      return []
    }

    const resolvedOptions = options.map(resolveFeathersV6NitroInstanceOptions)
    const allCandidates = [...this.#entries.values()].map(entry => entry.options)

    for (const candidate of resolvedOptions) {
      const duplicateId = allCandidates.find(existing => existing.id === candidate.id)
      if (duplicateId) {
        throw new Error(`Feathers Nitro instance id "${candidate.id}" is already registered.`)
      }

      const duplicateApp = allCandidates.find(existing => existing.app === candidate.app)
      if (duplicateApp) {
        throw new Error(
          `The same Feathers application is already registered as instance "${duplicateApp.id}".`,
        )
      }

      const overlapping = allCandidates.find(existing => pathsOverlap(candidate.basePath, existing.basePath))
      if (overlapping) {
        throw new Error(
          `Feathers Nitro basePath "${candidate.basePath}" overlaps instance "${overlapping.id}" at "${overlapping.basePath}".`,
        )
      }

      allCandidates.push(candidate)
    }

    const entries = resolvedOptions.map((resolved) => {
      const entry: FeathersV6NitroInstanceEntry = {
        nitroApp: this.#nitroApp,
        options: resolved,
        status: 'registered',
        routeMounted: false,
        mountedRoutes: {},
        sseRegistered: false,
        cleanupCallbacks: new Set(),
      }
      return entry
    })

    for (const entry of entries) {
      this.#entries.set(entry.options.id, entry)
    }
    return entries
  }

  get(id = 'default'): FeathersV6NitroInstanceEntry | undefined {
    return this.#entries.get(id)
  }

  getByPath(pathname: string): FeathersV6NitroInstanceEntry | undefined {
    return [...this.#entries.values()].find(entry => isPathInsideBasePath(pathname, entry.options.basePath))
  }

  getAll(): readonly FeathersV6NitroInstanceEntry[] {
    return [...this.#entries.values()]
  }

  has(id: string): boolean {
    return this.#entries.has(id)
  }

  get size(): number {
    return this.#entries.size
  }

  ensureCloseHook(teardown: () => Promise<void>): void {
    if (this.#closeHookRegistered) {
      return
    }

    this.#closeHookRegistered = true
    this.#nitroApp.hooks.hook('close', teardown)
  }
}

export function getFeathersV6NitroRegistry(nitroApp: NitroApp): FeathersV6NitroRegistry {
  const existing = registries.get(nitroApp)
  if (existing) {
    return existing
  }

  const registry = new FeathersV6NitroRegistry(nitroApp)
  registries.set(nitroApp, registry)
  return registry
}
