# Politique de sécurité

## Versions prises en charge

Le projet est en phase alpha. Seule la dernière préversion publiée est corrigée activement.

| Version | Support |
|---|---|
| dernière `0.1.0-alpha.x` | oui |
| versions antérieures | non garanti |

## Signaler une vulnérabilité

N'ouvrez pas d'issue publique contenant un exploit, un secret ou des données personnelles.

Utilisez en priorité le signalement privé de vulnérabilité du dépôt GitHub. À défaut, contactez le mainteneur par un canal privé indiqué sur son profil GitHub.

Le rapport doit contenir uniquement les informations nécessaires :

- version affectée ;
- transport concerné : HTTP, SSE ou Socket.IO ;
- conditions de reproduction minimales ;
- impact estimé ;
- proposition de correction éventuelle ;
- confirmation que les données et identifiants ont été anonymisés.

## Périmètre

Sont notamment considérés comme sensibles :

- contournement de limites de corps ou d'URL ;
- confusion de routes entre instances ;
- CORS ou contrôle d'origine incorrect ;
- fuite d'erreurs 5xx, de `metadata`, de cookies ou de jetons ;
- publication à un mauvais channel ;
- listeners SSE/Socket.IO non nettoyés ;
- utilisation non sûre des en-têtes proxy ;
- arrêt involontaire du serveur Nitro lors du teardown d'un transport.

## Responsabilités de l'application hôte

Le package ne remplace pas :

- la validation métier des entrées ;
- l'authentification Feathers ;
- les hooks d'autorisation et le RBAC ;
- la sélection sécurisée des channels ;
- les limites réseau du reverse proxy ;
- la rotation des secrets et la journalisation conforme.

Les applications doivent conserver `exposeErrors: false`, utiliser des origines exactes et ne définir `trustProxy: true` que derrière un proxy maîtrisé qui réécrit les en-têtes concernés.
