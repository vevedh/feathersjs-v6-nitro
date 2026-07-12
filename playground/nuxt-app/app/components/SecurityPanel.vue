<script setup lang="ts">
import type { SecurityProbeResult } from '../types/playground'

const props = defineProps<{
  results: SecurityProbeResult[]
  pending: boolean
}>()

const emit = defineEmits<{
  run: []
}>()
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="kicker">Security Baseline</p>
        <h2>Probes serveur</h2>
      </div>
      <button class="primary" type="button" :disabled="props.pending" @click="emit('run')">
        {{ props.pending ? 'Exécution…' : 'Lancer les probes' }}
      </button>
    </div>

    <p class="muted-copy">
      Vérifie CORS, request ID, méthode interdite, URL longue, corps surdimensionné, timeout et masquage des erreurs 5xx.
    </p>

    <div class="probe-list">
      <article v-for="result in props.results" :key="result.id" class="probe-row">
        <StatusBadge :label="result.passed ? 'validé' : 'échec'" :state="result.passed ? 'passed' : 'failed'" />
        <div>
          <strong>{{ result.label }}</strong>
          <p>{{ result.details }}<template v-if="result.status"> · HTTP {{ result.status }}</template></p>
        </div>
      </article>
      <div v-if="props.results.length === 0" class="empty-state">
        Aucun probe exécuté.
      </div>
    </div>
  </section>
</template>
