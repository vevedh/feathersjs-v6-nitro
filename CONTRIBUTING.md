# Contribuer à @vevedh/feathersjs-v6-nitro

Merci de contribuer à l'intégration FeathersJS v6 pour Nitro.

## Environnement

- Node.js 22.12 ou supérieur ;
- pnpm 9.15.9 ;
- Git avec fins de ligne normalisées.

```bash
pnpm install --frozen-lockfile
pnpm verify:release
```

## Principes d'architecture

- conserver le cœur HTTP/SSE indépendant d'Express, Koa et Socket.IO ;
- utiliser les primitives Web Standards lorsque Nitro et Feathers les exposent ;
- ne pas appeler d'API privée de H3, Engine.IO ou Socket.IO ;
- isoler chaque registre par `NitroApp` ;
- valider une déclaration multi-instance avant toute mutation ;
- préserver les limites, le masquage d'erreur et la politique same-origin ;
- ne jamais rejoindre automatiquement un channel global ;
- maintenir l'import `./socket.io` optionnel et Node-only.

## Déroulement d'une modification

1. Lire `AGENTS.md`, `patch-memory/000-index.md` et la dernière mémoire de patch.
2. Ajouter ou adapter les tests avant de considérer le changement terminé.
3. Mettre à jour la documentation publique et les notes privées utiles.
4. Exécuter la matrice locale complète.
5. Inspecter le tarball npm produit.

## Commandes ciblées

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm check:contract
pnpm test:exports
pnpm check:publint
pnpm check:types-package
pnpm pack:check
```

## Tests attendus

Une correction de transport doit au minimum vérifier :

- le comportement nominal ;
- une entrée invalide ou hostile ;
- le cleanup et l'absence de listener résiduel ;
- la compatibilité avec plusieurs instances ;
- l'absence de fuite de détails internes dans les erreurs.

Une évolution Socket.IO doit aussi être validée par un client réseau réel et ne doit pas fermer le serveur HTTP Nitro lors du teardown du transport.

## Pull requests

La description doit indiquer :

- le problème résolu ;
- le choix d'architecture ;
- les risques et limites ;
- les validations exécutées ;
- les changements d'API publique ou de peer dependencies.

Les données personnelles, secrets, domaines internes et jetons ne doivent jamais être ajoutés aux fixtures ou aux journaux.
