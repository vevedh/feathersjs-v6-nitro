<script setup lang="ts">
import type { InstanceDiagnostic, TransportContext } from '../types/playground'

defineProps<{
  diagnostics: InstanceDiagnostic[]
  adminStatus?: Record<string, unknown>
  transportContext?: TransportContext
}>()
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="kicker">Isolation</p>
        <h2>Instances et diagnostics</h2>
      </div>
    </div>

    <div class="diagnostic-list">
      <article v-for="instance in diagnostics" :key="instance.id" class="diagnostic-card">
        <div class="diagnostic-title">
          <strong>{{ instance.id }}</strong>
          <StatusBadge :label="instance.status" :state="instance.status === 'ready' ? 'passed' : 'idle'" />
        </div>
        <code>{{ instance.basePath }}</code>
        <dl>
          <div><dt>Exact</dt><dd>{{ instance.mountedRoutes.exact ?? '—' }}</dd></div>
          <div><dt>Wildcard</dt><dd>{{ instance.mountedRoutes.wildcard ?? '—' }}</dd></div>
          <div><dt>SSE</dt><dd>{{ instance.ssePath ?? 'désactivé' }}</dd></div>
        </dl>
      </article>
    </div>

    <details>
      <summary>Contexte du transport courant</summary>
      <pre>{{ JSON.stringify(transportContext ?? {}, null, 2) }}</pre>
    </details>
    <details>
      <summary>Réponse de l’instance d’administration</summary>
      <pre>{{ JSON.stringify(adminStatus ?? {}, null, 2) }}</pre>
    </details>
  </section>
</template>
