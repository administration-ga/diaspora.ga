# Une page, une vue — lot 2a : Réglages en neuf rubriques (24/11/2026)

Application : PR 135 d'`administration-ga/diaspora.ga`. Aucun changement dans le moteur. Rien n'est publié.
Suite du lot 1 (`docs/recette/une-page-une-vue-2026-11-24/RAPPORT.md`), en ligne depuis le 24/11.

## Ce que le lot livre

- **Réglages devient une vue.** Neuf rubriques : Compte, Profil, Pays et visibilité, Fil et annuaire, Messages et
  appels, Affichage et notifications, Consentements, Parrainage, Mes données. Au large, la liste est à gauche et la
  rubrique choisie à droite ; à l'étroit et au téléphone, la liste d'abord, puis la rubrique avec une ligne « Toutes
  les rubriques ». La rubrique est choisie par l'ancre de l'adresse.
- **Primitive `SubViews`** (`packages/diaspora-ga-features/src/primitives/sub-views.tsx`) : le maître–détail d'une
  vue. Un seul volet de détail ; toutes les rubriques restent montées, les inactives masquées par `data-inactive`
  (une saisie non enregistrée survit au changement de rubrique) ; aucune transition.
- **`AppShell layout="view"`** : la coque tient l'écran (toutes ses contraintes sous la variante `tall`), le rail
  droit n'est pas affiché en vue, les pages de flux ne changent pas. `useInformationReader()` ouvre la page
  flottante « Informations » depuis un écran.
- **`useHashView` voit les ancres poussées par le routeur** : `history.pushState` et `replaceState` sont enveloppés
  une fois, l'avis part en différé.
- **La ligne « Informations » des réglages** ouvre la page flottante ; elle reste un vrai lien vers les mentions
  légales (clic modifié).
- **Table `ROUTE_VIEWS`** (`apps/diaspora_ga/src/lib/route-views.ts`) : la nature de chacune des 61 pages (flux,
  vue, référence, à traiter), et son cliquet : chaque page a sa ligne, la liste « à traiter » ne peut que rétrécir,
  un écran de nature « vue » demande bien `layout="view"`.

Ce qui n'est pas construit : la zone « Dans cette page » du rail. À 800 px de haut le rail n'offre que 140 à
236 px, la liste des rubriques en demande environ 400 ; la liste vit dans la vue, qui prend la colonne du rail
droit (plan de l'architecte du 24/11).

## Mesures au navigateur

Navigateur réel, serveur de développement du poste s11, données de démonstration, compte de Mireille IVINDO.
Relevés échantillonnés dans le temps (quatre lectures espacées de 250 ms).

| Format | Avant | Après |
|---|---|---|
| `/parametres`, 1280×800 | 6 441 px | 800 px ; sept rubriques sur neuf sans volet (464, 636, 606, 641, 663, 528 et 196 px) ; « Messages et appels » (1 062 px) et « Mes données » (957 px) dans un seul volet nommé « Détail des réglages » |
| `/parametres`, 1100×800 | non mesuré | 800 px ; un niveau à la fois, ligne « Toutes les rubriques » |
| `/parametres`, 390×844 | 8 612 px | 844 px ; la liste sans volet ; « Compte » 580 px visibles pour 644, « Messages et appels » pour 1 409, « Mes données » pour 1 284, un seul volet chacune ; « Parrainage » sans volet |
| `/parametres#consentements`, 320×640 | non mesuré | 640 px, un volet, aucun défilement horizontal |
| `/parametres#mes-signalements`, 640×400 (zoom à 200 %) | non mesuré | cadre relâché : document de 1 293 px, bonne rubrique, section en tête |

Constaté aussi :
- `#annuaire`, `#session`, `#mes-signalements`, `#mon-fil` et `#profil` ouvrent leur rubrique, la ligne courante
  de la liste suit.
- Depuis `/parametres#profil`, le lien « Mes données » du menu du compte (ancre poussée par le routeur) change de
  rubrique.
- La ligne « Informations » ouvre la page flottante (six entrées, focus sur son titre, adresse inchangée) ; Échap
  la ferme et rend le focus à la ligne.
- Non-régression : `/fil` reste un flux (document de 1 675 px, rail droit affiché) ; `/confidentialite` tient en
  800 px avec une rubrique et deux volets de 541 px.
- Thèmes sombre et clair (Sable) ; console sans alerte ni erreur.

## Tests

- Application, rejoués par la session principale : 419 tests sur 20 fichiers, dont `app-shell` 218 (212 existants
  sans retouche), `settings-screen` 21 (14 existants sans retouche, le test de la liste des cinq textes remplacé),
  `use-hash-view` 7, `settings-views` 7, cliquets 48 (dont `route-views` 5).
- Paquet de surfaces : 417 tests (primitives, dont `sub-views` 17 ; styles ; i18n).
- Garde-fous du lot 1 non retouchés : `legal-screen`, `legal-reader`, `information-sheet`, `providers`,
  `community-rules`, `site-chrome`.

## Vérification et fusion

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, poste s11, le 24/11 de 16 h 46 à 16 h 58, sur le moteur
`f152b07e` (`main`) avec DIASPORA.GA `4441be9` (`main` `6a11696` plus la PR 135) : **verte** (code 0, aucun écart
dans les fichiers suivis). Résultats :
- tests du moteur : 4 170 sur 270 fichiers ;
- typecheck des 13 paquets, tests des 13 paquets, lint des 12 paquets : aucune erreur, aucun avertissement sur les
  fichiers de ce lot, et les mêmes comptes d'avertissements qu'à la vérification du lot 1.

La vérification a attendu que le disque repasse au-dessus du seuil de 6 Go (4,3 Go libres vers 16 h) : deux
sessions voisines ont retiré leurs caches de construction et les exports de leurs séances de publication closes.

Le couple inscrit dans `engine-compat.json` devient DIASPORA.GA `4441be9` et moteur `f152b07e`.

## Non prouvé

- L'effet en ligne : rien n'est publié.
- La carte iCom quand le rail droit n'est pas affiché en vue (mode moteur) : la démonstration locale n'a pas iCom.
- Les cinq autres rubriques au format téléphone (Profil, Pays et visibilité, Fil et annuaire, Affichage et
  notifications, Consentements à 390×844) : non mesurées une à une ; l'estimation de l'architecte est un volet
  chacune.
- Un vrai lecteur d'écran, un vrai téléphone.

## Limites connues

- Un formulaire ne se coupe pas : au téléphone, la plupart des rubriques défilent dans leur volet (une à deux fois
  et demie l'écran, contre dix écrans empilés avant).
- Lot 2b à suivre : `/mes-donnees` en vue et « Mes données » en deux onglets ; puis modération et pages
  personnelles (lot 3).
