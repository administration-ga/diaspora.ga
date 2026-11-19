# Groupe d'une association : réouverture, mur au format du fil — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE et du moteur après la PR 87 de DIASPORALE et la PR 181 d'ANTSIA, cinquième tranche du modèle du réseau social d'espace.administration.ga. La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `5b2817d` (tête de la PR 181), DIASPORALE `47a2ccf` (tête de la PR 87) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`c1cbeaf`) est identique à l'arbre vérifié (`e8d9882`), celui de DIASPORALE `main` (`8758e24`) aussi (`0a37fed`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 18 h 31 à 18 h 42, après 80 s d'attente dans la file |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 741 passés, dont 4 nouveaux pour la réouverture |
| Cliquets du moteur | 163 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 221 tests passés |
| Application DIASPORALE | 2 238 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Le couple d'avant la relecture (ANTSIA `7f4cd38`, DIASPORALE `914fbdb`) était déjà vert ; les corrections de la relecture ont été vérifiées par une nouvelle passe complète, celle de ce rapport.

## Ce que contiennent les PR

- **AS-03, moteur (PR 181)** : la mutation `reopenGroupForPage` de la tranche `diaspora` rouvre le groupe fermé d'une association. Seul son responsable le peut : un administrateur de la page dont l'adhésion à l'association est acceptée. Le geste cite la fermeture lue (`expectedClosedAt`) : une autre fermeture entre-temps rend un conflit, rien n'est rouvert à l'aveugle. Un groupe archivé, en cours d'effacement ou retiré par la modération ne se rouvre pas ; un adhérent exclu reste dehors. La réouverture s'inscrit au journal (`page.group_reopen`, ajouté à la liste fermée des actions). La lecture du groupe dit la date de fermeture et `canReopen`, seulement à qui peut rouvrir.
- **AS-03, application (PR 87)** : le bouton « Rouvrir le groupe » sous un groupe fermé, pour son seul responsable ; la confirmation de fermeture dit que plus personne ne lit ni ne publie, que rien n'est supprimé et que le groupe peut être rouvert. Un conflit se dit « le groupe a changé ».
- **AS-08, application (PR 87)** : en mode moteur, le mur du groupe prend les cartes du fil (réactions, commentaires, signalement, profil de l'auteur), suivant la décision 5 du plan 07. La publication épinglée reste en tête ; le responsable et les animateurs épinglent, désépinglent et retirent la publication d'autrui, chaque bouton nommant l'auteur de sa carte. On publie photos ou vidéo dans le groupe seul, depuis la fenêtre de publication du fil, qui dit « Vous publiez en votre nom dans… ». Une publication retenue en relecture le dit à l'envoi.
- **Brouillons** : le brouillon d'un message au groupe, comme celui de la galerie d'un évènement, porte la personne connectée dans sa clé ; il ne reste plus visible après la déconnexion.
- **Demande au moteur** : publications en relecture vues de leur auteur, égards de l'épingle dans la fiche du groupe, désépinglage versionné, journal de la fermeture (antsia#182).

La relecture par un agent a relevé deux bloquants (un administrateur exclu de l'association pouvait rouvrir ; le brouillon survivait à la déconnexion) et six points ; tous corrigés avant la vérification.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| Responsable du groupe, administrateur de la page | 1 440 px, clair | crée le groupe, le ferme (nouveau texte de confirmation), le rouvre : avis « Le groupe est rouvert. » |
| Signataire de la page, non administratrice | 375 px, sombre | le groupe fermé, sans « Rouvrir » ; aucun défilement horizontal |
| Console | — | aucune erreur de l'application (seulement la connexion du rechargement à chaud) |

Non joués : le mur au format du fil, servi par le seul mode moteur (la démonstration garde son mur en texte : ses publications de groupe ne passent pas par le fil), qui n'est prouvé que par les tests ; le mode moteur et l'appareil réel.

Reste connu : le message d'un groupe fermé dit encore « Les nouveaux échanges et adhésions sont arrêtés », alors que la lecture s'arrête aussi ; à reprendre dans une prochaine tranche.
