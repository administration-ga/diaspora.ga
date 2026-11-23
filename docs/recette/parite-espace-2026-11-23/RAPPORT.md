# Parité avec espace.administration.ga — vérification et recette du 23 novembre 2026

Chantier CH-817 : fil, iCom et directs de DIASPORA.GA mis au niveau de ce qui est abouti dans
espace.administration.ga, et premiers lots des comptes de démonstration. Ce rapport couvre les PR 114 à 119 de
DIASPORA.GA, toutes fusionnées dans `main`. Il ne contient aucun identifiant de déploiement ni aucune valeur de
variable. Rien n'est publié par ces fusions.

## Ce qui est entré dans `main`

| PR | Contenu | Lot |
|---|---|---|
| 114 | Comptes de démonstration : règle d'offre (onze acteurs au lancement) et publications d'exemple, domaine seul | A0 |
| 115 | Fil : épingler sur son mur, retirer d'ANTSIA, suivre les commentaires ; feuille de partage du téléphone ; recherche dans les publications | FD-10, FD-06, DS-11 |
| 116 | Notifications de cet appareil : abonnement et retrait depuis les réglages | DS-14 |
| 117 | Direct du moteur monté, interrupteur `live` fermé : rien n'est proposé ni servi | — |
| 118 | Cloche : le message à deux est nommé, une notification poussée s'ouvre à sa place, le journal d'appels fermé se tait | DS-14, IC-09 |
| 119 | Composeur : la vidéo d'un iPhone est convertie avant l'envoi | FD-02 |

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, trois fois, chaque fois verte (code 0, aucun écart dans
les fichiers suivis) : codegen, typage du moteur et de ses tests, tests du moteur, cliquets, scripts, puis typage,
tests et lint de chaque espace de travail (0 erreur de lint ; avertissements antérieurs).

| Passage | Moteur ANTSIA | DIASPORA.GA vérifié | Fusion |
|---|---|---|---|
| 1 | `967e731b` (`main`) | assemblage `3cd7d78` = `main` `00edd7f` + PR 114 et 115 | `main` `31ffa6c`, même arbre |
| 2 | `967e731b` | assemblage `f3d64bd` = `main` `31ffa6c` + PR 116 et 117 | `main` `404de64`, même arbre |
| 3 | `967e731b` | assemblage `f1bdb6a` = `main` `404de64` + PR 118 et 119 | `main` `32ed23f`, même arbre |

Chaque fusion a été faite à la tête relue de la PR, et l'arbre de `main` après fusion comparé à l'arbre de
l'assemblage vérifié : identiques les trois fois. Le couple inscrit dans `engine-compat.json` est donc
DIASPORA.GA `32ed23f` et moteur `967e731b`.

Dernier passage : tests du moteur 3 978 ; cliquets 188 ; domaine social 1 112 ; contrats 90 ; accès au moteur
309 ; contrats natifs 94 ; charte 2 323 ; surfaces sociales 4 606 ; paquet partagé de DIASPORA.GA 1 348 ;
console du moteur 169 ; admin.diaspora.ga 277 ; antsia.ga 2 074 ; application mobile 282 ; diaspora.ga 2 547.

## Recette au navigateur

Source de démonstration (données fictives de ce navigateur), 375 px et bureau, aucune erreur de l'application en
console.

| Geste | Constat |
|---|---|
| Menu d'une publication de soi : « Épingler sur mon mur » | Avis « Publication épinglée en tête de votre mur », mention « Épinglée » sur le profil |
| Recherche dans les publications depuis « Membres » | « Lyon » : deux publications trouvées, cartes complètes |
| « Partager » | Feuille avec le rappel « le partager ne la rend pas publique », le lien, « Copier le lien » |
| `/notifications/ouvrir` avec une référence inconnue | Repli sur la page des notifications |
| Composeur | S'ouvre avec « Joindre des photos ou une vidéo » |

## Ce qui n'est pas prouvé

- Aucune recette en source moteur : ni épingle vue par un autre compte, ni retrait relu depuis ANTSIA, ni avis
  d'un commentaire suivi, ni message à deux annoncé dans la cloche.
- Aucune notification reçue sur un appareil : les clés de notification ne sont pas posées.
- Aucune vraie vidéo d'iPhone convertie : les tests simulent le navigateur. À faire avec un téléphone.
- Aucun direct joué : l'interrupteur reste fermé, le serveur vidéo n'est pas configuré.
- La feuille de partage native n'a pas été vue : le navigateur de recette ne l'offre pas.
- Largeur de 834 px et thème clair non revus pour ces lots.

## Moteur : cloche d'un message à deux et porte des comptes de démonstration (23/11, 19 h 35)

Sur accord écrit du propriétaire (« Oui, fusionne »), les deux PR du moteur sont entrées dans son `main` :

| PR du moteur | Contenu |
|---|---|
| 204 | iCom : onglet iAppel masqué quand l'application ne propose pas d'appel ; cloche neutre d'un message à deux (IC-09) |
| 205 | Porte des comptes de démonstration (code de 6 chiffres et 1 lettre par WhatsApp, session courte, catalogue par règle, publications d'exemple), durcie après une relecture de sécurité indépendante : verrou sur la connexion, quatre routes d'authentification sans appelant fermées, surface d'authentification figée par un cliquet |

Chaque PR avait d'abord passé seule la vérification commune avec DIASPORA.GA `089f4c1`. Elles n'avaient jamais
été vérifiées ensemble : leur union a donc été assemblée (`main` `967e731b` + 204 + 205, assemblage `3463086a`)
et vérifiée avant toute fusion. `bun run --cwd ../ANTSIA verify`, sous le verrou commun, à 19 h 31 : **verte**
(code 0, aucun écart). Tests du moteur 4 115 ; cliquets 189 ; domaine social 1 114 ; contrats 104 ; surfaces
sociales 4 624 ; diaspora.ga 2 547.

Les deux PR ont été fusionnées à leur tête relue ; le `main` du moteur est `a06c0ea5`, et son arbre est
identique à l'arbre de l'assemblage vérifié. Le couple inscrit dans `engine-compat.json` devient donc
DIASPORA.GA `089f4c1` et moteur `a06c0ea5`.

La porte n'est pas armée et rien n'est publié : sans son secret, le moteur se comporte comme avant.

## Pastille « Compte démo » et catalogue de déploiement (23/11, 21 h 25)

Sur accord écrit du propriétaire, la PR 206 du moteur (catalogue de déploiement : `diaspora_ga` reçoit l'origine
des actions HTTP à la construction et l'adresse du serveur vidéo à l'exécution ; deux lignes de substitution
Cloud Build) puis la PR 120 du site (pastille tout en bas de la porte d'entrée, feuille en trois temps, en-tête
de la porte sur les deux requêtes de connexion) sont entrées dans leur `main`.

Le couple a été vérifié deux fois : une première fois sur le `main` du site d'alors, puis, ce `main` ayant reçu
entre-temps les PR 123 et 124 (textes du site), une seconde fois sur l'assemblage final, moteur `a06c0ea5` +
PR 206 avec site `c9827ec` + PR 120. `bun run --cwd ../ANTSIA verify`, sous le verrou commun, à 21 h 20 :
**verte** (code 0, aucun écart). Tests du moteur 4 115 ; cliquets 189 ; diaspora.ga 2 648.

Fusions à la tête relue ; le `main` du moteur est `8dda9d93` et celui du site `77e6800`, chacun d'arbre
identique à l'arbre vérifié. Le couple inscrit dans `engine-compat.json` devient DIASPORA.GA `77e6800` et
moteur `8dda9d93`.

Non prouvé : la pastille n'a pas été vue au navigateur (elle n'apparaît que branchée sur un moteur qui autorise
les comptes de démonstration) ; aucun code n'a été envoyé par WhatsApp ; la porte n'est pas armée.

## Suite

Ordre à tenir : publier le moteur et le site, puis armer la porte (remise à zéro puis liste des numéros, par le
script du moteur). Avant d'armer, constater en recette l'adresse de l'appelant sur les actions HTTP.

## Envoi WhatsApp par la plateforme actuelle de Bird (23/11, 23 h 40)

Le compte Bird du propriétaire est sur la plateforme actuelle (clé d'espace de travail en `bk_`), dont l'API diffère
de celle des SMS du socle. La PR 208 du moteur ajoute l'adaptateur correspondant : `WHATSAPP_PROVIDER=bird` désigne
désormais cette API (en-tête `Bearer`, modèle désigné par son nom), l'ancien adaptateur reste disponible sous
`bird-channels`. Un modèle créé par le propriétaire exige son numéro expéditeur ; sans lui, la porte se dit
indisponible. Le tableau de bord du propriétaire offre le modèle géré `bird_otp` (français et anglais, aucun
expéditeur à fournir), dont l'exemple d'appel a exactement la forme de l'adaptateur.

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, à 23 h 36, sur le moteur `2623cde9` + PR 208 avec
DIASPORA.GA `6c94fd8` : **verte** (code 0, aucun écart). Tests du moteur 4 168 ; cliquets 200 ; diaspora.ga 2 649.
Fusion à la tête relue ; le `main` du moteur est `0c4b283b`, d'arbre identique à l'arbre vérifié. Le couple inscrit
dans `engine-compat.json` devient DIASPORA.GA `6c94fd8` et moteur `0c4b283b`.

Non prouvé : aucun code n'a été envoyé par WhatsApp ; la porte n'est pas armée ; l'acceptation d'un code de six
chiffres et une lettre par le modèle `bird_otp` reste à constater au premier essai.

