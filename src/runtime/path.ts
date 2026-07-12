const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,62}[a-zA-Z0-9])?$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2e|2f|5c)/iu
const SAFE_BASE_PATH_PATTERN = /^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*)?$/u
const SAFE_SERVICE_PATH_PATTERN = /^[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*$/u

export function normalizeInstanceId(value: string | undefined): string {
  const trimmed = value?.trim()
  const id = trimmed?.length ? trimmed : 'default'

  if (!INSTANCE_ID_PATTERN.test(id)) {
    throw new TypeError(
      'Feathers Nitro instance id must contain 1 to 64 alphanumeric, dot, underscore or hyphen characters.',
    )
  }

  return id
}

export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim()
  const input = trimmed?.length ? trimmed : '/api/feathers'

  if (!input.startsWith('/')) {
    throw new TypeError('Feathers Nitro basePath must start with "/".')
  }

  if (
    input.includes('?')
    || input.includes('#')
    || input.includes('\\')
    || CONTROL_CHARACTER_PATTERN.test(input)
    || ENCODED_PATH_SEPARATOR_PATTERN.test(input)
  ) {
    throw new TypeError('Feathers Nitro basePath contains forbidden URL characters.')
  }

  const normalized = input.replace(/\/{2,}/gu, '/').replace(/\/$/u, '') || '/'
  if (!SAFE_BASE_PATH_PATTERN.test(normalized)) {
    throw new TypeError('Feathers Nitro basePath contains unsupported path characters.')
  }

  const segments = normalized.split('/')

  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new TypeError('Feathers Nitro basePath must not contain dot path segments.')
  }

  return normalized
}

export function normalizeServicePath(value: string | undefined, fallback = '_events'): string {
  const trimmed = value?.trim().replace(/^\/+|\/+$/gu, '')
  const input = trimmed?.length ? trimmed : fallback

  if (
    input.includes('?')
    || input.includes('#')
    || input.includes('\\')
    || CONTROL_CHARACTER_PATTERN.test(input)
    || ENCODED_PATH_SEPARATOR_PATTERN.test(input)
    || !SAFE_SERVICE_PATH_PATTERN.test(input)
  ) {
    throw new TypeError('Feathers Nitro service path contains forbidden or unsupported characters.')
  }

  const normalized = input.replace(/\/{2,}/gu, '/')
  if (normalized.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new TypeError('Feathers Nitro service path must not contain dot path segments.')
  }

  return normalized
}

export function joinBasePath(basePath: string, servicePath: string): string {
  return basePath === '/' ? `/${servicePath}` : `${basePath}/${servicePath}`
}

export function isPathInsideBasePath(pathname: string, basePath: string): boolean {
  return basePath === '/'
    || pathname === basePath
    || pathname.startsWith(`${basePath}/`)
}

export function stripBasePath(pathname: string, basePath: string): string {
  if (!isPathInsideBasePath(pathname, basePath)) {
    throw new TypeError(`Request path "${pathname}" is outside Feathers Nitro basePath "${basePath}".`)
  }

  if (basePath === '/') {
    return pathname || '/'
  }

  const stripped = pathname.slice(basePath.length)
  return stripped || '/'
}

export function rewriteRequestUrl(requestUrl: string, basePath: string): URL {
  const url = new URL(requestUrl)
  url.pathname = stripBasePath(url.pathname, basePath)
  return url
}
