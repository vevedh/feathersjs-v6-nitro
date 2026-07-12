<script setup lang="ts">
import type { ConnectionStatus, RealtimeLogEntry, RealtimeMode } from '../types/playground'

const props = defineProps<{
  mode: RealtimeMode
  status: ConnectionStatus
  error: string
  logs: RealtimeLogEntry[]
}>()

const emit = defineEmits<{
  'update:mode': [mode: RealtimeMode]
  'connect': []
  'disconnect': []
  'clear': []
}>()

const statusState = computed<'connected' | 'running' | 'error' | 'disconnected'>(() => {
  if (props.status === 'connected') return 'connected'
  if (props.status === 'connecting') return 'running'
  if (props.status === 'error') return 'error'
  return 'disconnected'
})
</script>

<template>
  <section class="panel span-2">
    <div class="panel-heading">
      <div>
        <p class="kicker">Transport temps réel</p>
        <h2>SSE ou Socket.IO</h2>
      </div>
      <StatusBadge :label="props.status" :state="statusState" />
    </div>

    <div class="transport-toolbar">
      <div class="segmented" role="radiogroup" aria-label="Transport temps réel">
        <button
          v-for="item in (['sse', 'socketio'] as const)"
          :key="item"
          type="button"
          :class="{ active: props.mode === item }"
          :aria-pressed="props.mode === item"
          @click="emit('update:mode', item)"
        >
          {{ item === 'sse' ? 'SSE natif' : 'Socket.IO' }}
        </button>
      </div>
      <button class="primary" type="button" :disabled="props.status === 'connecting'" @click="emit('connect')">
        Connecter
      </button>
      <button class="ghost" type="button" @click="emit('disconnect')">
        Déconnecter
      </button>
      <button class="ghost" type="button" @click="emit('clear')">
        Effacer le journal
      </button>
    </div>

    <p v-if="props.error" class="alert danger" role="alert">
      {{ props.error }}
    </p>

    <div class="event-log" aria-live="polite">
      <div v-if="props.logs.length === 0" class="empty-state">
        Connecte un transport puis crée, modifie ou supprime un message.
      </div>
      <article v-for="entry in props.logs" :key="entry.id" class="event-row">
        <div>
          <strong>{{ entry.path ? `${entry.path} · ` : '' }}{{ entry.event }}</strong>
          <span>{{ entry.transport.toUpperCase() }} · {{ new Date(entry.at).toLocaleTimeString() }}</span>
        </div>
        <pre v-if="entry.data !== undefined">{{ JSON.stringify(entry.data, null, 2) }}</pre>
      </article>
    </div>
  </section>
</template>
