# Inscription des organisations — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE après les PR 80 et 81, deux tranches qui reprennent le modèle du réseau social d'espace.administration.ga pour l'inscription d'une entreprise ou d'une association. Aucune ne touche le moteur. La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `16f4391` (`main`, inchangé), DIASPORALE `c118807` (tête de la PR 81, qui contient la PR 80) |
| Arbres | après les fusions (PR 80 → `0c8ddc3`, PR 81 → `261ddf9`), l'arbre de `main` est identique à l'arbre vérifié (`19f3e4e`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), de 14 h 34 à 14 h 46, puis `bun run test:scripts` à la racine de DIASPORALE |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 246 fichiers, 3 733 tests passés |
| Cliquets du moteur | 28 fichiers, 163 tests passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 63 fichiers, 1 217 tests passés |
| Application DIASPORALE | 149 fichiers, 2 201 tests passés |
| Typage | tous les espaces de travail, aucune erreur |
| Lint | aucune erreur ; aucun avertissement sur les fichiers des PR 80 et 81 |
| Scripts de DIASPORALE | 86 tests passés |

## Ce que contiennent les PR

- **PR 80 (lot AS-05)** : `/nouvelle-page` en trois étapes (nature, identité, récapitulatif) ; natures association et entreprise seules, selon la décision 2 du plan 07, tenues par le domaine, l'écran et les deux adaptateurs ; pages du même pays au nom proche proposées à la revendication ; premiers gestes une fois la page inscrite, chacun seulement si sa capacité est servie ; logo carré sur les cartes et la fiche.
- **PR 81** : la carte de rédaction du fil propose « Inscrire une association » et « Inscrire une entreprise » à qui publie ; le rail droit montre « Pages · <pays> » (deux officielles au plus, puis associations et entreprises en alternance).

## Recette au navigateur (démonstration, poste s2)

Jouée sur `c118807`, compte fictif vérifié de la démonstration.

| Parcours | Largeur et thème | Constat |
|---|---|---|
| Choisir « Entreprise », continuer | 1 024 px, sombre | l'étape Identité s'ouvre, la frise coche Nature |
| Saisir le nom d'une page vérifiée existante | 1 024 px, sombre | la page proche paraît avec son badge, « Voir » seul, aucune revendication |
| Saisir le nom d'une page sans badge | 1 024 px, sombre | « Revendiquer Étudiants gabonais de Bordeaux (démo) » est proposé avant d'inscrire |
| Inscrire « Traiteur Mbolo de Lille », valider l'identité par Entrée | 1 024 px, sombre | récapitulatif complet, puis avis « Page inscrite » et six premiers gestes |
| Fil | 1 440 px, sombre | carte de rédaction avec les deux inscriptions ; rail « Pages · France » |
| `/nouvelle-page?type=association` | 375 px, clair | l'inscription s'ouvre sur l'identité ; frise lisible sur deux lignes |
| Console | — | aucune erreur |

Non joué : la largeur de 834 px, le mode moteur (backend local) et l'appareil réel.

## Reste du lot AS-05

Le recadrage du logo à l'inscription et l'application mobile.
