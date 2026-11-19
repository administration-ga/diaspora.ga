# Équipe de page : éditeur, modérateur, transmission — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE et du moteur après la PR 89 de DIASPORALE et la PR 183 d'ANTSIA, sixième tranche du modèle du réseau social d'espace.administration.ga (AS-10 du plan 07, PG-08 du moteur). La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `d7ebc11` (tête de la PR 183), DIASPORALE `4016ec5` (tête de la PR 89) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`08963aa`) est identique à l'arbre vérifié (`c3af0b8`), celui de DIASPORALE `main` (`ec1abd7`) aussi (`789bc35`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 21 h 37 à 21 h 48, sans attente dans la file |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 772 passés |
| Cliquets du moteur | 168 passés, dont le nouveau cliquet des lecteurs d'autorité d'une page |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 231 tests passés |
| Application DIASPORALE | 2 251 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Deux passes l'ont précédée le même soir : la première s'est arrêtée sur un test qui comparait le nouveau texte du groupe fermé sans son espace insécable (corrigé dans `e07d95f`) ; la seconde, verte, portait sur `e07d95f`, avant la correction d'un bouton trouvée à la recette (`4016ec5`). Celle de ce rapport porte sur les têtes fusionnées.

## La décision

Instruite par l'agent architecte (ADR du vault, `10-PROJETS/diasporale/decisions/2026-11-19-equipe-de-page-trois-roles-deux-lectures.md`) : le rôle `moderator` rejoint la table `pageSignatories`, `signatory` reste la valeur stockée et s'affiche « Éditeur » ; aucune migration. Les lecteurs existants (`liveSignatoryRole`, `requireManagedPage`, `viewer.role`, `myPages`) signifient toujours « parle au nom de la page » et ne rendent jamais un modérateur : un appel oublié le refuse au lieu de lui ouvrir la parole de la page. Les lecteurs de toute l'équipe (`livePageTeamRole`, `requirePageTeam`, `viewer.teamRole`, `myTeamPages`) forment une liste blanche tenue par `tests/ratchets/page-authority-readers.test.ts`.

## Ce que contiennent les PR

- **Moteur (PR 183)** :
  - trois rôles d'équipe ; un modérateur refusé sur un geste de chaque famille (publication, identité, équipe, revendication, direct, évènement, messagerie, services, emplois, entraide, kit, adhésions), un éditeur refusé en gestion, le dernier administrateur protégé jusque vers le rôle de modérateur ;
  - retrait d'un commentaire sous une publication de page par toute l'équipe vivante, depuis le réseau de la page, journalisé (`page.comment_remove`) ; champ `canRemove` sur les commentaires, lu aussi par le web et le mobile d'ANTSIA ;
  - trois défauts latents corrigés : la liste et le plafond de l'équipe comptent les trois rôles, tout membre se retire, le droit de retrait relit le rôle vivant ;
  - partie liée : le modérateur de la page ne tranche pas un dossier de sa page, ne demande pas un service de sa page, ne laisse pas d'avis sur ses services et ne candidate pas à ses offres ;
  - clé d'accord d'appel versionnée par la révision d'autorité (les accords déjà donnés en voix de page sont à redonner une fois) ; fil recomposé à toute promotion (habilitation, console, revendication).
- **Application (PR 89)** : trois rôles décrits dans l'onglet « Équipe », choix du rôle à l'invitation et au changement ; « Transmettre la page » (promotion immédiate d'un membre, dite avant le geste, ou invitation d'une autre personne) puis « Se retirer » ; vue réduite du modérateur dans la gestion et dans « Mes pages » ; « Retirer » sur un commentaire, nommé avec son auteur ; textes « membre de l'équipe » là où un modérateur les lit ; démonstration à la même matrice ; texte d'un groupe fermé corrigé (la lecture s'arrête aussi).
- **Demande au moteur** : avis à la personne dont le rôle change (antsia#184).

La relecture par un agent n'a relevé aucun bloquant et douze points, tous corrigés avant la vérification.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| L'administrateur, onglet « Équipe » | 1 440 px, clair | trois rôles décrits ; « Quitter l'équipe » fermé au dernier administrateur ; l'invitation d'une éditrice passe en modératrice |
| La modératrice accepte | 1 440 px | « Rôle proposé : Modérateur » ; « Mes pages » ne lui montre que « Modérer les commentaires » et « Équipe » ; la fiche, sans « Gérer » ni publication |
| Retrait d'un commentaire | 1 440 px | une autre membre commente la publication de la page ; la modératrice voit « Retirer le commentaire de … », confirme, le compteur repasse à zéro ; le menu de la publication ne lui offre que les gestes d'un membre et « Signaler… » |
| Transmission | 375 px, sombre | « Nommer administrateur maintenant » dit la promotion immédiate ; la modératrice devient administratrice ; « Se retirer » s'ouvre, avec un texte qui ne promet pas plus que ce que la plateforme vérifie ; aucun défilement horizontal |
| Console | — | aucune erreur |

Défaut trouvé et corrigé à la recette : à 375 px, le bouton de transmission sortait de sa carte (`4016ec5`, libellés à la ligne).

Non joués : le mode moteur et le transfert à deux comptes sur un moteur réel (critère d'acceptation du lot) ; l'appareil réel ; le mobile.
