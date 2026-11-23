# Recette d'admin.diaspora.ga — 23 novembre 2026 (moteur local)

Chantier CH-815 : l'application d'administration du réseau DIASPORA.GA (fiche « Application d'administration
admin.diaspora.ga » du 22/11/2026). Recette au navigateur des lots A4 à A7 et du durcissement A1b, branchés sur
les lots A1, A2, A3, A6 du moteur. Ce rapport ne contient aucun identifiant de déploiement ni aucune valeur de
variable.

## Contexte

| Élément | Valeur |
|---|---|
| Versions | moteur ANTSIA `chantier/ch-815-a3b-pays-ouverts` @ `ad35ebcc` ; DIASPORA.GA `chantier/ch-815-a7-sections` @ `2bcdc7b` puis `a34fc3c` (correctifs de la recette) |
| Vérification commune | `bun run --cwd ../ANTSIA verify` verte sur `ad35ebcc` + `2bcdc7b`, puis sur le couple final `ad35ebcc` + `a34fc3c` (voir « Vérification ») |
| Moteur | déploiement Convex local anonyme d'un poste de travail jetable ; graines locales `seeds/foundations:run` et `modules/diaspora/seed:run` (réseau `diaspora-ga`) |
| Variables | trois variables jetables posées par le propriétaire sur ce seul déploiement local (adresse du site local, secret de session généré, outils de développement) |
| Applications | admin.diaspora.ga (`http://localhost:3033`) et diaspora.ga en source moteur (`http://localhost:3031`) |
| Compte | compte de démonstration du moteur local « Administrateur du réseau », Serge EYENE (`demo.administrateur`), identité numérique de démonstration de niveau 2 |
| Session prouvée | aucun fournisseur d'identité numérique en local : la session du compte, ouverte par code sur diaspora.ga, a été scellée pour l'application `admin_diaspora_ga` par la fonction interne `recordIdnSession` du moteur (celle qu'appelle le retour de l'identité numérique), sur ce backend local seulement ; aucune porte n'a été ajoutée au code |
| Navigateur | navigateur intégré, 1 440 px et 390 px, clair et sombre |

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 23/11/2026 à 12 h 30, sur le couple final moteur
`ad35ebcc` + DIASPORA.GA `a34fc3c` : **verte** (code 0). Codegen ; typage du moteur et de ses tests ; tests Convex
du moteur (256 fichiers, 3 952 tests) ; cliquets (32 fichiers, 186 tests) ; scripts du moteur (171 tests) ; puis
typage, tests et lint (0 erreur ; avertissements antérieurs) de chaque espace de travail : domaine social
(1 112 tests), contrats (90), accès au moteur (309), contrats natifs (94), charte (2 323), surfaces sociales (4 606),
domaine de DIASPORA.GA (803), paquet partagé de DIASPORA.GA (1 276), console du moteur (156),
**admin.diaspora.ga (277)**, antsia.ga (2 074), application mobile (282), **diaspora.ga (2 431)**.

## Résultats

| Parcours | Verdict | Constats |
|---|---|---|
| Entrée `/entrer` | **Validée** | Un seul bouton, « Se connecter avec l'identité numérique » (désactivé en local, sans fournisseur), aucun champ de courriel ni de code ; 1 440 px clair et 390 px sombre ; aucun défilement horizontal ; seuls éléments actifs : « Aller au contenu » et le bouton |
| Session des membres, non scellée | **Validée** | L'administrateur du réseau, connecté par code, ne voit que « Accès réservé à l'administration du réseau » et « Se déconnecter partout » : rien de la coque ni d'aucune section n'est monté |
| Session scellée pour l'administration | **Validée** | Accès inscrit au journal (« Entrée dans l'administration du réseau », à titre d'« Administration du réseau ») avant le montage ; coque : en-tête (réseau, Serge EYENE, « Ouvrir diaspora.ga », « Se déconnecter partout »), barre latérale en quatre groupes, entrée courante marquée |
| Tableau de bord | **Validé** | Modules ouverts, fondateurs (0 sur 30), pays ouverts, équipes : chiffres lus au moteur ; recours et pages officielles sans chiffre ; une phrase dit ce que le moteur ne compte pas encore ; liens « File de modération » et « Pages à vérifier » vers diaspora.ga |
| Modules | **Validé** | Une carte par module : module exigé, ce qu'il ajoute au menu des membres, prérequis à relire ; « Associations et entreprises » ouvert depuis une fenêtre motivée (motif de 10 caractères au moins) ; message de confirmation ; dernière décision affichée sur la carte avec son auteur et son motif ; ligne « Module ouvert ou fermé » au journal |
| Aperçu du menu | **Validé** | 1 440 px sombre ; cocher « Services » annonce « Apparaît : Services (barre de navigation), Mes demandes (menu du compte) » ; aucune écriture |
| Mesure | **Validée** | Module « Mesure » fermé : explication et lien vers « Modules », aucun chiffre affiché |
| Institutions et pages officielles | **Validées** | Module « Pages » fermé : explication ; une fois ouvert, création d'une page officielle fictive avec son signataire cherché par identifiant public ; la page apparaît active, signataire « invitation en attente d'acceptation » |
| Fondateurs, Pays ouverts, Recours, Équipe et responsables, Règles | **Validés en lecture** | Cohorte 0 sur 30 ; pays FR, BE et CA ouverts par la démonstration et signalés « Ouvert sans modérateur actif dans une équipe de ce pays » ; responsables (Serge EYENE, « vous ») ; défauts de modération du moteur lus tels qu'appliqués ; filtres des recours |
| Coque à 390 px sombre | **Validée** | Barre latérale repliée en feuille (« Ouvrir le menu »), groupes, entrée courante, pied avec le nom de l'administrateur et les deux liens ; aucun défilement horizontal |
| diaspora.ga, bureau de modération | **Validé** | Onglets « File », « Pages à vérifier », « Délais légaux » seulement (recours, équipe, règles, modules partis) ; `/pilote` répond 404 |

## Remarques, corrigées dans la PR du lot A7 (`a34fc3c`)

1. Titre de l'onglet de `/entrer` répété (« Administration de DIASPORA.GA · Administration de DIASPORA.GA ») : titre absolu.
2. Nom du pays affiché deux fois dans « Pays ouverts » (étiquette de pays partagée) : une seule fois.
3. Huit boutons « Ouvrir le module » au même nom accessible, et quelques gestes de ligne dans « Équipe », « Règles » et « Recours » : le nom de l'objet est ajouté au nom accessible.
4. Formulaire de création d'une page officielle non vidé après succès : remis à zéro.
5. Bureau de diaspora.ga : le texte disait encore à l'administrateur qu'il y « examine les recours et compose les équipes » : il renvoie désormais à l'application d'administration, sans adresse.

Contrôlé au navigateur après correction : titre, pays, nom accessible des boutons de module.

## Non joué

- Une vraie connexion par l'identité numérique (aucun fournisseur en local) : le parcours réel, départ puis retour sans cookie, est prouvé par les tests du moteur (lots A1 et A1b).
- Les écritures au navigateur des sections Fondateurs, Pays ouverts, Équipe, Règles et Recours (couvertes par les tests du moteur et de l'application).
- La largeur de 834 px, une session de modérateur, un appareil réel, la publication.

## Données fictives créées dans le moteur local

Module « Associations et entreprises » ouvert (motif de recette au journal) ; page officielle « Consulat de recette (fictif) » ; une ligne d'accès à l'administration au journal. Rien n'a été supprimé.

## Avis de l'outil

La commande `next dev` a affiché un avis de sécurité recommandant une mise à jour de Next.js (version du catalogue du moteur). Il n'a pas été appliqué : la version se décide dans le catalogue du moteur, hors de ce chantier.

## Vérification après F3 (console du moteur liée à son application)

`bun run --cwd ../ANTSIA verify` rejoué le 23/11/2026 à 13 h 34 sur le moteur `765fd9ea` (pile CH-815 avec F3, antsia#201) et DIASPORA.GA `be1e92c` (ce rapport) : **verte** (code 0) ; tests Convex du moteur (257 fichiers, 3 978 tests), cliquets (32 fichiers, 188 tests), console du moteur (169 tests), admin.diaspora.ga (277), diaspora.ga (2 431). C'est le couple inscrit au registre `engine-compat.json`. Les PR du moteur antsia#194 à #201 ont été fusionnées sur accord écrit du propriétaire ; l'arbre de `main` du moteur est identique à `765fd9ea`.
