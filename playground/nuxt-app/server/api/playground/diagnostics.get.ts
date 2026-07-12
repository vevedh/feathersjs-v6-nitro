import { getFeathersV6NitroDiagnostics } from '@vevedh/feathersjs-v6-nitro'

export default defineEventHandler(() => {
  return getFeathersV6NitroDiagnostics(useNitroApp())
})
