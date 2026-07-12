<script setup lang="ts">
import type { TestResult } from '../types/playground'

const props = defineProps<{
  tests: TestResult[]
  pending: boolean
}>()

const emit = defineEmits<{
  run: []
}>()
</script>

<template>
  <section class="panel span-2">
    <div class="panel-heading">
      <div>
        <p class="kicker">Validation fonctionnelle</p>
        <h2>Matrice complète du playground</h2>
      </div>
      <button class="primary" type="button" :disabled="props.pending" @click="emit('run')">
        {{ props.pending ? 'Tests en cours…' : 'Tout tester' }}
      </button>
    </div>

    <div class="test-grid">
      <article v-for="test in props.tests" :key="test.id" class="test-card">
        <StatusBadge
          :label="test.status"
          :state="test.status === 'running' ? 'running' : test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : 'idle'"
        />
        <strong>{{ test.label }}</strong>
        <p>{{ test.details ?? 'Non exécuté' }}</p>
      </article>
    </div>
  </section>
</template>
