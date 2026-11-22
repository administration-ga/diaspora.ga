# Menu léger du lancement — 22 novembre 2026

Ce rapport dit l'état vérifié de DIASPORA.GA pour le chantier CH-816, lots P0, P1 et P2 (demande du propriétaire du 22/11/2026 : un menu allégé, compris tout de suite, un réseau simple d'abord). Il suit le réseau simple et ses modules activables (CH-801, ADR-0041 du moteur). La vérification a tourné sous le verrou commun des sessions, dans le poste s2, recréé le jour même depuis `main`. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `c900635` (`main`, inchangé), DIASPORA.GA `780aa93` (branche `chantier/ch-816-menu-leger`) |
| Base | DIASPORA.GA `291a32b` (`main`) |
| Commande | vérification complète depuis le moteur (`bun run verify`, `codegen` compris, sur un backend local anonyme), de 19 h 20 à 19 h 30, puis `bun run test:scripts` de DIASPORA.GA ; aucune dépendance ajoutée, `bun.lock` inchangé, arbre du moteur inchangé après `codegen` |
| Résultat | **vert** (code de sortie 0) |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 250 fichiers, 3 804 tests passés |
| Cliquets du moteur | 30 fichiers, 173 tests passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORA.GA | 793 tests passés |
| Surfaces de DIASPORA.GA | 68 fichiers, 1 259 tests passés |
| Application DIASPORA.GA | 165 fichiers, 2 419 tests passés (157 fichiers et 2 309 tests au couple précédent) |
| Scripts de DIASPORA.GA (`test:scripts`) | 86 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

## Ce que le chantier change

- **La barre** (rail du bureau et barre du téléphone) : Fil, Membres, puis Services quand son module est ouvert, Communautés quand un module rangé sous elle est ouvert, Messages avec iCom. « Explorer » devient « Membres » ; son adresse ne change pas.
- **« Mon espace » quitte le rail** : ses entrées sont dans le menu du compte. « Mes pages » (ex « Mon activité ») et « Mes associations » n'y paraissent qu'avec un contenu.
- **Un module fermé ne montre rien** : ni onglet dans « Mes pages », ni onglet ni lien vers la gestion d'une page, ni écran « indisponible ». Une seule règle pure sert les onglets de la gestion et tous les liens qui y mènent.
- **Le fil** : deux onglets, le pays et « Toute la diaspora ». « Récents », « Pour vous » et la bascule Liste / Découverte restent écrits et testés derrière `apps/diaspora_ga/src/lib/feed-presentation.ts`. Sans actu, plus de tuile « Créer une actu » seule.
- **Le rail droit** : des membres à rencontrer, le pays, les pages du pays, les évènements, puis un rappel du parrainage pour qui peut parrainer ; aucun compteur à zéro, aucun bloc vide.

## Recette au navigateur

Jouée le 22/11/2026 sur le poste s2, en démonstration (données fictives), compte de démonstration administrateur du réseau.

| Constat | Largeur, apparence |
|---|---|
| Tout fermé : barre Fil · Membres ; fil à deux onglets ; rail sans compteur ; menu du compte sans entrée de module | 1 440 px, clair |
| Pages ouvertes : même barre ; menu « Créer » ; « 2 associations » au rail ; « Mes pages » sans barre d'onglets, un seul titre, liens Publications, Gérer, Équipe ; gestion de la page sans onglet de services, `?onglet=services` rend l'identité | 1 440 px, clair |
| Pages et services : barre Fil · Membres · Services ; « Mes demandes » et « Mes pages » au menu du compte ; onglets Offres, Demandes, Pages | 1 440 px, clair |
| Avec les groupes et évènements : barre Fil · Membres · Services · Communautés ; prochains évènements au rail | 1 440 px, clair et sombre |
| Barre basse à quatre entrées, puis à deux entrées tout fermé ; aucun défilement horizontal | 390 px, clair |
| En-tête avec « Mon pays », barre basse à quatre entrées | 834 px, sombre |
| Sans « Communautés » dans la barre, « Mon pays » est l'entrée courante sur le hub du pays | 1 440 px, clair |
| Thème Gaboma : mêmes écrans | 1 440 px, clair |
| Console du navigateur : aucune erreur | toutes |

## Ce qui n'est pas vérifié

- Le mode moteur au navigateur : « Messages » et « Mes relations » n'existent qu'avec iCom et le réseau du moteur, absents de la démonstration ; le bandeau des actus aussi. Leurs règles sont couvertes par les tests.
- Un appareil réel.
- L'onglet « iAppel » du dock iCom reste visible quand les appels sont fermés : le moteur ne filtre pas ses onglets sur la disponibilité des appels. Demande à porter au moteur.
- Sous 440 px, « Mon pays » est masqué dans l'en-tête : sur le hub du pays sans « Communautés », aucune entrée n'est marquée courante.
- Publication : rien n'est publié ; le moteur d'abord, puis le site, sur accord écrit et détaillé du propriétaire.
