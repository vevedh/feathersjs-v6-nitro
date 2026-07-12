<script setup lang="ts">
import type { MessageRecord } from '../types/playground'

const props = defineProps<{
  messages: MessageRecord[]
  pending: boolean
}>()

const emit = defineEmits<{
  create: [text: string]
  patch: [id: number, text: string]
  remove: [id: number]
  refresh: []
}>()

const newText = ref('Bonjour depuis le playground Nuxt 4')
const editId = ref<number | null>(null)
const editText = ref('')

function beginEdit(message: MessageRecord): void {
  editId.value = message.id
  editText.value = message.text
}

function submitCreate(): void {
  const value = newText.value.trim()
  if (!value) return
  emit('create', value)
  newText.value = ''
}

function submitPatch(id: number): void {
  const value = editText.value.trim()
  if (!value) return
  emit('patch', id, value)
  editId.value = null
}
</script>

<template>
  <section class="panel span-2">
    <div class="panel-heading">
      <div>
        <p class="kicker">Service Feathers v6</p>
        <h2>CRUD complet des messages</h2>
      </div>
      <button class="ghost" type="button" :disabled="props.pending" @click="emit('refresh')">
        Actualiser
      </button>
    </div>

    <form class="inline-form" @submit.prevent="submitCreate">
      <label class="sr-only" for="new-message">Nouveau message</label>
      <input id="new-message" v-model="newText" maxlength="500" autocomplete="off">
      <button class="primary" :disabled="props.pending || !newText.trim()">
        Créer
      </button>
    </form>

    <div class="message-list">
      <article v-for="message in props.messages" :key="message.id" class="message-card">
        <div class="message-main">
          <span class="message-id">#{{ message.id }}</span>
          <template v-if="editId === message.id">
            <input v-model="editText" maxlength="500" @keyup.enter="submitPatch(message.id)">
          </template>
          <template v-else>
            <strong>{{ message.text }}</strong>
            <small>Mis à jour {{ new Date(message.updatedAt).toLocaleString() }}</small>
          </template>
        </div>
        <div class="message-actions">
          <template v-if="editId === message.id">
            <button class="primary compact" type="button" @click="submitPatch(message.id)">Enregistrer</button>
            <button class="ghost compact" type="button" @click="editId = null">Annuler</button>
          </template>
          <template v-else>
            <button class="ghost compact" type="button" @click="beginEdit(message)">Modifier</button>
            <button class="danger-button compact" type="button" @click="emit('remove', message.id)">Supprimer</button>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>
