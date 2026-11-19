# Vie des pages : emplois sur la fiche, aucun « Écrire » sans fonction — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE et du moteur après la PR 85 de DIASPORALE et la PR 180 d'ANTSIA, quatrième tranche du modèle du réseau social d'espace.administration.ga. La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `28fd3fe` (tête de la PR 180), DIASPORALE `2d9e22a` (tête de la PR 85) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`55fd9d4`) est identique à l'arbre vérifié (`1ad799f`), celui de DIASPORALE `main` (`5dcd415`) aussi (`f830145`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 17 h 11 à 17 h 21, sans attente dans la file |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 737 passés, dont 4 nouveaux pour la rubrique d'une page |
| Cliquets du moteur | 163 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 219 tests passés |
| Application DIASPORALE | 2 225 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Une première vérification du même jour s'est arrêtée sur une erreur de typage dans un test de la rubrique (forme de session) ; corrigée dans `2d9e22a`, puis tout a été rejoué.

## Ce que contiennent les PR

- **EM-04, moteur (PR 180)** : la lecture `pageOpenJobOffers` de la tranche `diaspora` rend les offres ouvertes d'une page employeuse lisible, dans la projection de la recherche, servies par la modération. Page inconnue, d'un autre réseau, inactive, retirée, d'une institution, d'un média ou d'une communauté : le même `null`. Un blocage avec l'équipe ne ferme pas cette lecture (RP-03, `docs/40_BLOCAGE_ET_PAGES_RP03.md`).
- **EM-04, application (PR 85)** : la rubrique « Emplois » de la fiche d'une entreprise ou d'une association, seulement s'il y a une offre ouverte ; le lien « Voir les offres de cette page » sur la fiche d'une offre ; la démonstration alignée. Le paginateur commun, en mode discret, ne laisse plus de bouton « Afficher plus » seul et rend son pied dans la rubrique (la rubrique des services en profite).
- **AS-07, étape 1** : le bouton « Écrire » grisé disparaît des pages de média et de communauté.
- **Demandes au moteur** : écrire à une page (IM-06, antsia#178) ; annonce aux adhérents (AS-09, antsia#179).

La relecture par un agent a relevé un bloquant (la nouvelle adresse absente de la table des destinations) et cinq points ; tous corrigés avant la vérification.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| Fiche d'une entreprise, vue par son équipe | 1 440 px, clair | « Emplois » sous les services : deux offres ouvertes, les plus récemment créées d'abord, et « Gérer les emplois de la page » |
| Fiche d'une offre, hors équipe | 1 440 px | lien souligné « Voir les offres de cette page » ; il mène à la rubrique, le focus s'y pose ; aucun chemin de gestion |
| Fiche d'une association | 1 440 px | une offre ouverte, le brouillon caché ; aucun « Écrire » |
| Arrivée par l'ancre | 375 px, sombre ; 834 px, clair | la rubrique sous l'en-tête, focus posé, aucun défilement horizontal ; deux colonnes à 834 px |
| Console | — | aucune erreur |

Non joués : le mode moteur et l'appareil réel.
