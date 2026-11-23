# Page d'entrée accordée aux modules ouverts — 23 novembre 2026

Ce rapport dit l'état vérifié de DIASPORA.GA pour la correction de la page d'entrée (CH-816, demande du propriétaire du 22/11/2026 : accorder la page d'entrée aux modules ouverts, en retirant ce qui est fermé). La vérification a tourné sous le verrou commun des sessions, dans le poste s2. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `c900635` (`main`, inchangé), DIASPORA.GA `1e3dbe6` (branche `chantier/ch-816-page-entree`) |
| Base | DIASPORA.GA `f7eaa00` (`main`) |
| Commande | vérification complète depuis le moteur (`bun run verify`, `codegen` compris), le 23/11 de 7 h 09 à 7 h 19, puis `bun run test:scripts` de DIASPORA.GA ; aucune dépendance ajoutée, arbre du moteur inchangé |
| Résultat | **vert** (code de sortie 0) |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 250 fichiers, 3 804 tests passés |
| Cliquets du moteur | 30 fichiers, 173 tests passés |
| Domaine de DIASPORA.GA | 793 tests passés |
| Surfaces de DIASPORA.GA | 68 fichiers, 1 259 tests passés |
| Application DIASPORA.GA | 167 fichiers, 2 434 tests passés (165 fichiers et 2 419 tests au couple précédent) |
| Scripts de DIASPORA.GA (`test:scripts`) | 86 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Deux passages précédents de la même vérification ne comptent pas : le 22/11 à 23 h 07, trois tests des surfaces ont dépassé leur délai sur une machine saturée (rejoués seuls : verts) ; le suivant a été coupé par la mise en veille de la machine.

## Ce que la correction change

- **« Ce que vous y trouvez »** : une carte par module ou pour le socle. Au lancement, quatre cartes : le pays, la recherche des membres, les pages des associations, entreprises et institutions, la messagerie. Les cartes des modules fermés (groupes et évènements, services, emploi, entraide, mentorat, kit d'arrivée) restent écrites, en français et en anglais, sans être rendues.
- **Une déclaration de l'application** (`apps/diaspora_ga/src/lib/public-offer.ts`) dit ce que la page annonce. La page se lit sans session : elle ne peut pas demander au moteur quels modules sont ouverts. Quand l'administration ouvre un module, on ajoute sa ligne et on republie.
- **Vérification** : la page ne présente plus la vérification par consulat.ga comme disponible ; elle la dit à venir, avec celle de l'identité numérique. On publie dès qu'un membre vérifié parraine.

## Recette au navigateur

Jouée le 22/11/2026 sur le poste s2, en démonstration, porte publique (`/entrer`), sans session.

| Constat | Largeur, apparence |
|---|---|
| Quatre cartes en deux colonnes ; aucune mention du kit d'arrivée, de l'emploi, du mentorat, des missions bénévoles ni de l'agenda | 1 440 px, clair |
| Repère « Bientôt : vérifié avec votre accord » ; étape 3 : publier dès qu'un membre vérifié parraine | 1 440 px, clair |
| Quatre cartes en une colonne ; aucun défilement horizontal | 390 px, sombre |

## Ce qui n'est pas vérifié

- La largeur de 834 px ; le thème Gaboma ; un appareil réel.
- Publication : la correction n'est pas publiée par cette PR.
