# Premier administrateur du réseau sur la démonstration — vérification du 23 novembre 2026

Chantier CH-831. Le moteur place l'administration d'un réseau sous une session d'identité numérique
prouvée (ADR-0042 du moteur). Sur la démonstration, personne ne pouvait y satisfaire : la console, qui
nomme le premier administrateur, ne vise que le moteur de production, et le compte de démonstration
administrateur est exclu par construction. Publier le moteur y aurait rendu le réseau inadministrable.
Le propriétaire a demandé de construire l'accès avant la séance de publication.

Ce rapport ne contient aucun identifiant de déploiement ni aucune valeur de variable, et rien n'est
publié par ces fusions.

## Ce qui est entré dans `main`

| Dépôt | PR | Contenu |
|---|---|---|
| Moteur ANTSIA | antsia#207 | Deux fonctions internes, `platform/networkAdminBootstrap` : nommer le premier administrateur d'un réseau administré, et retirer ce rôle. Elles sont refusées hors démonstration déclarée ou développement local, journalisées dans la même transaction, et ne donnent aucune session. Décision : ADR-0043 du moteur (proposé). Le guide de la démonstration du moteur (`docs/23`, § 7) donne les commandes, les refus et le retrait |
| DIASPORA.GA | cette PR | `docs/37`, § 9 : le premier administrateur se nomme à la console en production, par l'amorçage sur la démonstration ; une administration servie à l'adresse du catalogue est de confiance par le catalogue seul |

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, est vert : code 0, en 15 minutes (de 21 h 50 à
22 h 05). Le seul écart dans les fichiers suivis après la génération du code est le relevé des modules
du moteur, qui connaît le nouveau module ; il est validé dans antsia#207. La vérification couvre :
- la génération du code, le typage du moteur et de ses tests ;
- les tests du moteur, les cliquets et les scripts ;
- puis le typage, les tests et le lint de chaque espace de travail (0 erreur de lint ; les avertissements sont antérieurs).

| Moteur ANTSIA vérifié | DIASPORA.GA vérifié | Fusion |
|---|---|---|
| branche d'antsia#207, tête `5f18822b`, reprise sur `main` `fb4c9f53` | `fd68d38` = `main` `0c63312` + la modification de `docs/37` | moteur : `main` `2623cde9`, même arbre que `5f18822b` |

La fusion du moteur a été faite sur accord écrit du propriétaire, à la tête relue de la PR
(`--match-head-commit`). L'arbre de `main` du moteur après la fusion est identique à l'arbre vérifié. Le
couple inscrit dans `engine-compat.json` est donc DIASPORA.GA `fd68d38` et moteur `2623cde9`.

Comptes des tests :

| Ensemble | Tests réussis |
|---|---|
| Tests du moteur | 4 153 |
| Cliquets | 200 |
| Scripts du moteur | 181 |
| `social-domain` | 1 121 |
| `social-features` | 4 624 |
| Domaine de DIASPORA.GA | 834 |
| Surfaces de DIASPORA.GA | 1 352 |
| diaspora.ga | 2 649 |
| admin.diaspora.ga | 279 |

## Ce qui a été relu

- Le code a été écrit en tests d'abord, sur le plan de l'architecte.
- Une relecture de sécurité indépendante n'a relevé aucun constat bloquant. Ses deux constats importants
  sont corrigés dans antsia#207 : le retrait restait bloqué quand le lien d'identité numérique de
  l'administrateur était révoqué, et le garde-fou du journal se laissait satisfaire par un commentaire.
- Le parcours réel est joué en test, avec un vrai Better Auth et une identité numérique simulée, dans un
  environnement réglé comme la démonstration : la personne nommée entre par l'application
  d'administration ; le compte de démonstration administrateur y est refusé.

## Ce qui n'a pas été vérifié

- Le comportement réel du client identite.ga en bac à sable.
- Les variables du moteur de démonstration, qui relèvent du propriétaire.
- L'amorçage sur la démonstration en ligne : il ne peut se jouer qu'après la publication du moteur.

## Ce qui reste au propriétaire avant la séance

1. Au portail développeur d'identite.ga : l'application de la démonstration, en bac à sable, et ses
   comptes de test.
2. Sur le moteur de démonstration : les variables `IDN_*`, et le contrôle de `SITE_URL`.
3. Le choix du premier administrateur et du second.
4. L'accord écrit de la séance : commits, cible, ordre, retour arrière.
