# Menu « Créer » et `/evenements` — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE après la PR 83, troisième tranche du modèle du réseau social d'espace.administration.ga. Aucun changement du moteur. La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `16f4391` (`main`, inchangé), DIASPORALE `ed708ee` (tête de la PR 83) |
| Arbres | après la fusion (PR 83 → `e8f8854`), l'arbre de `main` est identique à l'arbre vérifié (`5126298`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 14 h 59 à 15 h 20, après 20 s d'attente dans la file |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 733 passés |
| Cliquets du moteur | 163 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 217 tests passés |
| Application DIASPORALE | 2 208 tests passés |
| Typage et lint | aucune erreur |

## Ce que contient la PR 83

- Menu « Créer » : sous « Publier » dans le rail du bureau, et dans la feuille du compte au téléphone. Il propose une actu quand iCom est ouvert, « Inscrire une association » et « Inscrire une entreprise ».
- `/evenements` renvoie à l'agenda.
- Les groupes thématiques ne sont pas ouverts : la décision 3 du plan 07 réserve leur création aux vérifiés au pilote, et la demande est faite au moteur (antsia#177). Les directs restent fermés.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| « Créer » dans le rail | 1 440 px, clair | menu sous « Publier » : deux inscriptions, chacune dite en une ligne ; pas d'actu en démonstration |
| `/evenements` | 1 440 px | mène à « Mon agenda » (`/agenda`) |
| Feuille du compte | 375 px, sombre | navigation « Créer » entre « Mon compte » et « Informations », deux liens d'inscription |
| Console | — | aucune erreur de l'application (seulement les reconnexions du rechargement à chaud pendant l'arrêt du serveur précédent) |

Non joués : la largeur de 834 px, le mode moteur et l'appareil réel.
