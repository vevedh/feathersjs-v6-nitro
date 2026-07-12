import type { FeathersV6NitroInstanceOptions } from './types.js'

/**
 * Identity helper that keeps strict TypeScript inference for one Nitro instance.
 */
export function defineFeathersV6NitroInstance<const T extends FeathersV6NitroInstanceOptions>(options: T): T {
  return options
}

/**
 * Identity helper that preserves tuple inference for a multi-instance declaration.
 */
export function defineFeathersV6NitroInstances<
  const T extends readonly FeathersV6NitroInstanceOptions[],
>(instances: T): T {
  if (instances.length === 0) {
    throw new TypeError('At least one Feathers v6 Nitro instance is required.')
  }

  return instances
}
