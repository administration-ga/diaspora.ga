# Battement de présence des appels : le battement de trop se tait (24/11/2026)

Moteur : PR 209 d'`administration-ga/antsia`, fusionnée sur accord écrit du propriétaire. Rien n'est publié.

## Constat

Sur la démonstration (moteur `2623cde9`, DIASPORA.GA `1f6ee34`), la console du navigateur montrait des erreurs
`[CONVEX M(modules/calls/presence:heartbeat)] … Server Error`, parfois aussi `setOffline`. Elles avaient été
attribuées à un visiteur non connecté.

Il n'y a qu'**une seule cause : la limite de débit**.

- **Visiteur réellement anonyme : aucune erreur.** Contrôle fait avec un Chrome sans interface et un profil vierge,
  le 24/11 à 00 h 20, sur `/`, `/fil`, `/explorer` et `/contact` : aucune ligne de console. Un témoin positif prouve
  que le relevé capte bien la console. Côté code, `EngineIcom` (`apps/diaspora_ga/src/components/icom.tsx`) ne
  monte la couche de communication, qui porte le battement, que pour un membre connecté qui peut publier.
- **Les contrôles « non connecté » tournaient en fait connectés.** Le navigateur intégré de l'application est
  partagé entre les sessions. Il porte la session du compte démo administrateur, créée le 22/11 et rafraîchie le
  23/11 à 23 h 22, soit trois minutes avant le contrôle de 23 h 25.
- **Le mécanisme.** Chaque chargement complet de page coûte un `setOffline` (fermeture) puis un `heartbeat`
  (montage). Le seau `presence.heartbeat` est de 8 par minute et par personne. Des pages rechargées coup sur coup,
  ou plusieurs onglets ouverts sur le même compte, le vident. Le serveur levait alors `rateLimited`, que le client
  Convex inscrit en console même quand l'écran l'avale.
- **Reproduit** avec le compte démo, le 24/11 à 00 h 21 : six chargements en vingt secondes donnent deux erreurs
  `heartbeat`.

## Correction (moteur seulement)

- `heartbeat` et `setOffline` rendent `null` au-delà du seau, sans rien écrire, comme les baux du direct. Le seau
  reste la borne.
- `beatWithinRateLimit` passe de `convex/modules/live/presence.ts` à `convex/lib/rateLimit.ts`, partagé par les
  appels et le direct.
- Les refus du constructeur (sans session, hors du réseau, suspendu) lèvent toujours.
- L'API ne change pas (`null`). Rien n'est modifié dans DIASPORA.GA.

Les tests ont été écrits d'abord ; ils étaient rouges sur `rateLimited` avant la correction :
- le battement et le « hors ligne » de trop résolvent `null`, sans écrire ;
- le seau rempli, le battement d'un membre connecté écrit de nouveau ;
- sans session et hors du réseau, le refus lève toujours.

## Vérification et fusion

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, poste s10, le 24/11 de 00 h 36 à 00 h 50, sur le moteur
`c04f7c5c` (`main` `0c4b283b` plus la correction) avec DIASPORA.GA `92ccedc` : **verte** (code 0, aucun écart dans
les fichiers suivis). Résultats :
- tests du moteur : 4 170 sur 270 fichiers, dont `calls/presence` (24), `live/presence` (15) et `hostPresence` (10) ;
- typecheck et tests des 13 paquets, lint des 12 paquets : aucune erreur.

La PR 209 a été fusionnée à la tête relue. Le `main` du moteur est `f152b07e` (parents `0c4b283b` et `c04f7c5c`),
d'arbre identique à l'arbre vérifié (`7d9867ee`). Le couple inscrit dans `engine-compat.json` devient DIASPORA.GA
`92ccedc` et moteur `f152b07e`.

## Non prouvé

- L'effet en ligne : la démonstration sert encore le moteur `2623cde9`, et la correction n'y vaudra qu'à la
  prochaine publication du moteur, sur accord du propriétaire.
- À constater après cette publication : avec le compte démo connecté, des chargements enchaînés ne laissent plus
  aucune erreur de présence en console.

## Piège pour les recettes

Un contrôle « non connecté » se fait dans un profil de navigateur vierge, jamais dans le navigateur intégré partagé
de l'application : avant d'écrire « non connecté », lire `localStorage['better-auth_session_data']` dans la page.
