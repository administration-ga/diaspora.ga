# Publication de diaspora.ga — 23 novembre 2026

Seconde publication jouée avec les scripts du dépôt (`docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`) : le site seul, le moteur de démonstration restant celui publié la veille. Ce rapport ne contient aucun identifiant de déploiement, de projet ni d'équipe.

## Ce qui a été publié

| Sujet | Valeur |
|---|---|
| Moteur ANTSIA | `c9006352c152` (`main`, déjà en ligne sur la démonstration, inchangé) |
| DIASPORA.GA | `3c5cbb4ffb53` (`main`, page d'entrée accordée aux modules ouverts, CH-816) |
| Cible | `demo` |
| Étiquette de version | `diaspora-ga-3c5cbb4ffb53-antsia-c9006352c152-demo` |
| Version servie avant la bascule (cible du retour arrière) | `diaspora-ga-fe4ab92e9e2c-antsia-c9006352c152-demo` |

## Verdicts

| Étape | Verdict |
|---|---|
| Publication sans bascule, déploiement prêt | fait |
| Contrôle privé avant bascule | bon (sonde « ok », version attendue, source « engine », moteur joint) |
| Bascule du domaine, après la seconde phrase tapée par le propriétaire | faite ; le site est resté en service pendant la publication |
| Contrôle public (`release-check.mjs`), rejoué après coup | bon |

## Constats en ligne

- La sonde publique dit la version attendue, sur les deux adresses du site.
- Porte publique, sans session : « Ce que vous y trouvez » montre quatre cartes (le pays, la recherche des membres, les pages, la messagerie) ; aucune mention du kit d'arrivée, de l'emploi, du mentorat, des missions bénévoles ni de l'agenda ; le repère de confiance dit « Bientôt : vérifié avec votre accord » ; l'étape 3 dit de publier dès qu'un membre vérifié parraine ; aucune erreur de console.

## Ce qui n'est pas fait

- Le retour arrière n'a pas été joué.
- Constat au bureau seulement, apparence sombre ; ni téléphone, ni appareil réel.
