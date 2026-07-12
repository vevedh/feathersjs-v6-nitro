# Changelog

## 0.1.0-alpha.7 — 2026-07-12

### Ajouté — Patch 007

- playground Nuxt 4 complet avec tableau de bord responsive ;
- sélection dynamique du transport SSE ou Socket.IO ;
- journal temps réel des événements de services ;
- CRUD `find/get/create/update/patch/remove` du service `messages` ;
- troisième instance Feathers dédiée au laboratoire sécurité ;
- endpoint de diagnostics redacted ;
- huit probes de sécurité exécutables depuis l'interface ;
- matrice fonctionnelle intégrée testant HTTP, multi-instance, diagnostics, sécurité, SSE et Socket.IO ;
- contexte Socket.IO enrichi via le hook `authorize` ;
- scripts `dev:playground`, `test:vitest` et `test:playground` ;
- documentation de lancement pnpm et Bun.

### Sécurité

- validation stricte des entrées du playground ;
- rejet des clés de pollution de prototype ;
- profondeur, nombre de propriétés et taille des tableaux bornés ;
- instance laboratoire limitée à 1 Kio, URL 512 caractères et timeout 600 ms ;
- CORS de laboratoire fondé sur une allowlist exacte ;
- erreurs internes masquées dans les probes.

### Tests

- 54 tests unitaires et intégration conservés ;
- E2E Nuxt étendus de 3 à 6 scénarios ;
- build client, SSR et Nitro du playground validé.

## 0.1.0-alpha.6 — 2026-07-11

### Ajouté — Patch 006

- sous-export optionnel `@vevedh/feathersjs-v6-nitro/socket.io` ;
- transport Socket.IO Node attaché au serveur Nitro via les API publiques ;
- plugin composite HTTP/SSE/Socket.IO ;
- protocole d'appels Feathers par acknowledgements ;
- publication des événements de channels sous la forme `<service> <event>` ;
- endpoint de bootstrap pour les premières connexions WebSocket directes ;
- contrôle same-origin et allowlist exacte d'origines supplémentaires ;
- hook `authorize` pour enrichir `params.connection` après vérification ;
- limites d'arguments, validation des méthodes et normalisation des erreurs ;
- tests Socket.IO réseau et scénario E2E Nuxt 4.

### Sécurité

- refus des chevauchements entre `basePath`, chemin Socket.IO et bootstrap ;
- `trustProxy` désactivé par défaut ;
- aucune adhésion automatique à un channel ;
- détails 5xx inconnus masqués par défaut ;
- le teardown du transport n'arrête pas le serveur HTTP Nitro.

### Changé

- `socket.io` est un peer dependency optionnel et n'est jamais importé par l'entrée principale ;
- version consolidée des Patches 005 et 006.

## 0.1.0-alpha.5 — 2026-07-11

### Ajouté — Patch 005

- helpers de configuration typés `defineFeathersV6NitroInstance(s)` ;
- diagnostics opérationnels redacted ;
- callbacks de cleanup par instance, exécutés avant `app.teardown()` ;
- `CONTRIBUTING.md` et `SECURITY.md` ;
- contrôle statique du contrat `package.json` ;
- vérification des exports construits ;
- vérifications `publint` et `@arethetypeswrong/cli` ;
- inspection stricte du contenu du tarball npm ;
- CI GitHub Actions Linux/Windows sur Node.js 22 et 24 ;
- workflow de publication npm avec provenance et dist-tag explicite.

### Changé

- la validation de release regroupe qualité, build Nuxt, E2E et inspection du paquet ;
- les exports secondaires sont documentés et testés individuellement.

## 0.1.0-alpha.3 — 2026-07-11

### Ajouté — Patch 004

- service SSE Nitro-aware fondé sur les channels Feathers v6 ;
- enregistrement automatique et configurable du service SSE avant `app.setup()` ;
- endpoint SSE relatif au `basePath` de chaque instance ;
- événements `connected`, `heartbeat` et `overflow` ;
- limite de buffer par connexion ;
- en-têtes anti-buffering pour Nginx et proxies compatibles ;
- propagation des événements `created`, `updated`, `patched` et `removed` publiés par Feathers ;
- tests HTTP réels de connexion, publication, heartbeat et déconnexion.

### Corrigé

- liaison du signal d'abandon au `ServerResponse.close` H3 afin de supprimer immédiatement les listeners SSE après une déconnexion réseau ;
- conservation du signal réseau après production des en-têtes, tout en supprimant le timeout pour les streams longs.

## 0.1.0-alpha.2 — 2026-07-11

### Ajouté — Patch 003

- taille maximale configurable des corps, y compris pour les requêtes chunked ;
- longueur maximale de l'URL ;
- restriction des méthodes HTTP avant Feathers ;
- timeout jusqu'à production des en-têtes de réponse ;
- request ID généré côté serveur et exposé à `params.nitro.requestId` ;
- acceptation optionnelle d'un request ID client strictement validé ;
- masquage par défaut des détails d'erreur 5xx ;
- politique CORS avec allowlist d'origines, méthodes et en-têtes ;
- refus de `*` lorsque les credentials CORS sont activés ;
- parser sécurisé JSON, URL encoded et multipart ;
- tests de limites, CORS, timeout et redaction.

### Corrigé

- drainage du flux H3 après dépassement de limite afin d'éviter une écriture dans un contrôleur Web Stream déjà fermé.

## 0.1.0-alpha.1 — 2026-07-11

### Ajouté — Patch 002

- enregistrement multi-instance atomique ;
- validation complète avant montage de la première route ;
- recherche d'instance par chemin complet avec `getByPath()` ;
- options `mountExact`, `mountWildcard` et allowlist de méthodes ;
- suivi des routes réellement montées dans chaque entrée ;
- montage racine explicite via `/**` ;
- agrégation des erreurs de teardown ;
- playground avec applications publique et administration isolées.

### Corrigé

- aucune entrée partielle n'est conservée lorsqu'une déclaration multi-instance contient un conflit ;
- l'état passe à `closed` même lorsqu'un teardown Feathers échoue.

## 0.1.0-alpha.0 — 2026-07-10

### Ajouté — Patch 001

- publication ESM-only, conforme au runtime Nitro ;
- nouveau package `@vevedh/feathersjs-v6-nitro` ;
- intégration native avec `feathers/http` ;
- conversion `H3Event` vers Web Standard `Request` ;
- restitution des Web Standard `Response` et streams à H3 ;
- registre `WeakMap` isolé par application Nitro ;
- setup et teardown idempotents ;
- factories mono-instance et multi-instance ;
- contexte `params.nitro` dans les services ;
- suppression par défaut des en-têtes CORS permissifs ;
- playground Nuxt 4 avec service `messages` ;
- tests de chemin, registre, lifecycle, plugin et transport HTTP.

### Supprimé par rapport à la source d'inspiration

- adaptateurs Express et Koa dans le cœur ;
- intégration Socket.IO reposant sur des API privées ;
- singleton global de processus ;
- hooks globaux `feathers:afterSetup` pouvant monter plusieurs fois les routes.
