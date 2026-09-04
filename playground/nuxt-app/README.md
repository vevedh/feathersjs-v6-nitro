# Playground Nuxt 4

Ce playground valide toutes les couches de `@vevedh/feathersjs-v6-nitro` depuis une application Nuxt 4 réelle.

La baseline validée des Patches 009/010 est **Nuxt `4.5.2` + Vite `8.2.2`**, avec Vue `3.5.42` et Vue Router `5.2.0` résolus par le workspace.

## Fonctionnalités testables depuis l'interface

- CRUD Feathers v6 complet : `find`, `get`, `create`, `update`, `patch`, `remove` ;
- transport HTTP Web Standards via Nitro ;
- temps réel SSE natif ;
- transport Socket.IO optionnel ;
- hook Socket.IO `authorize` et contexte de connexion ;
- trois applications Feathers isolées ;
- diagnostics redacted du registre Nitro ;
- request ID entrant ou généré ;
- allowlist de méthodes HTTP ;
- limites d'URL et de corps ;
- timeout ;
- masquage des erreurs 5xx ;
- allowlist CORS et rejet d'une origine non fiable.

## Lancement avec pnpm

Depuis la racine du dépôt :

```bash
pnpm install --frozen-lockfile
pnpm dev:playground
```

## Lancement avec Bun

Bun peut piloter le script Nuxt sans remplacer Vitest :

```bash
bun install
bun run dev:playground
```

Ne pas utiliser `bun test` pour la suite du dépôt. Le projet s'appuie sur Vitest et `@nuxt/test-utils` :

```bash
bun run test
bun run test:e2e
```

## Interface

Ouvrir `http://localhost:3000` puis :

1. choisir `SSE natif` ou `Socket.IO` ;
2. connecter le transport ;
3. créer, modifier ou supprimer un message ;
4. consulter le journal des événements ;
5. lancer les probes de sécurité ;
6. cliquer sur **Tout tester** pour exécuter la matrice fonctionnelle complète.

Les données sont conservées en mémoire et réinitialisées au redémarrage.
