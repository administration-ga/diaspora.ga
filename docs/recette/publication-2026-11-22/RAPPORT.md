# Publication de diaspora.ga — 22 novembre 2026

Première publication jouée avec les scripts du dépôt (`docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`), sur accord écrit du propriétaire donné le jour même. Ce rapport ne contient aucun identifiant de déploiement, de projet ni d'équipe.

## Ce qui a été publié

| Sujet | Valeur |
|---|---|
| Moteur ANTSIA | `c9006352c152` (`main`) |
| DIASPORA.GA | `fe4ab92e9e2c` (`main`, menu léger du lancement, CH-816) |
| Cible | `demo` |
| Étiquette de version | `diaspora-ga-fe4ab92e9e2c-antsia-c9006352c152-demo` |
| Ordre tenu | backend du moteur de démonstration, remise à zéro et graines, puis ce site ; un seul publieur |

## Verdicts

| Étape | Verdict |
|---|---|
| Essai du moteur de démonstration (API en ligne comparée au commit, envoi à blanc) | passé : aucune fonction retirée, aucun index supprimé |
| Envoi du moteur de démonstration | fait ; API servie identique à celle du commit |
| Contrôle du moteur par la méthode du moteur | en échec sur un seul point : la sonde du site principal d'ANTSIA ne répond pas en public (accès protégé) |
| Sauvegarde des données de démonstration, avant effacement | faite et contrôlée |
| Remise à zéro de la démonstration (décision du propriétaire) | faite ; tables constatées vides |
| Graines (`seeds/foundations`, `modules/diaspora/seed`) | faites ; l'autorisation de semer a été posée puis retirée |
| Site : publication sans bascule, déploiement prêt | fait |
| Site : contrôle privé avant bascule | bon (sonde « ok », version attendue, source « engine », moteur joint) |
| Site : bascule du domaine, après la seconde phrase tapée par le propriétaire | faite |
| Site : contrôle public (`release-check.mjs`), rejoué après coup | bon |

## Constats en ligne

- La sonde publique dit l'application `diaspora-ga`, la version attendue, la source « engine » et le moteur joint.
- Membre connecté (compte de démonstration), bureau : barre Fil · Membres · Messages, aucun groupe « Mon espace » dans le rail, fil à deux onglets, rail droit sans compteur à zéro ; aucune erreur de console.
- Le module « Associations et entreprises » a été ouvert par l'administration du réseau de démonstration, motif à l'appui : la ligne `network.feature_set` est au journal des décisions du moteur. La barre ne change pas ; l'inscription d'une association ou d'une entreprise est proposée.

## Ce qui a dû être réglé avant

- Le projet d'hébergement visait encore le dossier d'avant le renommage : son dossier racine a été passé à `DIASPORA_GA/apps/diaspora_ga`.
- La démonstration portait l'ancienne clé de réseau, sans migration prévue : le propriétaire a choisi la remise à zéro.

## Ce qui n'est pas fait

- Le moteur de production et les sites d'ANTSIA ne sont pas publiés : leurs sites n'ont pas d'adresse publique, et les contrôles publics de la méthode du moteur y échouent.
- Les contenus d'animation de la démonstration ne sont pas rejoués : le fil est vide.
- La page d'entrée annonce encore des modules fermés au lancement (kit d'arrivée, emploi, agenda).
- Le mode moteur n'a été constaté qu'au bureau, avec un seul compte ; ni téléphone, ni appareil réel.
- Le retour arrière n'a pas été joué. Le déploiement servi avant la bascule ne disait pas de version (sonde d'avant LX-01) ; il est consigné au relevé de la publication, hors dépôt.
