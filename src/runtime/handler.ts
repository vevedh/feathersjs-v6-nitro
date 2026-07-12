import { createHandler } from 'feathers/http'
import { eventHandler, sendWebResponse } from 'h3'
import { setupFeathersV6NitroInstance } from './lifecycle.js'
import { createFeathersV6Request } from './request.js'
import {
  applySecurityResponsePolicy,
  createFeathersV6NitroMiddleware,
  createRequestId,
  createSecurityResponse,
  FeathersV6NitroPayloadTooLargeError,
  validateRequestBeforeFeathers,
} from './security.js'
import type { FeathersV6NitroHandlerParams, FeathersV6NitroInstanceEntry } from './types.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown server error.'
}

function normalizeThrownError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback, { cause: error })
}

async function awaitResponseWithAbort(
  responsePromise: Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  if (signal.aborted) {
    throw normalizeThrownError(signal.reason, 'Request aborted.')
  }

  return await new Promise<Response>((resolve, reject) => {
    const abort = () => reject(normalizeThrownError(signal.reason, 'Request aborted.'))
    signal.addEventListener('abort', abort, { once: true })
    responsePromise.then(
      (response) => {
        signal.removeEventListener('abort', abort)
        resolve(response)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(normalizeThrownError(error, 'Feathers request failed.'))
      },
    )
  })
}

export function createFeathersV6NitroHandler(entry: FeathersV6NitroInstanceEntry) {
  const feathersHandler = createHandler(
    entry.options.app,
    createFeathersV6NitroMiddleware(entry.options.security.maxBodySize, entry.options.middleware),
  )

  return eventHandler(async (event) => {
    const prepared = createFeathersV6Request(event, entry.options.basePath, entry.options.security)
    const requestId = createRequestId(prepared.original, entry.options.security)

    const sendResponse = async (response: Response) => {
      const secured = applySecurityResponsePolicy(
        prepared.original,
        response,
        entry.options.security,
        requestId,
        entry.options.preserveFeathersCorsHeaders,
      )
      try {
        return await sendWebResponse(event, secured)
      }
      finally {
        prepared.timeout.dispose()
      }
    }

    const rejected = validateRequestBeforeFeathers(
      prepared.original,
      entry.options.routing,
      entry.options.security,
      requestId,
    )
    if (rejected) {
      prepared.timeout.clearTimeout()
      return await sendResponse(rejected)
    }

    try {
      await setupFeathersV6NitroInstance(entry)
    }
    catch (error: unknown) {
      prepared.timeout.clearTimeout()
      const message = entry.options.security.exposeErrors
        ? `Feathers Nitro instance "${entry.options.id}" failed to initialize: ${errorMessage(error)}`
        : 'Service is temporarily unavailable.'
      return await sendResponse(createSecurityResponse(503, 'Unavailable', 'unavailable', message, requestId))
    }

    const params: FeathersV6NitroHandlerParams = {
      nitro: {
        event,
        instanceId: entry.options.id,
        basePath: entry.options.basePath,
        ...(requestId === undefined ? {} : { requestId }),
        metadata: entry.options.metadata,
      },
    }

    try {
      const response = await awaitResponseWithAbort(
        feathersHandler(prepared.request, params),
        prepared.timeout.signal,
      )
      prepared.timeout.clearTimeout()
      return await sendResponse(response)
    }
    catch (error: unknown) {
      const timeoutReason = prepared.timeout.signal.reason
      prepared.timeout.clearTimeout()

      if (error instanceof FeathersV6NitroPayloadTooLargeError) {
        return await sendResponse(createSecurityResponse(
          413,
          'PayloadTooLarge',
          'payload-too-large',
          error.message,
          requestId,
        ))
      }

      if (prepared.timeout.signal.aborted && timeoutReason instanceof DOMException && timeoutReason.name === 'TimeoutError') {
        return await sendResponse(createSecurityResponse(408, 'Timeout', 'timeout', 'Request timed out.', requestId))
      }

      const message = entry.options.security.exposeErrors ? errorMessage(error) : 'Internal server error.'
      return await sendResponse(createSecurityResponse(500, 'GeneralError', 'general-error', message, requestId))
    }
  })
}
