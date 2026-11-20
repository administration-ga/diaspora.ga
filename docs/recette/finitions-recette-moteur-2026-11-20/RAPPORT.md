# Finitions de la recette en mode moteur — 20 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE et du moteur après la PR 94 de DIASPORALE et la PR 186 d'ANTSIA, huitième tranche : les remarques mineures de la recette en mode moteur du même jour (`docs/recette/moteur-tranches-5-7-2026-11-20/RAPPORT.md`). La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `c980ffc` (tête de la PR 186), DIASPORALE `43176bb` (tête de la PR 94) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`e30e46e`) est identique à l'arbre vérifié (`f7a6ad4`), celui de DIASPORALE `main` (`51fffc2`) aussi (`58d139f`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 08 h 33 à 08 h 43 ; les têtes sont relevées dans le journal au début et à la fin du passage |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 795 passés |
| Cliquets du moteur | 169 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 247 tests passés |
| Application DIASPORALE | 2 287 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Une première vérification, à 02 h 05, a tourné sur les `main` : une autre session (chantier CH-800, renommage en DIASPORA.GA) avait basculé le poste s2 une minute avant. Elle a été écartée ; les deux sessions se sont coordonnées et celle-ci a été rejouée sur les bonnes têtes, une fois l'espace disque revenu au-dessus du seuil de 6 Go.

## Ce que contiennent les PR

- **Moteur (PR 186)** : trois gestes laissent une ligne au journal — le départ volontaire d'un membre de l'équipe (`page.signatory_leave`), la fermeture du groupe d'une association (`page.group_close`, symétrique de `page.group_reopen` ; partie « fermeture » d'antsia#182) et le retrait d'une publication d'autrui dans ce groupe par son responsable ou un animateur (`page.group_post_remove`, avec le rôle vivant) ; jamais pour un groupe ordinaire, une publication déjà retirée ou la sienne.
- **Application (PR 94)** :
  - tournures neutres au lieu d'attributs de rôle accordés (« … administre la page dès maintenant », « Page inscrite : vous l'administrez », « Membre depuis le … ») ; un cliquet refuse ces attributs ;
  - retrait d'une invitation en attente avec ses propres mots, nommé avec la personne, libellé visible contenu dans le nom accessible ;
  - « Services proposés » sans filtres quand la page n'en a aucun ;
  - boutons des demandes d'adhésion et des adhérents nommés avec la personne ;
  - format i18next d'élision (« de », « que »… devant un nom inséré, voyelles accentuées comprises, « Y » suivi d'une voyelle non élidé), appliqué aux phrases françaises concernées, une seule apostrophe par phrase ; des cliquets tiennent la règle ;
  - groupe d'une page indisponible : refus indistinct « Cette page n'est pas disponible. » ;
  - « Mes pages » quand toutes les pages dorment : « Pour l'instant, aucune de vos pages n'est en ligne… ».
- **Demande au moteur** : la même élision et des rôles neutres dans ses propres textes (antsia#187).

La relecture par un agent n'a relevé aucun bloquant ; ses dix points ont été corrigés avant la vérification.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| Invitation en attente | 1 440 px, clair | « Retirer l’invitation » (« … de Mireille IVINDO ») ; confirmation « … ne pourra plus l'accepter. Rien d'autre ne change. » ; « Invitation retirée. » |
| Fiche sans service | 1 440 px | « Services proposés » : état vide seul, sans filtres |
| Élision | 1 440 px | « Partager la rubrique « Publications » d’Étudiants gabonais de Bordeaux (démo) » |
| Groupe d'une page inexistante | 1 440 px | « Cette page n'est pas disponible. » |
| Demandes d'adhésion | 1 440 px | « Accepter la demande de Rodrigue KOMO », « Refuser la demande de Rodrigue KOMO » |
| « Mes pages », seule page en sommeil | 375 px, sombre | « Pour l'instant, aucune de vos pages n'est en ligne : celles qui dorment sont listées plus bas… » ; aucun défilement horizontal |
| Console | — | aucune erreur |

Non joués : le mode moteur pour ces finitions (les lignes de journal sont prouvées par les tests du moteur) ; le message de transmission, prouvé par les tests.
