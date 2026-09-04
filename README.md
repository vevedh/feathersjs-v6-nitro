# @vevedh/feathersjs-v6-nitro

Intégration native de **FeathersJS v6** dans **Nuxt 4 / Nitro 2** avec HTTP, SSE et un transport Socket.IO optionnel pour les déploiements Node.js.

Le cœur s'appuie sur les primitives Web Standards de Feathers v6 et de Nitro : `Request`, `Response`, `ReadableStream` et `AbortSignal`. Express, Koa et `@feathersjs/socketio` ne sont pas requis.

> Feathers v6 est actuellement utilisé via `feathers@6.0.0-pre.11`. Le bridge reste donc en version alpha tant que l'API officielle n'est pas stabilisée.

## Fonctionnalités

### Cœur HTTP et SSE

- conversion directe `H3Event` → Web Standard `Request` ;
- traitement par `createHandler` de `feathers/http` ;
- transmission des `Response` et streams à H3 sans buffer global ;
- registre isolé par `NitroApp` avec `WeakMap` ;
- enregistrement multi-instance atomique ;
- setup, cleanup et teardown idempotents ;
- routage exact/récursif configurable et restriction des méthodes HTTP ;
- limites d'URL et de corps, timeout, request ID et masquage des erreurs 5xx ;
- CORS désactivé par défaut ou activé avec une allowlist exacte ;
- SSE Feathers v6 avec channels, heartbeat, buffer borné et nettoyage réseau.

### DX et publication

- helpers typés `defineFeathersV6NitroInstance` et `defineFeathersV6NitroInstances` ;
- diagnostics opérationnels redacted via `getFeathersV6NitroDiagnostics` ;
- exports secondaires stricts et ESM-only ;
- tests unitaires, intégration H3, couverture V8 avec seuils et E2E Nuxt 4 ;
- contrôle `publint`, `@arethetypeswrong/cli` et contenu du tarball ;
- CI Linux/Windows sur Node.js 22.19.0 et 24.11.0, avec job de couverture V8 dédié ;
- publication npm sans token via GitHub Trusted Publishing (OIDC) avec provenance automatique.

### Compatibilité Socket.IO optionnelle

- sous-export séparé `@vevedh/feathersjs-v6-nitro/socket.io` ;
- aucune dépendance Socket.IO chargée par l'import principal ;
- attachement au serveur HTTP Node via les API publiques Socket.IO ;
- appels de méthodes Feathers avec acknowledgements ;
- publication des événements de channels ;
- contrôle d'origine exact, hook d'autorisation et cleanup sans arrêt du serveur Nitro.

## Playground Nuxt 4 complet

Le dépôt inclut une application de validation interactive couvrant HTTP, SSE, Socket.IO, multi-instance, diagnostics et sécurité.

```bash
pnpm install --frozen-lockfile
pnpm dev:playground
```

Avec Bun :

```bash
bun install
bun run dev:playground
```

Ouvrez `http://localhost:3000`. L'interface permet de :

- sélectionner le transport temps réel SSE ou Socket.IO ;
- exécuter le CRUD complet du service `messages` ;
- inspecter les événements `created`, `updated`, `patched` et `removed` ;
- vérifier trois applications Feathers isolées ;
- consulter les diagnostics redacted ;
- lancer huit probes de sécurité côté serveur ;
- exécuter une matrice fonctionnelle complète depuis le navigateur.

Le playground dispose aussi de six scénarios E2E Nuxt :

```bash
pnpm test:e2e
```

> Avec Bun, utilisez `bun run test` et non `bun test`. Le second lance le runner natif Bun, incompatible avec les mocks Vitest et le lifecycle de `@nuxt/test-utils`.

La documentation détaillée se trouve dans `playground/nuxt-app/README.md`.

## Prérequis

- Node.js `^22.19.0`, `^24.11.0` ou `>=26.0.0` ;
- Nuxt `4.5.2` pour la matrice de développement et le playground ;
- Vite `8.2.x` via Nuxt 4.5 ;
- Nitro 2.13 ou supérieur ;
- H3 `1.15.x` (la branche H3 2 / Nitro 3 n’est pas encore déclarée compatible) ;
- Feathers `6.0.0-pre.11` ou une version v6 compatible.

Le package est **ESM-only**, comme Nuxt 4, Nitro et Feathers v6. La matrice de validation du dépôt épingle Vite `8.2.2`, Vue `3.5.42` et Vue Router `5.2.0` afin de rendre les builds de stabilisation reproductibles.

## Installation

### HTTP et SSE

```bash
pnpm add @vevedh/feathersjs-v6-nitro feathers@6.0.0-pre.11
```

### Socket.IO optionnel

```bash
pnpm add socket.io@^4.8.3
```

Le navigateur ou une application cliente utilise séparément :

```bash
pnpm add socket.io-client@^4.8.3
```

## Application Feathers

```ts
// server/feathers/app.ts
import { feathers, type Id, type Params } from 'feathers'

interface Message {
  id: number
  text: string
}

class MessageService {
  private readonly items: Message[] = [{ id: 1, text: 'Bonjour' }]

  async find(_params?: Params): Promise<Message[]> {
    return [...this.items]
  }

  async get(id: Id): Promise<Message> {
    const item = this.items.find(message => String(message.id) === String(id))
    if (!item) {
      throw new Error('Message introuvable')
    }
    return item
  }

  async create(data: Pick<Message, 'text'>): Promise<Message> {
    const text = data.text.trim()
    if (text.length === 0 || text.length > 500) {
      throw new TypeError('Le texte doit contenir entre 1 et 500 caractères.')
    }

    const item = { id: this.items.length + 1, text }
    this.items.push(item)
    return item
  }
}

export const publicApp = feathers()
publicApp.use('messages', new MessageService(), {
  methods: ['find', 'get', 'create'],
})
```

Les entrées métier doivent être validées dans les services ou leurs hooks, par exemple avec Zod. Le bridge limite et transporte les données ; il ne transforme pas silencieusement leur contenu.

Évitez les champs privés ECMAScript `#field` dans les classes de service. Le wrapping Feathers peut modifier le récepteur `this`. Utilisez `private` TypeScript ou une fermeture.

## Configuration typée

```ts
// server/feathers/options.ts
import { defineFeathersV6NitroInstance } from '@vevedh/feathersjs-v6-nitro/define'
import { publicApp } from './app'

export const publicFeathersOptions = defineFeathersV6NitroInstance({
  id: 'public-api',
  app: publicApp,
  basePath: '/api/feathers',
  autoSetup: true,
  autoTeardown: true,
  routing: {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },
  security: {
    maxBodySize: 1024 * 1024,
    maxUrlLength: 8192,
    requestTimeoutMs: 30_000,
    exposeErrors: false,
    cors: false,
  },
  metadata: {
    scope: 'public',
  },
})
```

Le helper est une fonction d'identité : il n'altère pas la configuration et conserve l'inférence TypeScript stricte.

## Plugin Nuxt mono-instance

```ts
// server/plugins/01-feathers-v6.ts
import { createFeathersV6NitroPlugin } from '@vevedh/feathersjs-v6-nitro'
import { publicFeathersOptions } from '../feathers/options'

export default createFeathersV6NitroPlugin(publicFeathersOptions)
```

Les services sont disponibles sous le préfixe configuré :

```text
GET    /api/feathers/messages
GET    /api/feathers/messages/1
POST   /api/feathers/messages
PUT    /api/feathers/messages/1
PATCH  /api/feathers/messages/1
DELETE /api/feathers/messages/1
```

## Multi-instance strict

```ts
import {
  createFeathersV6MultiNitroPlugin,
} from '@vevedh/feathersjs-v6-nitro'
import {
  defineFeathersV6NitroInstances,
} from '@vevedh/feathersjs-v6-nitro/define'
import { adminApp, publicApp } from '../feathers/apps'

const instances = defineFeathersV6NitroInstances([
  {
    id: 'public',
    app: publicApp,
    basePath: '/api/public',
    security: { cors: false },
  },
  {
    id: 'admin',
    app: adminApp,
    basePath: '/api/admin',
    routing: {
      methods: ['GET', 'HEAD', 'OPTIONS'],
    },
    security: {
      maxBodySize: 0,
      cors: false,
    },
  },
] as const)

export default createFeathersV6MultiNitroPlugin(instances)
```

La déclaration complète est validée avant le premier montage. En cas de conflit, aucune instance n'est conservée et aucune route n'est montée.

Sont refusés :

- les identifiants en double ;
- le même objet `Application` monté deux fois ;
- les `basePath` identiques ou imbriqués ;
- les configurations sans route exacte ni wildcard.

Le registre permet une résolution stricte par chemin :

```ts
const entry = registry.getByPath('/api/public/messages')
```

`/api/public-admin` ne correspond pas à `/api/public`.

## Contexte Nitro dans les services

```ts
import type { Params } from 'feathers'

export class AuditService {
  async find(params?: Params) {
    return {
      instanceId: params?.nitro?.instanceId,
      basePath: params?.nitro?.basePath,
      requestId: params?.nitro?.requestId,
      scope: params?.nitro?.metadata['scope'],
    }
  }
}
```

`params.nitro.event` donne accès au `H3Event`. Cet objet reste strictement côté serveur et ne doit jamais être sérialisé.

Le `Request` Web standard Feathers est disponible dans `params.request`. Une opération longue peut écouter `params.request.signal` pour interrompre son travail lorsque le client se déconnecte ou que le timeout expire.

## Diagnostics opérationnels

```ts
import { getFeathersV6NitroDiagnostics } from '@vevedh/feathersjs-v6-nitro/diagnostics'

const diagnostics = getFeathersV6NitroDiagnostics(nitroApp)
```

Le résultat contient uniquement :

- l'identifiant de l'instance ;
- son `basePath` ;
- son état de lifecycle ;
- les routes réellement montées ;
- le chemin SSE éventuel.

L'application Feathers, les middlewares, `metadata` et les événements H3 ne sont jamais exposés par cette API.

## Baseline sécurité

### Valeurs par défaut

```ts
security: {
  maxBodySize: 1_048_576,
  maxUrlLength: 8192,
  requestTimeoutMs: 30_000,
  exposeErrors: false,
  cors: false,
  requestId: {
    headerName: 'x-request-id',
    acceptIncoming: false,
  },
}
```

Le timeout couvre l'attente des en-têtes de réponse Feathers. Le signal est propagé au `Request`, mais une opération métier qui ignore ce signal peut continuer côté serveur après une réponse `408`.

Les formats structurés JSON, URL encoded et multipart sont lus sous une limite stricte. Les autres types de contenu restent streamés avec comptage des octets.

### CORS avec allowlist

```ts
security: {
  cors: {
    origins: ['https://app.example.org'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    headers: ['content-type', 'authorization'],
    exposedHeaders: ['x-request-id'],
    credentials: true,
    maxAge: 600,
  },
}
```

Les origines sont exactes. `*` est interdit avec `credentials: true`. Un preflight provenant d'une origine, méthode ou liste d'en-têtes non autorisée est rejeté.

`preserveFeathersCorsHeaders` reste disponible uniquement pour compatibilité avec le handler Feathers v6 actuel. Son utilisation en production est déconseillée.

## SSE natif Feathers v6

Le transport SSE est désactivé par défaut. Il se configure par instance :

```ts
export default createFeathersV6NitroPlugin({
  id: 'public-api',
  app: publicApp,
  basePath: '/api/feathers',
  sse: {
    path: 'events',
    heartbeatIntervalMs: 15_000,
    maxBufferedEvents: 1000,
  },
})
```

L'endpoint devient :

```text
GET /api/feathers/events
```

Le bridge enregistre un service SSE Nitro-aware avant `app.setup()`. Il utilise les channels Feathers et nettoie la connexion dès que le client ferme la réponse HTTP.

Aucun channel n'est rejoint automatiquement. La politique de publication reste explicite :

```ts
publicApp.on('connection', (connection) => {
  publicApp.channel('public').join(connection)
})

publicApp.publish(() => publicApp.channel('public'))
```

Une politique réelle doit sélectionner les channels selon l'utilisateur authentifié, le tenant et les capacités RBAC.

### Client navigateur minimal

```ts
const source = new EventSource('/api/feathers/events')

source.onmessage = (event) => {
  const payload = JSON.parse(event.data) as {
    event: string
    path?: string
    data: unknown
  }

  if (payload.event === 'created' && payload.path === 'messages') {
    console.log(payload.data)
  }
}

source.onerror = () => {
  source.close()
}
```

Le flux émet `connected`, les événements Feathers publiés, les heartbeats configurés et `overflow` avant fermeture lorsque le buffer maximal est dépassé.

## Socket.IO optionnel

Socket.IO est un transport de compatibilité **Node-only**. Il n'est pas nécessaire pour HTTP ou SSE et n'est pas compatible avec les presets edge qui ne fournissent pas un serveur HTTP Node.

### Plugin composite HTTP + SSE + Socket.IO

```ts
// server/plugins/01-feathers-public.ts
import {
  createFeathersV6NitroSocketIoPlugin,
} from '@vevedh/feathersjs-v6-nitro/socket.io'
import { publicApp } from '../feathers/app'

export default createFeathersV6NitroSocketIoPlugin(
  {
    id: 'public-api',
    app: publicApp,
    basePath: '/api/feathers',
    sse: {
      path: 'events',
    },
    security: {
      cors: false,
    },
  },
  {
    path: '/socket.io',
    bootstrapPath: '/_feathers/socket.io/bootstrap',
    origins: ['https://app.example.org'],
    allowMissingOrigin: false,
    trustProxy: false,
    exposeErrors: false,
    serverOptions: {
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 64 * 1024,
    },
    async authorize({ socket }) {
      // Vérifier ici un token/cookie signé et retourner uniquement
      // des attributs serveur fiables destinés à params.connection.
      return {
        tenantId: 'tenant-a',
        remoteAddress: socket.handshake.address,
      }
    },
  },
)
```

Les chemins Socket.IO et bootstrap doivent rester hors du `basePath` HTTP Feathers. Tout chevauchement est refusé, notamment avec un `basePath: '/'`.

### Client Socket.IO

Pour une connexion `websocket` directe, appelez d'abord le bootstrap. Une requête HTTP normale ou le transport polling attache automatiquement Socket.IO ; l'upgrade WebSocket initial contourne en revanche le routeur H3.

```ts
import { io } from 'socket.io-client'

await fetch('/_feathers/socket.io/bootstrap')

const socket = io(window.location.origin, {
  path: '/socket.io',
  transports: ['websocket'],
  reconnection: true,
})

interface Message {
  id: number
  text: string
}

function findMessages(): Promise<Message[]> {
  return new Promise((resolve, reject) => {
    socket.emit('find', 'messages', {}, (error: unknown, result: Message[]) => {
      if (error) {
        reject(error)
        return
      }
      resolve(result)
    })
  })
}

socket.on('messages created', (message: Message) => {
  console.log('Nouveau message', message)
})
```

Le protocole suit le format historique Feathers Socket.IO :

```text
socket.emit(method, servicePath, ...serviceArguments, acknowledgement)
```

Les méthodes disponibles sont déterminées à la connexion depuis les services enregistrés. Les services ajoutés dynamiquement après la connexion nécessitent une reconnexion du client.

### Sécurité Socket.IO

- les origines navigateur sont comparées exactement ;
- same-origin est autorisé automatiquement ;
- `trustProxy` est désactivé par défaut ;
- `allowMissingOrigin` vise les clients non-navigateurs et peut être désactivé ;
- `authorize` doit vérifier l'identité avant l'événement Feathers `connection` ;
- aucun channel global n'est rejoint automatiquement ;
- les erreurs 5xx inconnues sont masquées par défaut ;
- le cleanup déconnecte les sockets sans fermer le serveur HTTP Nitro.

## Routage avancé

```ts
routing: {
  methods: ['GET', 'HEAD', 'OPTIONS'],
  mountExact: true,
  mountWildcard: true,
}
```

Pour un montage racine, le wildcard généré est explicitement `/**`. Une configuration où `mountExact` et `mountWildcard` valent tous deux `false` est refusée.

## Cycle de vie

Chaque entrée mémorise une seule promesse de setup et de teardown. Des requêtes concurrentes n'exécutent donc pas plusieurs fois `app.setup()`.

Les transports optionnels enregistrent leurs callbacks de nettoyage sur l'entrée. Ils sont exécutés en ordre inverse avant `app.teardown()`, même lorsqu'un autre cleanup échoue.

Hooks Nitro disponibles :

- `feathers:v6:beforeSetup` ;
- `feathers:v6:afterSetup` ;
- `feathers:v6:setupError` ;
- `feathers:v6:beforeTeardown` ;
- `feathers:v6:afterTeardown`.

## Exports publics

```text
@vevedh/feathersjs-v6-nitro
@vevedh/feathersjs-v6-nitro/define
@vevedh/feathersjs-v6-nitro/diagnostics
@vevedh/feathersjs-v6-nitro/handler
@vevedh/feathersjs-v6-nitro/lifecycle
@vevedh/feathersjs-v6-nitro/path
@vevedh/feathersjs-v6-nitro/registry
@vevedh/feathersjs-v6-nitro/security
@vevedh/feathersjs-v6-nitro/sse
@vevedh/feathersjs-v6-nitro/types
@vevedh/feathersjs-v6-nitro/socket.io
```

L'import racine ne réexporte pas Socket.IO afin de préserver le tree-shaking et de ne pas imposer le peer optionnel.

## Commandes

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
pnpm check:contract
pnpm check:publint
pnpm check:types-package
pnpm pack:check
pnpm verify:release
pnpm validate:patch010:windows
pnpm bootstrap:patch011:windows   # migration/regeneration only
pnpm validate:patch011:windows    # frozen final baseline
pnpm dev:playground
```

## Qualité et couverture


Le gate de release exécute la couverture V8 sur le code `src/` avec les seuils globaux suivants :

- lignes : **80 %** ;
- fonctions : **80 %** ;
- statements : **80 %** ;
- branches : **75 %**.

Le fichier purement déclaratif `src/runtime/types.ts` est exclu de ces métriques. La CI conserve `coverage/coverage-summary.json` et `coverage/lcov.info` comme artefacts de diagnostic pendant 14 jours. Les seuils sont fixes (`autoUpdate` désactivé) : toute hausse devra être une décision explicite de patch.

La baseline Patch 011 validée atteint **83,56 % statements**, **76,49 % branches**, **82,50 % functions** et **83,48 % lines** sur 67 tests unitaires. La baseline de couverture reste celle du Patch 011. Pour la release courante, utiliser `pnpm validate:patch013:windows`; `bootstrap:patch011:windows` reste réservé à une future régénération explicite du lockfile.

## Publication

La publication npm passe exclusivement par **GitHub Trusted Publishing (OIDC)**. Le workflow `.github/workflows/release.yml` exécute le gate complet, utilise un runner GitHub hébergé avec `id-token: write`, puis publie sous le dist-tag `next` sans token npm longue durée. npm génère automatiquement la provenance pour ce package public publié depuis ce dépôt public.

Une publication locale avec `npm publish` est volontairement bloquée par `prepublishOnly`. Pour publier :

1. configurer une fois le Trusted Publisher npm pour `vevedh/feathersjs-v6-nitro`, workflow `release.yml`, environnement `npm`, avec l'action `npm publish` autorisée ;
2. pousser la version validée sur `main` ;
3. lancer le workflow GitHub Actions **Publish npm** depuis `main`.

Le workflow exécute finalement :

```bash
npm publish --access public --tag next
```

Il ne doit contenir ni `NPM_TOKEN`, ni `NODE_AUTH_TOKEN`, ni `--provenance`. Voir [RELEASING.md](./RELEASING.md) pour la procédure complète.

## État de la version 0.1.0-alpha.10

- Patch 001 : bridge HTTP natif et lifecycle ;
- Patch 002 : multi-instance atomique et routage avancé ;
- Patch 003 : baseline sécurité ;
- Patch 004 : SSE natif Feathers v6 avec channels et nettoyage réseau ;
- Patch 005 : DX, CI multi-OS et chaîne de publication vérifiée ;
- Patch 006 : Socket.IO Node optionnel, isolé du cœur ;
- Patch 007 : playground Nuxt 4 complet avec matrice HTTP, SSE, Socket.IO, multi-instance et sécurité ;
- Patch 008 : teardown résilient et nettoyage des transports même avant setup ou après échec de setup ;
- Patch 009 : baseline Nuxt `4.5.2`, Vite `8.2.2`, Vue `3.5.42`, Vitest `4.1.11` et Node `22.19+` ;
- Patch 010 : promotion `0.1.0-alpha.8`, lockfile régénéré puis figé et gate de release Windows complet validé ;
- Patch 011 : `0.1.0-alpha.9` validé avec couverture V8 obligatoire, 67/67 tests unitaires, 6/6 E2E, seuils CI, contrôles de fuite de listeners et lockfile figé.
- Patch 012 : migration de la publication vers npm Trusted Publishing/OIDC, suppression des tokens longue durée, provenance automatique et compatibilité npm 12.
- Patch 013 : promotion vers `0.1.0-alpha.10` sans changement runtime et ajout d’un préflight registre qui refuse une version npm déjà publiée avant d’exécuter le gate CI complet.

## Contribution et sécurité

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)

## License

MIT
