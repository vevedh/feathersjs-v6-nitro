import {
  feathers,
  type Id,
  type NullableId,
  type Params,
} from 'feathers'
import {
  BadRequest,
  GeneralError,
  NotFound,
} from 'feathers/errors'
export interface Message {
  id: number
  text: string
  createdAt: string
  updatedAt: string
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertSafeValue(value: unknown, depth = 0): void {
  if (depth > 5) {
    throw new BadRequest('Le payload dépasse la profondeur autorisée.')
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new BadRequest('Le tableau dépasse la taille autorisée.')
    for (const item of value) assertSafeValue(item, depth + 1)
    return
  }
  if (!isPlainRecord(value)) return
  const entries = Object.entries(value)
  if (entries.length > 100) throw new BadRequest('Le payload contient trop de propriétés.')
  for (const [key, nested] of entries) {
    if (DANGEROUS_KEYS.has(key) || key.length > 80) {
      throw new BadRequest('Le payload contient une propriété interdite.')
    }
    assertSafeValue(nested, depth + 1)
  }
}

function parseMessageData(data: unknown): { text: string } {
  if (!isPlainRecord(data)) {
    throw new BadRequest('Le message est invalide.')
  }
  assertSafeValue(data)
  const keys = Object.keys(data)
  if (keys.some(key => key !== 'text')) {
    throw new BadRequest('Le message contient des propriétés inconnues.')
  }
  if (typeof data.text !== 'string') {
    throw new BadRequest('Le texte du message est requis.')
  }
  const text = data.text.trim()
  if (text.length < 1 || text.length > 500) {
    throw new BadRequest('Le texte doit contenir entre 1 et 500 caractères.')
  }
  return { text }
}

function parseEchoData(data: unknown): Record<string, unknown> {
  if (!isPlainRecord(data)) {
    throw new BadRequest('Payload echo invalide.')
  }
  assertSafeValue(data)
  return Object.fromEntries(Object.entries(data))
}

function cloneMessage(message: Message): Message {
  return { ...message }
}

function numericId(id: Id): number {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequest('Identifiant de message invalide.')
  }
  return value
}

class MessageService {
  private readonly messages: Message[] = [
    {
      id: 1,
      text: 'Feathers v6 répond directement depuis Nitro.',
      createdAt: new Date('2026-07-10T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-07-10T00:00:00.000Z').toISOString(),
    },
  ]
  private nextId = 2

  async find(params?: Params): Promise<Message[]> {
    const search = typeof params?.query?.search === 'string'
      ? params.query.search.trim().toLocaleLowerCase('fr')
      : ''
    return this.messages
      .filter(message => !search || message.text.toLocaleLowerCase('fr').includes(search))
      .map(cloneMessage)
  }

  async get(id: Id): Promise<Message> {
    return cloneMessage(this.requireMessage(id))
  }

  async create(data: unknown): Promise<Message> {
    const parsed = parseMessageData(data)

    const now = new Date().toISOString()
    const message: Message = {
      id: this.nextId++,
      text: parsed.text,
      createdAt: now,
      updatedAt: now,
    }
    this.messages.push(message)
    return cloneMessage(message)
  }

  async update(id: Id, data: unknown): Promise<Message> {
    const parsed = parseMessageData(data)
    const current = this.requireMessage(id)
    current.text = parsed.text
    current.updatedAt = new Date().toISOString()
    return cloneMessage(current)
  }

  async patch(id: NullableId, data: unknown): Promise<Message | Message[]> {
    const parsed = parseMessageData(data)

    if (id === null) {
      const updatedAt = new Date().toISOString()
      for (const message of this.messages) {
        message.text = parsed.text
        message.updatedAt = updatedAt
      }
      return this.messages.map(cloneMessage)
    }

    const current = this.requireMessage(id)
    current.text = parsed.text
    current.updatedAt = new Date().toISOString()
    return cloneMessage(current)
  }

  async remove(id: NullableId): Promise<Message | Message[]> {
    if (id === null) {
      const removed = this.messages.splice(0).map(cloneMessage)
      return removed
    }

    const numeric = numericId(id)
    const index = this.messages.findIndex(message => message.id === numeric)
    if (index < 0) {
      throw new NotFound('Message introuvable.')
    }
    return cloneMessage(this.messages.splice(index, 1)[0]!)
  }

  private requireMessage(id: Id): Message {
    const numeric = numericId(id)
    const message = this.messages.find(item => item.id === numeric)
    if (!message) {
      throw new NotFound('Message introuvable.')
    }
    return message
  }
}

class TransportContextService {
  async find(params?: Params) {
    const connection = params?.connection as Record<string, unknown> | undefined
    return {
      provider: params?.provider ?? 'server',
      socketId: typeof connection?.socketId === 'string' ? connection.socketId : undefined,
      playgroundRole: typeof connection?.playgroundRole === 'string' ? connection.playgroundRole : undefined,
      requestId: params?.nitro?.requestId,
      instanceId: params?.nitro?.instanceId,
      basePath: params?.nitro?.basePath,
    }
  }
}

class AdminStatusService {
  async find(params?: Params) {
    return {
      status: 'ready',
      instanceId: params?.nitro?.instanceId,
      scope: params?.nitro?.metadata.scope,
      provider: params?.provider,
    }
  }
}

class LabEchoService {
  async create(data: unknown, params?: Params) {
    const parsed = parseEchoData(data)
    return {
      data: parsed,
      requestId: params?.nitro?.requestId,
      instanceId: params?.nitro?.instanceId,
      provider: params?.provider,
    }
  }
}

class LabProbeService {
  async get(id: Id, params?: Params) {
    switch (String(id)) {
      case 'internal':
        throw new GeneralError('playground-internal-secret')
      case 'bad-request':
        throw new BadRequest('Erreur métier contrôlée.')
      case 'timeout':
        await this.waitForAbort(params?.request?.signal)
        return { completed: true }
      default:
        return {
          id,
          query: params?.query ?? {},
          requestId: params?.nitro?.requestId,
        }
    }
  }

  private async waitForAbort(signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 2500)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('Request aborted by timeout.'))
      }, { once: true })
    })
  }
}

export const feathersApp = feathers()
feathersApp.use('messages', new MessageService(), {
  methods: ['find', 'get', 'create', 'update', 'patch', 'remove'],
})
feathersApp.use('transport-context', new TransportContextService(), {
  methods: ['find'],
})
feathersApp.on('connection', connection => feathersApp.channel('public').join(connection))
feathersApp.publish(() => feathersApp.channel('public'))

export const adminFeathersApp = feathers()
adminFeathersApp.use('status', new AdminStatusService(), {
  methods: ['find'],
})

export const labFeathersApp = feathers()
labFeathersApp.use('echo', new LabEchoService(), {
  methods: ['create'],
})
labFeathersApp.use('probes', new LabProbeService(), {
  methods: ['get'],
})
