# Réseau simple, modules activables — 20 novembre 2026

Ce rapport dit l'état vérifié de DIASPORA.GA et du moteur pour le chantier CH-801 (demande du propriétaire du 20/11/2026 : un réseau, un chat iCom, tout simplement ; les modules des associations et des entreprises injectés au fur et à mesure par l'administration du réseau). Décision : ADR-0041 du moteur. La vérification a tourné sous le verrou commun des sessions, dans le poste s2. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `03f1b92` (branche `claude/ch-801-reseau-simple-moteur`), DIASPORA.GA `2eaa278` (branche `claude/ch-801-reseau-simple-app`) |
| Base | ANTSIA `c795031`, DIASPORA.GA `2ca2acf` (`main` des deux dépôts) |
| Commande | vérification complète depuis le moteur (`bun run verify`), puis `bun run test:scripts` de DIASPORA.GA, de 12 h 09 à 12 h 22 ; aucune dépendance ajoutée, `bun.lock` inchangé |
| Résultat | **vert** (code de sortie 0) |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 250 fichiers, 3 804 tests passés |
| Cliquets du moteur | 30 fichiers, 173 tests passés (dont `network-feature-gates`) |
| Tests des scripts du moteur | 171 passés |
| Domaine du moteur | 67 fichiers, 1 111 tests passés (4 ignorés, comme avant) |
| Domaine de DIASPORA.GA | 793 tests passés |
| Surfaces de DIASPORA.GA | 68 fichiers, 1 259 tests passés |
| Application DIASPORA.GA | 157 fichiers, 2 309 tests passés |
| Scripts de DIASPORA.GA (`test:scripts`) | 86 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

## Ce que le chantier change

- **Par défaut**, DIASPORA.GA sert son socle : la porte et l'accueil, le fil (publier, commenter, réagir, partager), les pays et leurs actus, les personnes, iCom, les notifications, le compte, la modération et les pages légales. La barre devient Fil, Explorer, Communautés, Messages.
- **Huit modules fermés sans décision** : associations et entreprises, groupes et évènements, services, emploi et talents, entraide, mentorat, kit d'arrivée, mesure du pilote. Le moteur refuse leurs fonctions (refus indistinct) ; l'application ne les monte pas et dit « introuvable » sur leurs adresses.
- **Bascule** : l'administration du réseau, onglet « Réglages » du guichet de modération, section « Fonctionnalités du réseau », motif obligatoire, inscrit au journal des décisions du moteur ; l'opérateur de la plateforme en secours. Fermer ne supprime aucune donnée.

## Ce qui n'est pas vérifié

- Recette au navigateur (390, 834, 1 440 px, clair et sombre) : non jouée.
- Publication : rien n'est publié ; moteur et site se publient dans la même séance, le moteur d'abord.
