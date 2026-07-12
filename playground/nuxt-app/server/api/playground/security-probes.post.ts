interface ProbeResult {
  id: string
  label: string
  passed: boolean
  status?: number
  details: string
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  }
  catch {
    return {}
  }
}

export default defineEventHandler(async (event): Promise<ProbeResult[]> => {
  const requestOrigin = getRequestURL(event).origin
  const target = (path: string) => new URL(path, requestOrigin).toString()
  const results: ProbeResult[] = []
  const incomingRequestId = '11111111-1111-4111-8111-111111111111'

  const requestIdResponse = await fetch(target('/api/lab/echo'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': incomingRequestId,
    },
    body: JSON.stringify({ feature: 'request-id' }),
  })
  const requestIdBody = await safeJson(requestIdResponse)
  results.push({
    id: 'request-id',
    label: 'Request ID entrant validé',
    passed: requestIdResponse.headers.get('x-request-id') === incomingRequestId
      && requestIdBody.requestId === incomingRequestId,
    status: requestIdResponse.status,
    details: String(requestIdResponse.headers.get('x-request-id') ?? 'absent'),
  })

  const methodResponse = await fetch(target('/api/lab/echo'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ feature: 'method' }),
  })
  results.push({
    id: 'method-allowlist',
    label: 'Méthode HTTP interdite',
    passed: methodResponse.status === 405,
    status: methodResponse.status,
    details: methodResponse.headers.get('allow') ?? 'En-tête Allow absent',
  })

  const longUrlResponse = await fetch(target(`/api/lab/probes/url?value=${'a'.repeat(700)}`))
  results.push({
    id: 'url-limit',
    label: 'Limite de longueur URL',
    passed: longUrlResponse.status === 414,
    status: longUrlResponse.status,
    details: 'URL de test supérieure à 512 caractères',
  })

  const bodyLimitResponse = await fetch(target('/api/lab/echo'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(2048) }),
  })
  results.push({
    id: 'body-limit',
    label: 'Limite de taille du corps',
    passed: bodyLimitResponse.status === 413,
    status: bodyLimitResponse.status,
    details: 'Payload de test supérieur à 1 Kio',
  })

  const internalResponse = await fetch(target('/api/lab/probes/internal'))
  const internalBody = await internalResponse.text()
  results.push({
    id: 'error-redaction',
    label: 'Masquage des erreurs 5xx',
    passed: internalResponse.status === 500 && !internalBody.includes('playground-internal-secret'),
    status: internalResponse.status,
    details: internalBody.includes('playground-internal-secret') ? 'Secret exposé' : 'Détail interne masqué',
  })

  const timeoutResponse = await fetch(target('/api/lab/probes/timeout'))
  results.push({
    id: 'timeout',
    label: 'Timeout de requête',
    passed: timeoutResponse.status === 408,
    status: timeoutResponse.status,
    details: 'Borne configurée à 600 ms',
  })

  const allowedCorsResponse = await fetch(target('/api/lab/echo'), {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-request-id',
    },
  })
  results.push({
    id: 'cors-allowed',
    label: 'CORS allowlist exacte',
    passed: allowedCorsResponse.status === 204
      && allowedCorsResponse.headers.get('access-control-allow-origin') === 'http://localhost:3000',
    status: allowedCorsResponse.status,
    details: allowedCorsResponse.headers.get('access-control-allow-origin') ?? 'Origin non renvoyée',
  })

  const deniedCorsResponse = await fetch(target('/api/lab/echo'), {
    method: 'OPTIONS',
    headers: {
      origin: 'https://untrusted.example',
      'access-control-request-method': 'POST',
    },
  })
  results.push({
    id: 'cors-denied',
    label: 'Origine CORS non fiable refusée',
    passed: deniedCorsResponse.status === 403,
    status: deniedCorsResponse.status,
    details: 'https://untrusted.example',
  })

  return results
})
