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

## Suite

Le moteur porte deux PR ouvertes qui attendent un accord écrit : la cloche d'un message à deux et l'onglet
iAppel masqué ; la porte des comptes de démonstration, en brouillon, durcie après une relecture de sécurité
indépendante. La pastille « Compte démo » du site suit la porte.
