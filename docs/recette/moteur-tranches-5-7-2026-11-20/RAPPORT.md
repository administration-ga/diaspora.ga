# Recette en mode moteur des tranches 5 à 7 — 20 novembre 2026 (moteur local)

Demande du propriétaire : jouer avec l'application branchée sur le moteur ce qui n'avait été recetté qu'en démonstration — le mur du groupe d'une association (AS-03, AS-08), la transmission d'une page à deux comptes (AS-10) et la mise en sommeil (AS-11a). Ce rapport ne contient aucun identifiant de déploiement ni aucune valeur de variable.

## Contexte

| Élément | Valeur |
|---|---|
| Versions | ANTSIA `main` `aaa2162`, DIASPORALE `main` `dc8553c` (poste s2, sans modification locale) |
| Moteur | déploiement Convex local anonyme, fonctions publiées par `dev:convex` ; graines locales des réseaux (`seeds/foundations:run`, `diaspora/seed:run`), idempotentes |
| Variables | quatre variables jetables posées par le propriétaire sur ce seul déploiement local (adresse et origine du site local, secret de session généré, outils de développement) |
| Application | `diasporale.com` en source moteur (`dev:engine`), `http://localhost:3031` |
| Comptes | comptes de démonstration du moteur local : Patrice MBOUMBA (`demo.verifie`, vérifié) et Béatrice MOUSSAVOU (`demo.fondateur`) ; passage d'un compte à l'autre par « Se déconnecter partout » |
| Créneau | tenu sous le verrou commun pendant toute la recette, puis rendu |

## Résultats

| Parcours | Verdict | Constats |
|---|---|---|
| Inscription d'une association (AS-05) | **Validée** | Patrice inscrit « Amicale de recette moteur (fictive) » en trois étapes ; il en est l'administrateur, badge « Communauté » |
| Équipe : invitation d'une modératrice (AS-10) | **Validée** | Invitation refusée tant que le compte de Béatrice n'existait pas (« Aucun membre de DIASPORALE ne répond à cet identifiant ») ; puis invitation « Modérateur » ; Béatrice la voit avec « Rôle proposé : Modérateur » et l'accepte ; « Mes pages » lui montre la page en vue réduite (« Modérer les commentaires », « Équipe ») ; sa gestion n'offre aucune publication au nom de la page |
| Retrait d'un commentaire par la modératrice (AS-10) | **Validé** | Sous un communiqué de la page, le moteur donne `canRemove` : « Retirer le commentaire de Patrice MBOUMBA » à côté de « Signaler » ; confirmation, « Commentaire retiré. », compteur à zéro ; ligne `page.comment_remove` au journal |
| Mur du groupe au format du fil (AS-08) | **Validé** | Groupe créé ; Patrice publie, épingle (« Épinglée par le groupe », « Désépingler ») ; Béatrice, adhérente acceptée, entre dans le groupe, voit l'épingle sans geste de modération, publie, réagit (« Soutien », compteur 1) ; « Partager » ne propose que le lien (« Les destinataires doivent avoir accès ») ; le responsable retire la publication d'autrui (« Retirer cette publication de Béatrice MOUSSAVOU », « Publication retirée du groupe. ») |
| Fermer puis rouvrir le groupe (AS-03) | **Validé** | Texte « Ce groupe est fermé : personne n'y lit ni n'y publie, et personne ne peut le rejoindre. » ; « Rouvrir le groupe » ; « Le groupe est rouvert. », épingle et réaction intactes ; ligne `page.group_reopen` au journal |
| Transmission de la page à deux comptes (AS-10) | **Validée** | « Transmettre la page » : Béatrice (modératrice acceptée) nommée administratrice aussitôt ; « Se retirer » s'ouvre ; Patrice se retire (« Vous avez quitté l'équipe. ») et la gestion lui est fermée sur-le-champ ; ligne `page.signatory_grant` au journal |
| Mise en sommeil et réveil (AS-11a) | **Validés** | Béatrice, seule administratrice, met la page en sommeil (« … est en sommeil jusqu'au 20 décembre 2026. ») ; la fiche répond par le refus indistinct, le communiqué est introuvable, le groupe inaccessible ; à 375 px en sombre, « Mes pages » liste la page « En sommeil » et « Réactiver la page … » la rend visible ; le groupe, son épingle et sa réaction, le communiqué reviennent ; lignes `page.sleep` et `page.wake` au journal ; aucun défilement horizontal |

## Remarques mineures (non corrigées)

1. « Béatrice MOUSSAVOU est administrateur dès maintenant. » : accord au masculin (même gabarit que « Page créée : vous en êtes l'administrateur. »).
2. Retirer une invitation encore en attente : la confirmation dit « Cette personne perd aussitôt son rôle sur la page : elle ne pourra plus y publier… », alors qu'elle n'en a encore aucun.
3. Fiche d'une page sans service : les filtres de « Services proposés » s'affichent au-dessus de « Aucun service actif proposé ».
4. Demandes d'adhésion : « Accepter » et « Refuser » ne portent pas le nom de la personne dans leur nom accessible.
5. Élision avec un nom inséré : « Publier au nom de Amicale… », « l'équipe de Amicale… » (déjà relevé le 19/10).
6. Groupe d'une page en sommeil : « Cet élément n'existe plus. » au lieu du refus habituel (« Cette page n'est pas disponible »).
7. Journal du moteur : le départ volontaire d'un membre de l'équipe et le retrait d'une publication du groupe par son responsable n'y laissent pas de ligne, contrairement au retrait d'un commentaire ; la fermeture du groupe non plus (déjà demandée, antsia#182).

## Données fictives créées dans le moteur local

Page `amicale-de-recette-moteur-fictive` (en ligne, Béatrice administratrice), son groupe d'association (Patrice et Béatrice membres, une publication épinglée, une publication retirée), un communiqué de la page et un commentaire retiré, une adhésion acceptée. Rien n'a été supprimé.

## Limites de preuve

- Les rôles se choisissent dans des listes natives ; l'outil du navigateur intégré n'y agit pas toujours : un choix a été posé par l'outil de saisie, et une première invitation, partie avec le mauvais rôle par une touche Entrée, a été retirée puis refaite. Aucun défaut de l'application n'en découle.
- L'échéance réelle de trente jours n'a pas été attendue (prouvée par les tests à l'horloge simulée).
- Ni appareil réel, ni application mobile.
