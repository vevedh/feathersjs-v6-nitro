# Changelog

## 0.1.0-alpha.9 — 2026-09-04

### Patch 012-r3 — setup-node v7 OIDC compatibility

- Use `actions/setup-node@v7` in the npm release workflow.
- Keep the strict Trusted Publishing guard: real `NODE_AUTH_TOKEN`/`NPM_TOKEN` credentials remain forbidden.
- Fix the GitHub Actions failure caused by the legacy `XXXXX-XXXXX-XXXXX-XXXXX` dummy `NODE_AUTH_TOKEN` exported by older setup-node releases when `registry-url` is configured.
- No runtime, test, dependency, lockfile, coverage threshold, or package version change.


### Publication sécurisée — Patch 012

- migration du workflow npm vers **GitHub Trusted Publishing (OIDC)** ;
- suppression de `NODE_AUTH_TOKEN`, `NPM_TOKEN` et du flag `--provenance` dans le workflow de release ; npm génère automatiquement la provenance avec Trusted Publishing ;
- suppression de `publishConfig.provenance` afin de ne plus déclencher une génération de provenance impossible depuis un poste local ;
- ajout d'un `prepublishOnly` qui bloque volontairement toute publication hors du workflow GitHub `release.yml` sur `main` et vérifie la présence du contexte OIDC ;
- workflow limité à `main`, runner GitHub `ubuntu-latest`, environnement GitHub `npm`, `id-token: write`, npm CLI `11.19.0` et pnpm `9.15.9` ;
- ajout de `pnpm check:publishing`, inclus dans `verify`, pour empêcher le retour d'un token npm longue durée, de `--provenance`, de `latest` ou d'un runner self-hosted ;
- ajout de `RELEASING.md` avec la configuration Trusted Publisher et la procédure de publication ;
- aucun changement runtime, aucune dépendance applicative modifiée et lockfile Patch 011 conservé.
- Patch 012-r2 : le self-test du garde de publication locale est désormais exécuté via un helper Node cross-platform ; cela évite `NativeCommandError` sous Windows PowerShell 5.1 lorsqu'un échec Node est volontairement attendu.

### Compatibilité lint — Patch 011-r3

- nettoyage de compatibilité avec `typescript-eslint 8.69.0` : suppression d'assertions de type et d'un default assignment devenus inutiles, sans changement de comportement runtime attendu.

### Qualité et couverture — Patch 011

- ajout de `@vitest/coverage-v8` `4.1.11`, strictement aligné sur Vitest `4.1.11` ;
- ajout du gate `pnpm test:coverage`, désormais obligatoire dans `verify` et donc dans `verify:release` ;
- seuils V8 initiaux : 80 % lignes, fonctions et statements, 75 % branches ;
- rapports `text`, `json-summary` et `lcov`, avec conservation CI des résumés de couverture ;
- ajout d'un job CI dédié à la couverture sur Ubuntu / Node `22.19.0` ;
- matrice CI rendue déterministe sur Node `22.19.0` et `24.11.0`.

### Tests de non-régression

- Patch 011-r2 : après le premier gate Windows à **71,15 % de branches**, ajout de tests ciblés sécurité/réponse sans abaisser le seuil de 75 % ;
- couverture directe de `response.ts`, des validations CORS/request-id, de `Content-Length`, des politiques SSE/5xx et du contrôleur de timeout ;
- lifecycle : vérifie l'agrégation simultanée d'une erreur de cleanup transport et d'une erreur `app.teardown()` tout en fermant l'instance ;
- SSE : vérifie que le listener `publish` ajouté par une connexion est retiré après annulation du stream ;
- Socket.IO : vérifie que les listeners applicatifs `publish`, `disconnect` et `logout` sont retirés exactement une fois lors d'un `close()` idempotent.

### Outillage

- `publint` `0.3.15` → `0.3.24` ;
- `@types/node` `22.20.0` → `22.20.1`, en restant volontairement sur la ligne Node 22 ;
- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` et `typescript-eslint` `8.46.1` → `8.69.0` ;
- ajout de `pnpm bootstrap:patch011:windows` pour régénérer le lockfile, exécuter la couverture puis le gate complet avant gel définitif.

### Validation finale — Patch 011

- lockfile réellement régénéré sous Windows avec Node `22.19.0` et pnpm `9.15.9`, puis figé pour les installations reproductibles ;
- typecheck et lint `typescript-eslint@8.69.0` verts après nettoyage des trois diagnostics r3 ;
- **67/67 tests unitaires** ; couverture V8 globale : **83,56 % statements**, **76,49 % branches**, **82,50 % functions**, **83,48 % lines** ;
- build package, contrats package/toolchain, exports, publint, ATTW et build Nuxt 4.5.2 / Vite 8.2.2 verts ;
- **6/6 E2E** validés : page playground, CRUD Feathers v6, multi-instance/diagnostics, sécurité, SSE et Socket.IO ;
- `pack:check` vert avec tarball `@vevedh/feathersjs-v6-nitro@0.1.0-alpha.9` de 41 entrées ;
- ajout de `pnpm validate:patch011:windows`, qui impose `pnpm install --frozen-lockfile` avant le gate complet.

### Inchangé volontairement

- Feathers `6.0.0-pre.11` ;
- Nuxt `4.5.2`, Nitro `2.13.4`, H3 `1.15.11`, Vite `8.2.2`, Vue `3.5.42`, Vue Router `5.2.0` ;
- TypeScript `5.9.3`, Socket.IO `4.8.3`, pnpm `9.15.9` ;
- publication npm sous dist-tag `next` uniquement.

## 0.1.0-alpha.8 — 2026-09-04

### Corrigé — Patch 008

- le teardown exécute les callbacks de nettoyage même si l’instance n’a jamais été initialisée ou si `app.setup()` échoue ;
- une erreur du hook `feathers:v6:beforeTeardown` n’empêche plus le nettoyage des transports ni `app.teardown()` ;
- les erreurs de hooks et de cleanup sont agrégées après tentative de fermeture complète ;
- le peer dependency H3 est limité à la ligne réellement validée avec Nitro 2 : `>=1.15.0 <2.0.0`.

### Dépendances — Patch 009

- Nuxt `4.4.8` → `4.5.2` ;
- migration Vite 7 → Vite `8.2.2` ;
- `@nuxt/test-utils` `4.0.3` → `4.2.0` ;
- Vitest `4.1.9` → `4.1.11` ;
- `vue-tsc` `3.3.5` → `3.3.11` ;
- résolution déterministe de Vue `3.5.42` et Vue Router `5.2.0` ;
- baseline Node alignée sur Nuxt 4.5.2 : `^22.19.0 || ^24.11.0 || >=26.0.0` ;
- Feathers reste épinglé à `6.0.0-pre.11`, Nitro à `2.13.4`, H3 à `1.15.11`, Socket.IO à `4.8.3` et TypeScript à `5.9.3`.

### Validation et publication — Patch 010

- intégration du `pnpm-lock.yaml` réellement régénéré avec pnpm `9.15.9` ;
- disparition des anciennes résolutions Nuxt `4.4.8`, Vite `7.3.6` et Vue Router `5.0.3` du lockfile ;
- validation Windows avec Node `22.19.0` : typecheck, lint, **57/57 tests**, build package, contrats, exports, publint, ATTW et build Nuxt production ;
- validation **6/6 E2E** : HTTP CRUD, multi-instance, diagnostics, probes de sécurité, SSE et Socket.IO ;
- `pack:check` validé avec un tarball npm de 41 entrées ;
- ajout de `pnpm validate:patch010:windows` qui impose désormais `pnpm install --frozen-lockfile` avant le gate complet ;
- `publishConfig.tag` et le workflow GitHub de release verrouillent la publication sur le dist-tag npm `next` tant que Feathers v6 demeure en prérelease.
- validation finale de `pnpm validate:patch010:windows` avec installation `--frozen-lockfile`, **57/57 tests unitaires** et **6/6 E2E** ;
- correction du caractère `\` parasite en tête de `scripts/validate-patch010.ps1` et messages ASCII-only pour Windows PowerShell 5.1.

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
