# Une page, une vue — lot 2b : « Mes données » en deux onglets (25/11/2026)

Application seule : aucun changement dans le moteur. Suite du lot 2a
(`docs/recette/une-page-une-vue-lot-2a-2026-11-24/RAPPORT.md`), fusionné le 24/11 et pas encore publié au début de
cette séance. Plan suivi : § 9 du plan détaillé du lot 2 (`Plan_lot_2_reglages_en_vues_2026-11-24.md`, dossier de la
documentation du projet).

## Ce que le lot livre

- **`/mes-donnees` devient une vue.** `PublicShell hideEnter layout="view"` et la garde `person` inchangée. Le retour
  (réglages ou accueil) est en tête, puis un seul volet nommé « Mes données », puis un pied d'une ligne
  (Confidentialité, Contact), car la coque publique en vue n'a pas de pied de page. `ROUTE_VIEWS` fait passer la page
  de `pending` à `view`, et le cliquet vérifie que l'écran demande bien `layout="view"`.
- **« Mes données » en deux onglets.** Les onglets sont des liens natifs vers une ancre (`FolderTabsNav`) :
  - « Export et effacement », à `#mes-donnees` ;
  - « Décisions et signalements », à `#mes-decisions`. L'ancre `#mes-signalements` y mène aussi.

  L'adresse dit l'onglet et le retour du navigateur le rend. La même section marche dans les réglages et à
  `/mes-donnees`. Les deux groupes restent montés et l'inactif est masqué (`data-inactive`), sans transition. Un
  export en cours ou un recours en saisie survit donc au changement d'onglet. À l'étroit, les deux onglets se
  partagent la piste et passent sur deux lignes : aucun ne sort de la vue au téléphone.
- **Route `settingsDecisions`** (`/parametres#mes-decisions`), avec ses lignes dans `ROUTE_DESTINATIONS` et
  `ROUTE_FEATURES`. Deux liens y mènent désormais : l'avis de décision de la cloche (`featureRoutes.myDecisions`) et
  le chemin des recours du membre suspendu (refus de publier). La sous-vue « Mes données » des réglages lit la
  nouvelle ancre.
- **Une seule région nommée « Mes données » à `/mes-donnees`.** Quand la section est la page elle-même (titre de
  niveau 1), elle n'est plus une région : c'est le volet qui porte ce nom.
- Textes ajoutés en français et en anglais : `settings.dataRights.tabs.label`, `.data` et `.moderation`.

## Mesures au navigateur

Navigateur réel, serveur de développement du poste s11, fournisseur de démonstration (données fictives). Relevés
échantillonnés dans le temps : six lectures espacées de 300 ms.

| Page et format | Avant (lot 2a) | Après |
|---|---|---|
| `/mes-donnees`, 1280×800, Awa OGOOUÉ sans adhésion | document qui défile | document de 800 px ; volet de 551 px qui ne défile pas ; onglet inactif `display: none` |
| `/mes-donnees#mes-decisions`, 1280×800 | — | document de 800 px ; un seul volet nommé, qui défile de 9 px |
| `/mes-donnees#mes-decisions`, 390×844 | — | document de 844 px ; un seul volet nommé (596 px visibles pour 795) ; les deux onglets font 153×44 px dans une piste de 318 px, sans débordement |
| `/parametres#mes-decisions`, 1280×800, Mireille IVINDO | « Mes données » 957 px dans le volet « Détail des réglages » | document de 800 px ; sous-vue « Mes données », onglet des décisions ; **aucun volet qui défile** |
| `/parametres#mes-donnees`, 1280×800 | idem | document de 800 px ; onglet « Export et effacement » ; aucun volet qui défile |

Constaté aussi :

- Un vrai clic sur l'onglet « Décisions et signalements » change l'adresse et l'onglet.
- Un rechargement sur `#mes-decisions` rouvre le bon onglet.
- Console sans alerte ni erreur.

## Tests

Les fichiers ciblés, rejoués sur le poste : 386 tests sur 12 fichiers (onglets, vue, réglages, routes, table des
destinations, cliquets `route-views`, `i18n-keys`, `no-hardcoded-urls` et `no-hardcoded-strings`, coque,
fonctions du réseau), plus `app-shell` et `providers` (228 tests) et les avis de la cloche du paquet de surfaces
(140 tests).

Nouveaux tests :

- `data-rights-settings` : l'onglet montré sans ancre, les deux groupes montés, `#mes-decisions` et
  `#mes-signalements`, l'ancre qui suit les clics et le retour du navigateur, aucune transition, aucun onglet sans
  capacité.
- `my-data-screen` : un seul volet nommé, le retour dans l'en-tête du cadre, le pied (confidentialité, contact).
- Ancre `#mes-decisions` ajoutée aux tests des réglages, des sous-vues et de la table des routes.

Trois tests existants sont adaptés, chacun pour un changement voulu :

- La liste des adresses permises de `/mes-donnees` admet les deux ancres des onglets.
- Le test « aucune surface sociale » de la section met à part les liens des onglets.
- Le chemin des recours du membre suspendu mène à `#mes-decisions`.

## Vérification complète

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 25/11 de 8 h 17 à 8 h 38 (poste s11). Couple vérifié :
moteur `f152b07e` et DIASPORA.GA `eac1213`. Résultat **vert**, code 0 :

- moteur : 4 170 tests sur 270 fichiers ;
- typage : 13 paquets ;
- tests : 13 paquets, dont 4 624 pour l'application et 2 753 pour le paquet de surfaces ;
- lint : 12 paquets, aucune erreur ; les avertissements sont antérieurs au lot ;
- aucun écart dans les fichiers suivis.

`engine-compat.json` inscrit ce couple.

## Limites

- La pastille « Compte démo » n'apparaît pas à un visiteur anonyme de `diaspora.ga`. Relevé le 25/11 dans Chrome
  sans interface, avec un profil vierge. C'est le comportement prévu tant que la porte des comptes démo est fermée
  dans le moteur (`DemoAccountsPill` → `closed`) : son ouverture dépend de l'envoi WhatsApp de démonstration (CH-817).
- Lecteur d'écran et vrai téléphone non essayés.
- La scission éventuelle de la sous-vue « Profil » en mode moteur (plan, § 9) n'est pas mesurée : le lot ne la fait
  pas.
