const CORS_RESPONSE_HEADERS = [
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
] as const

export function applyFeathersV6NitroResponsePolicy(
  response: Response,
  preserveFeathersCorsHeaders: boolean,
): Response {
  if (preserveFeathersCorsHeaders) {
    return response
  }

  const headers = new Headers(response.headers)
  for (const name of CORS_RESPONSE_HEADERS) {
    headers.delete(name)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
