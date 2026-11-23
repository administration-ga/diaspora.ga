# Routage des signalements par pays et Next.js 16.4.6 — vérification du 23 novembre 2026

Chantier CH-815, suite. Deux décisions restées ouvertes après la livraison d'admin.diaspora.ga :
- la mise à jour de Next.js, signalée par son avis de sécurité ;
- le routage des signalements par pays, à faire avant d'ouvrir un deuxième pays.

Les deux sont fusionnées. Ce rapport ne contient aucun identifiant de déploiement ni aucune valeur de
variable, et rien n'est publié par ces fusions.

## Ce qui est entré dans `main`

| Dépôt | PR | Contenu |
|---|---|---|
| Moteur ANTSIA | antsia#202 | Next.js et `eslint-config-next` passent de 16.4.2 à 16.4.6 dans le catalogue. Sept avis de gravité moyenne sont corrigés. Le verrou des dépendances ne change que pour les paquets de Next.js |
| Moteur ANTSIA | antsia#203 | Un signalement va d'abord à l'équipe du pays du contenu, puis à une équipe sans pays, puis au réseau. C'est vrai aussi pour la relecture préalable et pour les revendications de page. Un contenu sans pays ne va jamais à une équipe de pays, et les autres réseaux ne changent pas |
| DIASPORA.GA | diaspora.ga#113 | Les textes d'admin.diaspora.ga (pays, équipe) et du bureau de modération disent le routage par pays. Changer le pays d'une équipe ne déplace pas les dossiers qu'elle a déjà reçus |

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, est vert : code 0, en 18 minutes, et aucun écart dans
les fichiers suivis après la génération du code. La vérification couvre :
- la génération du code, le typage du moteur et de ses tests ;
- les tests du moteur, les cliquets et les scripts ;
- puis le typage, les tests et le lint de chaque espace de travail (0 erreur de lint ; les avertissements sont antérieurs).

| Moteur ANTSIA vérifié | DIASPORA.GA vérifié | Fusion |
|---|---|---|
| assemblage `8ae36ff1` = `main` `8dda9d93` + antsia#202 + antsia#203 | assemblage `0e51bec` = `main` `1b78881` + diaspora.ga#113 | moteur : #202 puis #203, `main` `fb4c9f53`, même arbre que `8ae36ff1` |

Chaque fusion a été faite à la tête relue de la PR (`--match-head-commit`). L'arbre de `main` du moteur après
les deux fusions est identique à l'arbre de l'assemblage vérifié. Le couple inscrit dans `engine-compat.json`
est donc DIASPORA.GA `0e51bec` et moteur `fb4c9f53`. Ce commit du registre ne change que ce rapport et
`engine-compat.json`.

Comptes des tests :

| Ensemble | Tests réussis |
|---|---|
| Tests du moteur | 4 121 |
| Cliquets | 189 |
| Scripts | 181 |
| Domaine social | 1 121, et 4 passés |
| Contrats | 104 |
| Accès au moteur | 309 |
| Contrats natifs | 94 |
| Charte | 2 323 |
| Surfaces sociales | 4 624 |
| Domaine de DIASPORA.GA | 834 |
| Paquet partagé de DIASPORA.GA | 1 352 |
| Console du moteur | 169 |
| admin.diaspora.ga | 279 |
| antsia.ga | 2 074 |
| Application mobile | 282 |
| diaspora.ga | 2 649 |

L'ordre des fusions a été convenu avec la session CH-817 : antsia#206 et diaspora.ga#120 sont entrées d'abord, et
cette vérification est repartie des `main` qui en résultaient.

## Ce qui n'est pas prouvé ici

- Il n'y a pas eu de recette au navigateur du routage par pays. Ses règles sont prouvées par les tests du moteur
  (règle pure, fonctions et refus), et ses textes par les tests des deux applications.
- `next build` n'a pas été joué avec Next.js 16.4.6, et aucun écran n'a été rendu au navigateur avec cette version.
- Rien n'est publié. La mise en ligne reste un geste du propriétaire, après CH-831, l'accès à l'administration
  sur la démonstration.
