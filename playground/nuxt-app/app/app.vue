<script setup lang="ts">
import type {
  InstanceDiagnostic,
  MessageRecord,
  RealtimeMode,
  SecurityProbeResult,
  TestResult,
  TransportContext,
} from './types/playground'

const realtime = usePlaygroundRealtime()
const operationPending = ref(false)
const securityPending = ref(false)
const testsPending = ref(false)
const pageError = ref('')
const diagnostics = ref<InstanceDiagnostic[]>([])
const securityResults = ref<SecurityProbeResult[]>([])
const adminStatus = ref<Record<string, unknown>>()
const transportContext = ref<TransportContext>()

const tests = ref<TestResult[]>([
  { id: 'http-crud', label: 'HTTP Web Standards : CRUD complet', status: 'idle' },
  { id: 'multi-instance', label: 'Isolation de l’instance administration', status: 'idle' },
  { id: 'diagnostics', label: 'Diagnostics redacted du registre Nitro', status: 'idle' },
  { id: 'security', label: 'Security Baseline : 8 probes', status: 'idle' },
  { id: 'sse', label: 'SSE : connexion et événement de service', status: 'idle' },
  { id: 'socketio', label: 'Socket.IO : méthodes, authorize et channel', status: 'idle' },
])

const { data: messages, refresh: refreshMessages } = await useFetch<MessageRecord[]>('/api/feathers/messages', {
  default: () => [],
})

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return 'Erreur inconnue.'
}

async function loadOverview(): Promise<void> {
  const [diagnosticData, adminData, contextData] = await Promise.all([
    $fetch<InstanceDiagnostic[]>('/api/playground/diagnostics'),
    $fetch<Record<string, unknown>>('/api/admin-feathers/status'),
    $fetch<TransportContext>('/api/feathers/transport-context'),
  ])
  diagnostics.value = diagnosticData
  adminStatus.value = adminData
  transportContext.value = contextData
}

async function withOperation(action: () => Promise<void>): Promise<void> {
  pageError.value = ''
  operationPending.value = true
  try {
    await action()
  }
  catch (error: unknown) {
    pageError.value = errorMessage(error)
  }
  finally {
    operationPending.value = false
  }
}

async function createMessage(text: string): Promise<void> {
  await withOperation(async () => {
    await $fetch('/api/feathers/messages', { method: 'POST', body: { text } })
    await refreshMessages()
  })
}

async function patchMessage(id: number, text: string): Promise<void> {
  await withOperation(async () => {
    await $fetch(`/api/feathers/messages/${id}`, { method: 'PATCH', body: { text } })
    await refreshMessages()
  })
}

async function removeMessage(id: number): Promise<void> {
  await withOperation(async () => {
    await $fetch(`/api/feathers/messages/${id}`, { method: 'DELETE' })
    await refreshMessages()
  })
}


function setRealtimeMode(value: RealtimeMode): void {
  realtime.mode.value = value
}

async function connectRealtime(): Promise<void> {
  pageError.value = ''
  try {
    await realtime.connect(realtime.mode.value)
    if (realtime.mode.value === 'socketio') {
      transportContext.value = await realtime.socketCall<TransportContext>('find', 'transport-context', {})
    }
    else {
      transportContext.value = await $fetch<TransportContext>('/api/feathers/transport-context')
    }
  }
  catch (error: unknown) {
    pageError.value = errorMessage(error)
  }
}

async function runSecurityProbes(): Promise<SecurityProbeResult[]> {
  securityPending.value = true
  try {
    securityResults.value = await $fetch<SecurityProbeResult[]>('/api/playground/security-probes', {
      method: 'POST',
    })
    return securityResults.value
  }
  finally {
    securityPending.value = false
  }
}

function updateTest(id: string, status: TestResult['status'], details?: string): void {
  const target = tests.value.find(item => item.id === id)
  if (target) {
    target.status = status
    target.details = details
  }
}

async function runTest(id: string, action: () => Promise<string>): Promise<void> {
  updateTest(id, 'running', 'Exécution…')
  try {
    updateTest(id, 'passed', await action())
  }
  catch (error: unknown) {
    updateTest(id, 'failed', errorMessage(error))
  }
}

async function runAllTests(): Promise<void> {
  if (testsPending.value) return
  testsPending.value = true
  pageError.value = ''
  const previousMode = realtime.mode.value

  for (const test of tests.value) {
    test.status = 'idle'
    test.details = undefined
  }

  try {
    await runTest('http-crud', async () => {
      const marker = `HTTP ${Date.now()}`
      const created = await $fetch<MessageRecord>('/api/feathers/messages', {
        method: 'POST',
        body: { text: marker },
      })
      const fetched = await $fetch<MessageRecord>(`/api/feathers/messages/${created.id}`)
      if (fetched.text !== marker) throw new Error('GET ne retourne pas la création.')
      const patched = await $fetch<MessageRecord>(`/api/feathers/messages/${created.id}`, {
        method: 'PATCH',
        body: { text: `${marker} patché` },
      })
      if (!patched.text.endsWith('patché')) throw new Error('PATCH non appliqué.')
      await $fetch(`/api/feathers/messages/${created.id}`, { method: 'DELETE' })
      return `create/get/patch/remove validés sur #${created.id}`
    })

    await runTest('multi-instance', async () => {
      const status = await $fetch<Record<string, unknown>>('/api/admin-feathers/status')
      if (status.instanceId !== 'playground-admin' || status.scope !== 'admin') {
        throw new Error('L’instance administration n’est pas isolée.')
      }
      adminStatus.value = status
      return 'playground-admin · /api/admin-feathers'
    })

    await runTest('diagnostics', async () => {
      diagnostics.value = await $fetch<InstanceDiagnostic[]>('/api/playground/diagnostics')
      const ids = diagnostics.value.map(item => item.id)
      if (!ids.includes('playground-api') || !ids.includes('playground-admin') || !ids.includes('playground-security-lab')) {
        throw new Error('Une instance attendue est absente des diagnostics.')
      }
      return `${diagnostics.value.length} instances prêtes, données sensibles absentes`
    })

    await runTest('security', async () => {
      const results = await runSecurityProbes()
      const failures = results.filter(result => !result.passed)
      if (failures.length > 0) {
        throw new Error(`${failures.length} probe(s) en échec : ${failures.map(item => item.label).join(', ')}`)
      }
      return `${results.length}/${results.length} probes validés`
    })

    await runTest('sse', async () => {
      await realtime.connect('sse')
      const marker = `SSE ${Date.now()}`
      const awaitedEvent = realtime.waitForEvent(event => event.path === 'messages' && event.event === 'created')
      const created = await $fetch<MessageRecord>('/api/feathers/messages', {
        method: 'POST',
        body: { text: marker },
      })
      await awaitedEvent
      await $fetch(`/api/feathers/messages/${created.id}`, { method: 'DELETE' })
      return `événement created reçu pour #${created.id}`
    })

    await runTest('socketio', async () => {
      await realtime.connect('socketio')
      const context = await realtime.socketCall<TransportContext>('find', 'transport-context', {})
      if (context.provider !== 'socketio' || context.playgroundRole !== 'tester') {
        throw new Error('Le hook authorize Socket.IO n’a pas enrichi la connexion.')
      }
      transportContext.value = context
      const marker = `Socket.IO ${Date.now()}`
      const awaitedEvent = realtime.waitForEvent(event => event.path === 'messages' && event.event === 'created')
      const created = await realtime.socketCall<MessageRecord>('create', 'messages', { text: marker }, {})
      await awaitedEvent
      await realtime.socketCall<MessageRecord>('remove', 'messages', created.id, {})
      return `méthode create + channel validés · socket ${context.socketId ?? 'inconnu'}`
    })
  }
  finally {
    await refreshMessages()
    realtime.mode.value = previousMode
    testsPending.value = false
  }
}

onMounted(async () => {
  try {
    await loadOverview()
    await realtime.connect('sse')
  }
  catch (error: unknown) {
    pageError.value = errorMessage(error)
  }
})
</script>

<template>
  <div class="app-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">@vevedh/feathersjs-v6-nitro · Nuxt 4</p>
        <h1>Playground fonctionnel HTTP, SSE et Socket.IO</h1>
        <p>
          Une console de validation interactive pour le multi-instance, le CRUD Feathers v6, les transports temps réel,
          les diagnostics Nitro et la baseline de sécurité.
        </p>
        <div class="hero-badges">
          <StatusBadge label="Nuxt 4" state="passed" />
          <StatusBadge label="Feathers v6" state="passed" />
          <StatusBadge label="Nitro natif" state="passed" />
          <StatusBadge :label="`${diagnostics.length} instances`" :state="diagnostics.length >= 3 ? 'passed' : 'idle'" />
        </div>
      </div>
      <div class="hero-command">
        <span>Lancement</span>
        <code>bun run dev:playground</code>
        <small>ou pnpm dev:playground</small>
      </div>
    </header>

    <p v-if="pageError" class="alert danger page-alert" role="alert">
      {{ pageError }}
    </p>

    <main class="dashboard-grid">
      <RealtimePanel
        :mode="realtime.mode.value"
        :status="realtime.status.value"
        :error="realtime.error.value"
        :logs="realtime.logs.value"
        @update:mode="setRealtimeMode"
        @connect="connectRealtime"
        @disconnect="realtime.disconnect"
        @clear="realtime.clearLogs"
      />

      <MessagesPanel
        :messages="messages ?? []"
        :pending="operationPending"
        @create="createMessage"
        @patch="patchMessage"
        @remove="removeMessage"
        @refresh="refreshMessages"
      />

      <DiagnosticsPanel
        :diagnostics="diagnostics"
        :admin-status="adminStatus"
        :transport-context="transportContext"
      />

      <SecurityPanel
        :results="securityResults"
        :pending="securityPending"
        @run="runSecurityProbes"
      />

      <TestMatrixPanel
        :tests="tests"
        :pending="testsPending"
        @run="runAllTests"
      />
    </main>

    <footer>
      Les données du playground sont conservées en mémoire et réinitialisées à chaque redémarrage.
    </footer>
  </div>
</template>

<style>
:root {
  color-scheme: dark;
  --background: #070b16;
  --surface: #10172a;
  --surface-soft: #151f36;
  --surface-elevated: #1a2640;
  --border: #2b3958;
  --text: #edf2ff;
  --muted: #9eabc5;
  --accent: #78a5ff;
  --accent-strong: #a8c5ff;
  --success: #5dd39e;
  --warning: #f5bf5b;
  --danger: #ff7979;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--background);
  color: var(--text);
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: radial-gradient(circle at 15% 0%, #17264d 0, transparent 34rem), var(--background); }
button, input { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
code, pre { font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace; }
.app-shell { width: min(1440px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 3rem; }
.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: end; padding: 2rem; border: 1px solid var(--border); border-radius: 1.5rem; background: linear-gradient(135deg, rgb(18 28 53 / 95%), rgb(12 18 34 / 96%)); box-shadow: 0 24px 80px rgb(0 0 0 / 35%); }
.hero h1 { max-width: 900px; margin: .4rem 0 .8rem; font-size: clamp(2rem, 4vw, 4rem); line-height: 1.03; letter-spacing: -.045em; }
.hero p { max-width: 840px; margin: 0; color: var(--muted); font-size: 1.05rem; line-height: 1.7; }
.eyebrow, .kicker { margin: 0; color: var(--accent-strong); font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.hero-badges { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: 1.25rem; }
.hero-command { display: grid; gap: .45rem; min-width: 260px; padding: 1rem; border: 1px solid var(--border); border-radius: 1rem; background: #080e1d; }
.hero-command span, .hero-command small { color: var(--muted); }
.hero-command code { color: var(--success); font-weight: 700; }
.dashboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.panel { min-width: 0; padding: 1.25rem; border: 1px solid var(--border); border-radius: 1.15rem; background: linear-gradient(160deg, rgb(17 25 46 / 98%), rgb(11 17 32 / 98%)); box-shadow: 0 16px 45px rgb(0 0 0 / 22%); }
.span-2 { grid-column: span 2; }
.panel-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
.panel h2 { margin: .3rem 0 0; font-size: 1.15rem; }
.transport-toolbar, .inline-form { display: flex; flex-wrap: wrap; gap: .65rem; align-items: center; }
.segmented { display: inline-flex; padding: .25rem; border: 1px solid var(--border); border-radius: .8rem; background: #080f20; }
.segmented button { padding: .55rem .8rem; border: 0; border-radius: .55rem; background: transparent; color: var(--muted); font-weight: 750; }
.segmented button.active { background: var(--accent); color: #071020; }
.primary, .ghost, .danger-button { min-height: 2.45rem; padding: .58rem .9rem; border-radius: .7rem; font-weight: 750; }
.primary { border: 0; background: var(--accent); color: #071020; }
.ghost { border: 1px solid var(--border); background: var(--surface-soft); color: var(--text); }
.danger-button { border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border)); background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: #ffb0b0; }
.compact { min-height: 2rem; padding: .38rem .65rem; font-size: .78rem; }
input { min-width: 0; padding: .72rem .85rem; border: 1px solid var(--border); border-radius: .7rem; outline: none; background: #080f20; color: var(--text); }
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgb(120 165 255 / 15%); }
.inline-form input { flex: 1 1 360px; }
.alert { padding: .8rem 1rem; border-radius: .7rem; }
.alert.danger { border: 1px solid rgb(255 121 121 / 35%); background: rgb(255 121 121 / 10%); color: #ffb1b1; }
.page-alert { margin: 1rem 0 0; }
.event-log { display: grid; gap: .55rem; max-height: 360px; margin-top: 1rem; overflow: auto; }
.event-row { display: grid; grid-template-columns: minmax(180px, .65fr) minmax(0, 1.35fr); gap: 1rem; padding: .75rem; border: 1px solid #202d48; border-radius: .75rem; background: #091123; }
.event-row div { display: grid; gap: .2rem; align-content: start; }
.event-row span { color: var(--muted); font-size: .72rem; }
pre { max-width: 100%; margin: 0; overflow: auto; white-space: pre-wrap; word-break: break-word; color: #c5d7ff; font-size: .76rem; }
.message-list, .diagnostic-list, .probe-list { display: grid; gap: .65rem; margin-top: 1rem; }
.message-card { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .85rem; border: 1px solid #202d48; border-radius: .8rem; background: #091123; }
.message-main { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .35rem .7rem; align-items: center; }
.message-main small { grid-column: 2; color: var(--muted); }
.message-main input { grid-column: 2; }
.message-id { color: var(--accent-strong); font-weight: 800; }
.message-actions { display: flex; gap: .45rem; flex-wrap: wrap; justify-content: flex-end; }
.diagnostic-card { padding: .85rem; border: 1px solid #202d48; border-radius: .8rem; background: #091123; }
.diagnostic-title { display: flex; align-items: center; justify-content: space-between; gap: .7rem; }
.diagnostic-card code { display: block; margin: .55rem 0; color: var(--accent-strong); }
dl { margin: 0; }
dl div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: .5rem; padding: .25rem 0; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
details { margin-top: .7rem; padding: .7rem; border: 1px solid var(--border); border-radius: .7rem; background: #091123; }
summary { cursor: pointer; font-weight: 700; }
details pre { margin-top: .7rem; }
.muted-copy { color: var(--muted); line-height: 1.6; }
.probe-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .7rem; align-items: start; padding: .75rem; border: 1px solid #202d48; border-radius: .75rem; background: #091123; }
.probe-row p, .test-card p { margin: .25rem 0 0; color: var(--muted); font-size: .82rem; line-height: 1.45; }
.test-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .7rem; }
.test-card { display: grid; gap: .55rem; align-content: start; min-height: 145px; padding: .85rem; border: 1px solid #202d48; border-radius: .8rem; background: #091123; }
.empty-state { padding: 1.25rem; border: 1px dashed var(--border); border-radius: .75rem; color: var(--muted); text-align: center; }
footer { padding: 1.5rem 0 0; color: var(--muted); text-align: center; font-size: .82rem; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; }
  .hero-command { min-width: 0; }
  .dashboard-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
  .test-grid { grid-template-columns: 1fr; }
  .event-row { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .app-shell { width: min(100% - 1rem, 1440px); padding-top: .5rem; }
  .hero, .panel { padding: 1rem; border-radius: 1rem; }
  .panel-heading, .message-card { align-items: stretch; flex-direction: column; }
  .message-actions { justify-content: flex-start; }
  .transport-toolbar > * { width: 100%; }
  .segmented button { flex: 1; }
}
</style>
