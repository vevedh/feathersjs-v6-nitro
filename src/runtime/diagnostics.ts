import type { NitroApp } from 'nitropack'
import { getFeathersV6NitroRegistry } from './registry.js'
import { getFeathersV6NitroSsePath } from './sse.js'
import type { FeathersV6NitroLifecycleStatus } from './types.js'

export interface FeathersV6NitroInstanceDiagnostic {
  readonly id: string
  readonly basePath: string
  readonly status: FeathersV6NitroLifecycleStatus
  readonly mountedRoutes: Readonly<{
    exact?: string
    wildcard?: string
  }>
  readonly ssePath?: string
}

/**
 * Returns a redacted operational view of the registered instances.
 * Applications, request events, middleware and metadata are intentionally omitted.
 */
export function getFeathersV6NitroDiagnostics(
  nitroApp: NitroApp,
): readonly FeathersV6NitroInstanceDiagnostic[] {
  return getFeathersV6NitroRegistry(nitroApp).getAll().map((entry) => {
    const ssePath = getFeathersV6NitroSsePath(entry)

    return Object.freeze({
      id: entry.options.id,
      basePath: entry.options.basePath,
      status: entry.status,
      mountedRoutes: Object.freeze({ ...entry.mountedRoutes }),
      ...(ssePath === undefined ? {} : { ssePath }),
    })
  })
}
