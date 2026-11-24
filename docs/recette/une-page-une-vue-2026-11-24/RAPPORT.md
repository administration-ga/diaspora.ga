# Une page, une vue — lot 1 : page flottante « Informations », textes du site en une vue (24/11/2026)

Application : PR 129 d'`administration-ga/diaspora.ga`. Aucun changement dans le moteur. Rien n'est publié.

## La consigne

Le 24/11/2026, le propriétaire demande : moins d'entrées dans le menu du compte ; une page flottante pour les
informations au téléphone ; des pages qui tiennent en une vue, sans défilement, sauf les pages de fil ; un menu
latéral plus intelligent. Décision de l'architecte, plan et lots :
`NTSAGUI_DIGITAL/ECOSYSTEMES/DOCUMENTATION/DIASPORA_GA/Une_page_une_vue_2026-11-24/Decision_et_plan_une_page_une_vue_2026-11-24.md`.

## Ce que le lot livre

- **La règle « une page = une vue »** : hors des pages de flux (fil, mur, annuaire, listes), le document ne
  défile pas dès que la fenêtre fait 600 px de haut. Un cadre (`ViewFrame`) tient l'écran ; seuls des volets
  nommés et focalisables (`ViewPane`) défilent, deux au plus par vue. Sous 600 px de haut, ou zoomé à 200 %, le
  cadre se relâche (variante `tall`) et la page redevient un document.
- **Les cinq textes du site** (mentions légales, confidentialité, conditions d'utilisation, règles de la
  communauté, contact) se lisent rubrique par rubrique : sommaire, UNE rubrique, Précédent et Suivant
  (`LegalReader`). Les onglets des cinq textes remplacent le grand pied de page. Aucun mot, aucune version,
  aucune date, aucune adresse ni aucune ancre ne change ; le serveur rend toujours le texte entier, sans
  rubrique masquée (PR 130).
- **« Informations » ouvre une page flottante** (`InformationSheet`), au téléphone comme au bureau : la liste des
  six entrées du menu partagé, puis le sommaire d'un texte, puis une rubrique. Une flèche « Retour » remonte
  d'un niveau ; la croix, Échap ou le voile ferment et rendent le focus à l'avatar. L'adresse ne change pas ;
  chaque entrée reste un vrai lien (un clic modifié ouvre la page publique). Elle remplace les six liens du menu
  du compte.
- **Le menu du compte** est rangé par familles (le compte, « Mon espace », Mes données et Informations, la
  sortie), sans changer l'ordre des liens ; dans le rail du bureau, la carte du compte dit la page personnelle
  courante.

## Mesures au navigateur

Navigateur réel, serveur de développement du poste s11, données de démonstration, compte de Mireille IVINDO.
Hauteur du document (`documentElement.scrollHeight`) :

| Page et format | Avant | Après |
|---|---|---|
| /confidentialite, 1280×800 | 9 062 px | 800 px, une rubrique, un volet nommé (« Sommaire ») |
| /conditions-utilisation, 1280×800 | 7 679 px | 800 px |
| /regles-communaute, 1280×800 | 6 121 px | 800 px |
| /mentions-legales, 1280×800 | 4 024 px | 800 px |
| /contact, 1280×800 | 2 970 px | 800 px, aucun volet |
| /confidentialite, 390×844 | 14 845 px | 844 px (sommaire seul ; avec une ancre, la rubrique seule) |
| /conditions-utilisation, 320×640 | non mesuré | 640 px, aucun défilement horizontal |
| /confidentialite#rights, 640×400 (zoom à 200 %) | non mesuré | cadre relâché : document de 988 px, rubrique ancrée seule |

Constaté aussi :
- HTML rendu par le serveur (`curl`) : 19 rubriques pour la confidentialité, 12 pour les règles, aucun
  `data-inactive`.
- `/regles-communaute#respect` montre la règle 2 seule, avec ses motifs de signalement.
- Page flottante au bureau : liste (560×468), puis texte en 920×680 avec sommaire et rubrique côte à côte ; focus
  sur le titre à chaque niveau ; Échap ferme et rend le focus à l'avatar ; l'adresse reste celle de la page.
- Page flottante au téléphone (390×844) : la feuille du compte se ferme, la page flottante s'ouvre ; trois niveaux,
  « Retour » deux fois, Échap ; même hauteur (743 px) aux trois niveaux.
- Menu du compte par familles, au bureau et au téléphone ; sur `/parametres`, la carte du compte du rail dit
  « Réglages ».
- Gaboma sombre et Sable clair sur un texte ; console sans erreur applicative.

## Deux défauts trouvés à la recette, corrigés (`11631bb`)

- En mouvement réduit, la charte donne à tout élément une transition de 0,01 ms sur toutes ses propriétés. Le
  volet du sommaire, qui change de `flex` à l'hydratation, passait par une image écrasée (24 px au lieu de
  545 px à 390×844), visible tant que le navigateur retient ses images. `ViewPane` ne joue plus aucune transition
  (`transition-none`) ; un test le verrouille.
- Au téléphone, la page flottante passait d'environ 490 px (la liste) à 743 px (un texte). Elle garde la même
  hauteur aux trois niveaux.

## Tests

- Application : `app-shell` 212, `legal-screen` 43 (les 33 d'origine intacts, 10 ajoutés), `legal-reader` 11,
  `information-sheet` 9, `site-chrome` 6, `use-hash-view` 5, `legal-texts` 5, `plain-click` 6 ; `providers` 9 et
  `community-rules` 6, garde-fous du texte entier, non retouchés ; cliquets 43.
- Paquet de surfaces : primitives 13, dont le volet sans transition ; i18n 25.

## Vérification et fusion

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, poste s11, le 24/11 de 11 h 35 à 11 h 49, sur le moteur
`f152b07e` (`main`) avec DIASPORA.GA `a2f1a2f` (`main` `320fcb5` plus la PR 129) : **verte** (code 0, aucun écart
dans les fichiers suivis). Résultats :
- tests du moteur : 4 170 sur 270 fichiers ;
- typecheck des 13 paquets, tests des 13 paquets, lint des 12 paquets : aucune erreur, et aucun avertissement sur
  les fichiers de ce lot.

Une première passe, le 24/11 vers 03 h 10 sur le moteur `0c4b283b`, avait été arrêtée sans rien prouver : machine
très chargée, `modules/live/discovery.test.ts` (moteur, sans rapport avec cette PR, d'ordinaire en moins d'une
seconde) expiré à 299 s, ce qui arrêtait la chaîne avant les paquets de DIASPORA.GA.

Le couple inscrit dans `engine-compat.json` devient DIASPORA.GA `a2f1a2f` et moteur `f152b07e`.

## Non prouvé

- L'effet en ligne : rien n'est publié.
- Le passage du focus avec un vrai lecteur d'écran ; un vrai téléphone ; la page avec le script désactivé dans le
  navigateur (seul le HTML du serveur a été lu).

## Limites connues, renvoyées aux lots suivants

- Une rubrique très longue (jusqu'à trois hauteurs de volet au téléphone) et un sommaire de 19 lignes défilent
  encore dans leur volet : c'est l'exception admise par la règle.
- Après l'hydratation, la recherche du navigateur ne trouve que la rubrique affichée ; l'impression sort tout le
  texte. Lot 4 : « Lire tout le texte à la suite ».
- Le retour du téléphone ne remonte pas d'un niveau dans la page flottante (lot 5, toutes les feuilles).
- À 320 px de large, l'en-tête public, la langue et les onglets laissent environ 300 px au contenu.
- Sur les pages publiques des textes, « Entrer » s'affiche encore pour un membre connecté ; il n'y arrive plus par
  le menu, mais encore par les liens des réglages (lot 4).
- Réglages (6 441 px à 1280×800, 8 612 px à 390×844), modération (2 986 px) et pages personnelles : lots 2 et 3.

## Piège pour les recettes

Dans le navigateur intégré, le mouvement réduit est actif et la page retient ses images tant qu'aucune capture ne
les force : une mesure de mise en page prise juste après une navigation peut montrer un état intermédiaire.
Échantillonner la valeur dans le temps avant de conclure.
