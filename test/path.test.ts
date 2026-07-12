import { describe, expect, it } from 'vitest'
import {
  isPathInsideBasePath,
  joinBasePath,
  normalizeBasePath,
  normalizeServicePath,
  normalizeInstanceId,
  rewriteRequestUrl,
  stripBasePath,
} from '../src/runtime/path.js'

describe('path utilities', () => {
  it('normalizes safe instance identifiers', () => {
    expect(normalizeInstanceId(undefined)).toBe('default')
    expect(normalizeInstanceId(' tenant-api_1 ')).toBe('tenant-api_1')
  })

  it.each(['../tenant', 'tenant/one', '-tenant', 'tenant-', ''])(
    'rejects an unsafe explicit instance id: %s',
    (id) => {
      if (id === '') {
        expect(normalizeInstanceId(id)).toBe('default')
      }
      else {
        expect(() => normalizeInstanceId(id)).toThrow(TypeError)
      }
    },
  )

  it('normalizes base paths without decoding request data', () => {
    expect(normalizeBasePath(undefined)).toBe('/api/feathers')
    expect(normalizeBasePath('/api//feathers/')).toBe('/api/feathers')
    expect(normalizeBasePath('/')).toBe('/')
  })

  it.each(['/api/../private', 'api/feathers', '/api\\feathers', '/api?admin=true', '/api/%2e%2e/private', '/api path'])(
    'rejects unsafe base path %s',
    (path) => {
      expect(() => normalizeBasePath(path)).toThrow(TypeError)
    },
  )

  it('matches only complete path segments', () => {
    expect(isPathInsideBasePath('/api/feathers', '/api/feathers')).toBe(true)
    expect(isPathInsideBasePath('/api/feathers/messages', '/api/feathers')).toBe(true)
    expect(isPathInsideBasePath('/api/feathers-admin', '/api/feathers')).toBe(false)
  })

  it('strips the Nitro mount path before Feathers lookup', () => {
    expect(stripBasePath('/api/feathers', '/api/feathers')).toBe('/')
    expect(stripBasePath('/api/feathers/messages/12', '/api/feathers')).toBe('/messages/12')
  })

  it('preserves the query string while rewriting the pathname', () => {
    const url = rewriteRequestUrl('https://example.invalid/api/feathers/messages?$limit=10', '/api/feathers')
    expect(url.pathname).toBe('/messages')
    expect(url.search).toBe('?$limit=10')
  })
})

describe('service path utilities', () => {
  it('normalizes safe nested service paths and joins them to the mount path', () => {
    expect(normalizeServicePath('/system/events/')).toBe('system/events')
    expect(joinBasePath('/api/feathers', 'system/events')).toBe('/api/feathers/system/events')
    expect(joinBasePath('/', 'events')).toBe('/events')
  })

  it('rejects traversal and encoded separators in service paths', () => {
    expect(() => normalizeServicePath('../events')).toThrow(TypeError)
    expect(() => normalizeServicePath('events/%2f/admin')).toThrow(TypeError)
  })
})
