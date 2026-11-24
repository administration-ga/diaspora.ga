# Séance de publication — 24 novembre 2026, vers 3 h

Séance à trois temps jouée avec les scripts des dépôts (`docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`, § 8 ;
`ANTSIA/docs/36_PUBLICATION_ET_RETOUR_ARRIERE.md`). Elle a publié, dans l'ordre :
1. le moteur de démonstration ;
2. admin.diaspora.ga ;
3. diaspora.ga.

L'ordre est venu du propriétaire, le 24/11 : « Publie ». Il n'y a eu qu'un seul publieur, la session CH-815, depuis
le poste s4. Les autres sessions ont été prévenues ; une publication restée en attente dans un autre onglet s'est
retirée sans rien envoyer. Ce rapport ne contient aucun identifiant de déploiement, de projet ni d'équipe.

## Ce qui a été publié

| Sujet | Valeur |
|---|---|
| Moteur ANTSIA | `f152b07efab0` (`main`, antsia#208 et #209) |
| DIASPORA.GA | `ceeb0b77347d` (`main`, diaspora.ga#128, #130 et #131) |
| Cible | `demo` |
| Moteur de démonstration avant la séance | `2623cde995e0` |
| admin.diaspora.ga | `admin-diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo` |
| diaspora.ga | `diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo` |
| Versions avant la bascule (cibles du retour arrière) | `admin-diaspora-ga-1f6ee34f5ea8-antsia-2623cde995e0-demo` et `diaspora-ga-1f6ee34f5ea8-antsia-2623cde995e0-demo` |

Ce qui entre en ligne par rapport à la séance du 23/11 :
- au moteur, l'adaptateur WhatsApp de la plateforme actuelle de Bird pour la porte des comptes de démonstration
  (antsia#208 ; la porte n'est **pas** armée) et le battement de présence en trop, qui se tait (antsia#209) ;
- au site, les cinq textes rendus par le serveur, sans attendre la session du moteur (diaspora.ga#130).

## Vérification avant la séance

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, sur le moteur `f152b07e` avec DIASPORA.GA `0fbb694`. Le
résultat est vert : code 0, en 13 minutes, sans écart dans les fichiers suivis. Le site publié, `ceeb0b7`, ne
diffère de `0fbb694` que par un rapport et `engine-compat.json` : `apps/` et `packages/` sont identiques.

Comptes des tests :

| Ensemble | Tests réussis |
|---|---|
| Tests du moteur | 4 170 |
| Cliquets | 200 |
| Scripts | 181 |
| Surfaces sociales | 4 624 |
| admin.diaspora.ga | 279 |
| diaspora.ga | 2 658 |

## Le moteur

| Étape | Résultat |
|---|---|
| Relevé de l'API du candidat | backend local au commit `f152b07e`, `function-spec` |
| `export` | moteur `f152b07e` et DIASPORA.GA `ceeb0b7` (`origin/main`), 4 163 fichiers, aucun `.env*` |
| `moteur-demo-essai` | aucune fonction manquante, ajoutée ni changée par rapport à l'API en ligne ; essai d'envoi sans suppression d'index (seule remarque : la « version Node des actions », artefact connu de la CLI) |
| `moteur-demo` | envoyé ; le commit précédent `2623cde995e0` est consigné |
| `controle-moteur-demo` | l'API servie est identique au relevé du candidat (1 157 fonctions). L'étape est marquée en échec pour la seule sonde de santé du site d'ANTSIA, protégé (302), comme les 22 et 23/11 |

## Les sites

- **Premier lancement** : la phrase `PUBLIER …` a été tapée par le propriétaire et l'envoi d'admin.diaspora.ga
  est parti. Le suivi du déploiement s'est ensuite arrêté sur une erreur réseau passagère de la machine
  (`EADDRNOTAVAIL`). Il n'y a eu aucune bascule et les deux domaines sont restés sur leur version. Le déploiement
  commencé reste chez l'hébergeur, sans domaine.
- **Reprise** : la phrase a été retapée. Les deux sites ont été déployés sans bascule, et leurs contrôles privés
  sont bons : sonde « ok », version exacte, moteur joint, et données du moteur (« engine ») pour diaspora.ga. La
  phrase `BASCULER …` a été tapée, les deux domaines sont promus, et les contrôles publics de la méthode sont bons
  (sonde, version, CSP limitée au moteur de la cible).

## Contrôles après coup (24/11 vers 3 h 35)

- `admin.diaspora.ga/api/sante-fonctionnelle` : version `admin-diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo`,
  moteur joint ; `/entrer` répond 200.
- `diaspora.ga` et `demo.diaspora.ga` : version `diaspora-ga-ceeb0b77347d-antsia-f152b07efab0-demo`, source
  « engine », moteur joint.
- Les cinq textes (`/mentions-legales`, `/confidentialite`, `/conditions-utilisation`, `/regles-communaute`,
  `/contact`) affichent « Version 1.0 du 23 novembre 2026 » et plus « Ouverture de votre session… ».

## Ce qui reste

- L'administration de démonstration reste figée tant que le propriétaire n'a pas fait ces gestes :
  - créer le client identite.ga en bac à sable et ses comptes de test ;
  - poser les variables `IDN_*` du moteur de démonstration et contrôler son `SITE_URL` ;
  - faire entrer une première fois le futur administrateur par l'identité numérique ;
  - lancer l'amorçage `nameFirst` (`ANTSIA/docs/23`, § 7).
- La porte des comptes de démonstration n'est pas armée ; elle s'arme à part (`scripts/demo-gate-list.mjs`).
- La production n'est pas publiée.
- Rien n'a été vérifié au navigateur pendant cette séance : les contrôles ci-dessus sont des lectures HTTP.
