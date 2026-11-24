# Séance de publication — 24 novembre 2026, vers 15 h : diaspora.ga, lot « une page, une vue »

Séance jouée avec le script du dépôt (`docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`, § 4). Elle a publié
**diaspora.ga seul** : ni le moteur, déjà en ligne au même commit, ni admin.diaspora.ga.

L'ordre est venu du propriétaire, le 24/11 : « Oui, publie ». Il n'y a eu qu'un seul publieur, la session
« une page, une vue » (CH-832), depuis le poste s11. Les sept sessions qui travaillent sur DIASPORA.GA et sur le
moteur ont été prévenues avant, puis à la clôture. Ce rapport ne contient aucun identifiant de déploiement, de
projet ni d'équipe.

## Ce qui a été publié

| Sujet | Valeur |
|---|---|
| Moteur ANTSIA (inchangé, déjà en ligne) | `f152b07efab0` (`main`) |
| DIASPORA.GA | `cafab19e6a44` (`main`, diaspora.ga#129) |
| Cible | `demo` |
| diaspora.ga | `diaspora-ga-cafab19e6a44-antsia-f152b07efab0-demo` |
| Version avant la bascule (cible du retour arrière) | `diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo` |
| admin.diaspora.ga (non republiée) | `admin-diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo` |
| Contexte figé | 4 174 fichiers, la même empreinte aux deux lancements |

Ce qui entre en ligne : le lot 1 de « une page = une vue » (`docs/recette/une-page-une-vue-2026-11-24/RAPPORT.md`) —
la page flottante « Informations », les cinq textes du site lus rubrique par rubrique, le menu du compte rangé par
familles, la carte du compte du rail qui dit la page courante.

## Vérification avant la séance

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 24/11 de 11 h 35 à 11 h 49, sur le moteur `f152b07e`
avec DIASPORA.GA `a2f1a2f` : verte (code 0, aucun écart dans les fichiers suivis). Le site publié, `cafab19`, ne
diffère de `a2f1a2f` que par un rapport et `engine-compat.json` : `apps/` et `packages/` sont identiques.

Avant la première phrase : plan joué à blanc sans variable ni préalable manquant, les deux commits sur
`origin/main` ; `release-check.mjs` sur la version alors servie : sonde « ok », source « engine », moteur joint.

## Le site

- **Premier lancement** : la phrase `PUBLIER …` a été tapée par le propriétaire. Le déploiement s'est fait sans
  bascule et son contrôle privé était bon. À la seconde porte, c'est de nouveau la phrase `PUBLIER …` qui est
  arrivée (collée deux fois, la seconde gardée par le terminal) : le script s'est arrêté à « confirm-promote »,
  sans bascule. Contrôlé aussitôt : le domaine servait toujours `ceeb0b7`. Ce déploiement reste chez l'hébergeur,
  sans domaine.
- **Reprise** : la phrase `PUBLIER …` a été retapée ; déploiement sans bascule, prêt ; contrôle privé bon (sonde
  « ok », version exacte, source « engine », moteur joint). La phrase `BASCULER …` a été tapée par le
  propriétaire ; le domaine est promu le 24/11 à 15 h 23, et le contrôle public de la méthode est bon (sonde,
  version, CSP limitée au moteur de la cible), sans écart.

## Contrôles après coup (24/11 vers 15 h 25)

- `release-check.mjs` rejoué : la cible sert `diaspora-ga-cafab19e6a44-antsia-f152b07efab0-demo`, sonde « ok »,
  source « engine », moteur joint et visé.
- `diaspora.ga` et `demo.diaspora.ga`, `/api/sante-fonctionnelle` : état « ok », la même version.
- HTML rendu par le serveur pour `/confidentialite` : 19 rubriques, aucune masquée.
- **Dans un navigateur réel**, sur `diaspora.ga` :
  - `/confidentialite` à 1280×800 : le document fait 800 px et ne défile pas, une rubrique visible, « Version 1.0
    du 23 novembre 2026 » ; les deux volets font 541 px dès le premier relevé et ne jouent aucune transition
    (échantillonné toutes les 100 ms sur `/conditions-utilisation`) ;
  - `/regles-communaute#respect` à 390×844 : 844 px, la règle 2 seule ;
  - connecté avec un compte de démonstration : le menu du compte est rangé par familles ; « Informations » ouvre
    la page flottante avec ses six entrées, le focus sur son titre, l'adresse inchangée ; Échap la ferme.

## Ce qui reste

- Un ancien script de publication du 23/11 attend encore une phrase dans un onglet de terminal du propriétaire
  (ancien couple) : à arrêter par Ctrl-C, par lui.
- Non constaté en ligne : la page d'entrée déconnectée, la page flottante au téléphone, un vrai lecteur d'écran,
  un vrai téléphone.
- La production n'est pas publiée. admin.diaspora.ga garde sa version du matin.
- Lots suivants de « une page = une vue » : réglages, modération, pages personnelles (CH-832).

## Piège pour les séances

Coller la phrase d'une porte **une seule fois**, puis ne plus toucher au clavier : ce qui est tapé pendant l'envoi
reste dans le terminal et sert de réponse à la porte suivante. Les deux phrases sont différentes (`PUBLIER …`,
puis `BASCULER …`).
