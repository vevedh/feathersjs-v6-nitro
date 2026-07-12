<script setup lang="ts">
const props = defineProps<{
  label: string
  state: 'idle' | 'running' | 'connected' | 'passed' | 'disconnected' | 'failed' | 'error'
}>()
</script>

<template>
  <span class="status-badge" :data-state="props.state">
    <span class="status-dot" aria-hidden="true" />
    {{ props.label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  padding: .38rem .68rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: .78rem;
  font-weight: 750;
}
.status-dot { width: .48rem; height: .48rem; border-radius: 999px; background: #74809b; }
.status-badge[data-state='connected'] .status-dot,
.status-badge[data-state='passed'] .status-dot { background: var(--success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 15%, transparent); }
.status-badge[data-state='running'] .status-dot { background: var(--warning); animation: pulse 1s infinite; }
.status-badge[data-state='disconnected'] .status-dot,
.status-badge[data-state='failed'] .status-dot,
.status-badge[data-state='error'] .status-dot { background: var(--danger); }
@keyframes pulse { 50% { opacity: .35; } }
</style>
