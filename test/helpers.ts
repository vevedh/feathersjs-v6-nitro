import type { Application } from 'feathers'
import type { NitroApp } from 'nitropack'
import { vi } from 'vitest'

export function createMockNitroApp(): NitroApp {
  return {
    hooks: {
      hook: vi.fn(),
      callHook: vi.fn().mockResolvedValue(undefined),
    },
    router: {
      use: vi.fn(),
    },
    h3App: {} as NitroApp['h3App'],
    localCall: vi.fn(),
    localFetch: vi.fn(),
    captureError: vi.fn(),
  } as unknown as NitroApp
}

export function createLifecycleApp(overrides: Partial<Application> = {}): Application {
  return {
    setup: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Application
}
