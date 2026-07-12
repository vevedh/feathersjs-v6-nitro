export type RealtimeMode = 'sse' | 'socketio'
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface MessageRecord {
  id: number
  text: string
  createdAt: string
  updatedAt: string
}

export interface RealtimeLogEntry {
  id: string
  at: string
  transport: RealtimeMode
  event: string
  path?: string
  data?: unknown
}

export interface InstanceDiagnostic {
  id: string
  basePath: string
  status: string
  mountedRoutes: {
    exact?: string
    wildcard?: string
  }
  ssePath?: string
}

export interface SecurityProbeResult {
  id: string
  label: string
  passed: boolean
  status?: number
  details: string
}

export interface TestResult {
  id: string
  label: string
  status: 'idle' | 'running' | 'passed' | 'failed'
  details?: string
}

export interface TransportContext {
  provider?: string
  socketId?: string
  playgroundRole?: string
  requestId?: string
  instanceId?: string
  basePath?: string
}
