# Publication et retour arrière de diaspora.ga et d'admin.diaspora.ga

> Lot LX-02 du plan 17 (`docs/etudes/2026-11-10-finalisation/17_LANCEMENT_PILOTE_EXPLOITATION_MODELE_ECONOMIQUE.md`) ;
> publication à deux applications : CH-815, lot A8 (fiche « Application d'administration
> admin.diaspora.ga » du 22/11/2026, § 5 et § 8).
> Ce document vit dans un dépôt public : il nomme des variables, jamais leur valeur ; il ne cite
> aucun identifiant de projet, d'équipe ou de déploiement, aucune adresse de déploiement.
>
> **État au 23/11/2026** : diaspora.ga a été publié deux fois sur la démonstration avec ces scripts
> (`docs/recette/publication-2026-11-22/`, `docs/recette/publication-2026-11-23/`). **Aucun retour
> arrière n'a été joué** : le critère « un retour arrière est joué sur la démonstration et consigné »
> reste à remplir, sur accord écrit. La publication d'admin.diaspora.ga et celle des deux applications
> dans la même séance (§ 7 et § 8) sont écrites et testées sans réseau (hébergeur, machine et sondes
> simulés) ; **elles n'ont jamais été jouées**.

Jusqu'au 3/11/2026, publier le site de démonstration et revenir en arrière reposaient sur des
scripts tenus hors de tout dépôt, sur un seul poste, avec des identifiants écrits en clair. Ils
entrent ici, sous la même méthode, avec des garde-fous testés et des identifiants lus dans
l'environnement de la machine qui publie. La production (`docs/36_MISE_EN_PRODUCTION.md`) emploie
les mêmes scripts, avec la cible `production`.

## 1. La porte

Toute publication, démonstration comprise, et tout retour arrière exigent **l'accord écrit et
détaillé du propriétaire**, qui nomme :

1. le **commit de chaque dépôt** : ANTSIA et DIASPORA.GA ;
2. la **cible** : `demo` ou `production` ;
3. l'**ordre** : le backend du moteur d'abord, publié par la session du moteur depuis le même
   commit d'ANTSIA ; puis ce site ; un seul publieur à la fois ;
4. le **retour arrière** : le déploiement servi avant la bascule, et la version qu'il dit.

Pour admin.diaspora.ga, ou pour les deux applications dans la même séance (`--app`, § 7 et § 8),
l'accord nomme aussi l'application, ou les deux dans leur ordre ; les phrases à taper portent alors
l'étiquette de chaque application.

Les scripts rappellent ces quatre points, puis s'arrêtent devant une phrase à taper. **Aucune option
ne contourne la porte** : `--yes` ou `--force` sont refusés comme arguments inconnus, aucune variable
ne vaut accord, et une entrée qui n'est pas un terminal (tube, script, agent) refuse. Sans accord,
l'opérateur tape autre chose et rien ne part. Le plan, lui, ne lance rien : il se colle tel quel dans
la demande d'accord, car il ne recopie aucune valeur de la machine.

## 2. Les scripts

| Script | Rôle | Par défaut | Avec `--execute` |
|---|---|---|---|
| `scripts/release.mjs` | publier le site d'une cible | affiche le plan, rien ne part | exécute, après deux phrases tapées : « PUBLIER … » puis « BASCULER … » |
| `scripts/release-check.mjs` | contrôler une version servie | lecture seule (deux requêtes GET sur le site) | sans objet |
| `scripts/rollback.mjs` | remettre en service le déploiement précédent | affiche le plan, rien ne part | exécute, après la phrase « REVENIR … » |
| `scripts/release-lib.mjs` | bibliothèque commune (applications, cibles, variables, contexte figé, porte) | — | — |

Chacun prend `--app` : `diaspora_ga`, la valeur par défaut (sans `--app`, les scripts font exactement
ce qu'ils faisaient avant), ou `admin_diaspora_ga` ; `release.mjs` prend aussi `all`, les deux
applications dans la même séance (§ 8). Une autre valeur est refusée, en la citant et en donnant les
valeurs admises ; `all` est refusé par le contrôle et par le retour arrière, qui ne valent que pour une
application à la fois. Ce qui distingue les deux applications (variables, liste publique, sonde,
étiquette, dossier) tient dans une seule table, `RELEASE_APPS` de `release-lib.mjs`.

Ils se lancent avec `node` (22 ou plus) ou `bun`, depuis la racine de DIASPORA.GA, ANTSIA à côté dans
`ECOSYSTEMES`. Tests : `bun test ./scripts` depuis la racine de DIASPORA.GA (repris par `bun run
test`). Aucun test ne joint le réseau.

## 3. Le poste qui publie

Préalables, posés par le propriétaire ou par l'opérateur qu'il désigne :

- les deux dépôts clonés côte à côte sous `ECOSYSTEMES/`, à jour d'`origin/main` ;
- la ligne de commande de l'hébergeur installée et **connectée par le propriétaire** (`vercel
  login`) : aucun jeton ne passe par les scripts ;
- le projet d'hébergement de la cible, créé par le propriétaire et réglé comme celui de la
  démonstration (`../ANTSIA/docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md`, § 6) : dossier racine
  `DIASPORA_GA/apps/diaspora_ga`, Node 24, installation
  `cd ../../../ANTSIA && npx --yes bun@1.4.2 install --frozen-lockfile`, construction
  `npx --yes bun@1.4.2 run build` ;
- les **variables de la machine**, posées dans le terminal de la session de publication, jamais dans
  un fichier du dépôt.

`<CIBLE>` vaut `DEMO` ou `PRODUCTION` : chaque cible a ses propres variables, et les réglages de la
démonstration ne peuvent pas servir la production par mégarde.

| Variable de la machine | Rôle | Passe au site sous le nom |
|---|---|---|
| `DIASPORA_GA_<CIBLE>_SITE_URL` | origine https du site de la cible | `NEXT_PUBLIC_SITE_URL` |
| `DIASPORA_GA_<CIBLE>_CONVEX_URL` | origine du backend du moteur de la cible | `NEXT_PUBLIC_CONVEX_URL` |
| `DIASPORA_GA_<CIBLE>_CONVEX_SITE_URL` | origine des actions HTTP du même backend | `CONVEX_SITE_URL` |
| `DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID` | projet d'hébergement de la cible | `VERCEL_PROJECT_ID` (ligne de commande seulement) |
| `DIASPORA_GA_<CIBLE>_IDN_PORTAL_URL` (facultative) | portail IDN ; absente, le lien d'élévation ne s'affiche pas | `NEXT_PUBLIC_IDN_PORTAL_URL` |
| `DIASPORA_GA_<CIBLE>_CONSULATE_URL` (facultative) | consulat.ga ; absente, le lien ne s'affiche pas | `NEXT_PUBLIC_CONSULATE_URL` |
| `DIASPORA_GA_VERCEL_ORG_ID` | équipe d'hébergement | `VERCEL_ORG_ID` (ligne de commande seulement) |
| `DIASPORA_GA_VERCEL_SCOPE` | portée des commandes de l'hébergeur | option `--scope` |
| `DIASPORA_GA_RELEASE_WORKDIR` (facultative) | dossier parent du dossier de travail, hors des dépôts | — |

Le script pose lui-même `NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE=engine` (un site publié sert le moteur,
jamais les données fictives) et `NEXT_PUBLIC_BUILD_SHA=<étiquette de version>` (que la sonde dira).
La garde de construction (LX-01, `apps/diaspora_ga/src/lib/production-build-guard.ts`) refuserait
de toute façon une construction vers un domaine public sans ces deux valeurs.

Le plan refuse : une variable manquante ; une origine qui n'est pas en https ou qui porte un chemin ;
un site sur un poste de développement (`localhost`, `*.test`…) ; une même ressource déclarée pour la
démonstration et pour la production ; toute variable hors de la liste publique. Cette liste est celle
du catalogue de publication du moteur (`../ANTSIA/deploy/catalog.json`, entrée `diaspora_ga`) :
un test les compare.

### 3.1 Les variables d'admin.diaspora.ga

admin.diaspora.ga a son propre site et son propre projet d'hébergement ; il sert **le même moteur** que
diaspora.ga pour une même cible, et il connaît l'adresse du site des membres. Il ne reçoit donc que deux
variables nouvelles par cible, et relit celles du moteur et du site des membres : une copie pourrait
pointer l'administration vers un autre moteur que celui des membres.

| Variable de la machine | Rôle | Passe au site sous le nom |
|---|---|---|
| `ADMIN_DIASPORA_GA_<CIBLE>_SITE_URL` | origine https du site d'administration de la cible | `NEXT_PUBLIC_SITE_URL` |
| `ADMIN_DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID` | projet d'hébergement du site d'administration | `VERCEL_PROJECT_ID` (ligne de commande seulement) |
| `DIASPORA_GA_<CIBLE>_CONVEX_URL` | le moteur de la cible, celui des membres | `NEXT_PUBLIC_CONVEX_URL` |
| `DIASPORA_GA_<CIBLE>_CONVEX_SITE_URL` | les actions HTTP du même moteur | `CONVEX_SITE_URL` |
| `DIASPORA_GA_<CIBLE>_SITE_URL` | le site des membres de la même cible (lien « Ouvrir diaspora.ga ») | `NEXT_PUBLIC_MEMBERS_SITE_URL` |
| `DIASPORA_GA_VERCEL_ORG_ID`, `DIASPORA_GA_VERCEL_SCOPE`, `DIASPORA_GA_RELEASE_WORKDIR` | les mêmes que pour diaspora.ga | — |

Le script pose lui-même `NEXT_PUBLIC_BUILD_SHA=<étiquette de version>`. Il ne passe **jamais**
`NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE` (l'application d'administration n'a pas de données fictives), ni
les liens vers IDN et consulat.ga. Sa liste publique est celle de l'entrée `admin_diaspora_ga` du
catalogue ; chaque application a la sienne, et une variable de l'une est refusée à l'autre.

En plus des refus du § 3, le plan refuse un site ou un projet d'hébergement d'admin.diaspora.ga qui
serait celui de diaspora.ga, dans les deux sens : publier l'une n'écrase jamais l'autre.

## 4. Publier

### 4.1 Le plan

```bash
node scripts/release.mjs --target demo --antsia <commit ANTSIA> --diaspora-ga <commit DIASPORA.GA>
```

Le script résout chaque référence en commit complet et en arbre, par le dépôt local seulement, dit si
chacun est sur `origin/main` (relevé local, relu avant toute exécution), liste les variables de la
machine qui manquent, et affiche les étapes ci-dessous avec les commandes exactes. Les valeurs de la
machine y paraissent sous leur nom (`<DIASPORA_GA_DEMO_SITE_URL>`), jamais en clair.

Il relève aussi, par les dépôts locaux et aux commits publiés, deux **préalables** : le dossier de
l'application existe au commit de DIASPORA.GA, et le catalogue de publication du moteur au commit
d'ANTSIA la déclare, au même dossier, avec la même liste publique (et, pour admin.diaspora.ga, le
réseau qu'elle administre, `administers_network`). Le catalogue et le dossier de l'application se
fusionnent en couple ; c'est le catalogue qui ouvre l'origine du site dans le moteur. Un préalable
manquant s'affiche à part et refuse l'exécution.

### 4.2 Les étapes

| # | Étape | Commande | Ce qui arrête |
|---|---|---|---|
| 1 | Porte : accord écrit, puis « PUBLIER <cible> <version> » tapé | — | toute autre réponse, ou une entrée qui n'est pas un terminal |
| 2 | Relire `origin/main` des deux dépôts | `git fetch origin main` | échec de la lecture |
| 3 | Chaque commit est sur `origin/main` | `git merge-base --is-ancestor` | une branche non fusionnée, un HEAD local |
| 4 | Contexte figé dans un dossier vide hors des dépôts : `git archive` de chaque commit (fichiers suivis seulement, aucun `.env.local`), `.vercelignore`, empreinte SHA-256 des sources | `git archive`, `tar` | une archive impossible |
| 5 | Relever le déploiement servi et la version que dit sa sonde : la cible du retour arrière | `vercel inspect <site>` et la sonde | rien (une première publication le dit) |
| 6 | Publier **sans bascule** : variables publiques en construction et en exécution, les deux commits et l'empreinte en métadonnées | `vercel deploy --prod --skip-domain --archive=tgz` | aucune adresse de déploiement rendue |
| 7 | Le déploiement est prêt | `vercel inspect <déploiement>` | un état autre que `READY` |
| 8 | Contrôle privé : la sonde du déploiement dit « ok », la version attendue, la source « engine », le moteur configuré et joint | `vercel curl /api/sante-fonctionnelle --deployment` | le moindre écart : **aucune bascule**, le domaine sert toujours l'ancienne version |
| 9 | Seconde porte : « BASCULER <cible> <version> » tapé, après lecture du contrôle | — | toute autre réponse : le déploiement reste publié sans domaine |
| 10 | Bascule du domaine | `vercel promote <déploiement>` | échec de la bascule |
| 11 | Contrôle public (cinq essais espacés, le temps de la propagation) : sonde, version servie, moteur visé | `release-check.mjs` | un écart : le script s'arrête et **propose** la commande de retour arrière, sans la jouer |

### 4.3 L'étiquette de version

`diaspora-ga-<12 premiers caractères du commit DIASPORA.GA>-antsia-<12 premiers caractères du commit
ANTSIA>-<cible>`, la même forme que les publications de la démonstration du 22/10 au 3/11. La sonde
la rend dans son champ `version` ; c'est la preuve que la version servie est celle de l'accord.

### 4.4 Le relevé

Chaque exécution écrit `release.json` dans son dossier de travail (sous le dossier temporaire du
système, ou sous `DIASPORA_GA_RELEASE_WORKDIR`) : commits, étiquette, empreinte et nombre de fichiers,
déploiement créé, déploiement servi avant la bascule et sa version, étapes franchies, écarts. Ce
relevé contient des identifiants : il **ne s'ajoute jamais au dépôt**. Un rapport de recette dans
`docs/recette/` ne reprend que la date, les deux commits, l'étiquette et les verdicts.

## 5. Contrôler

```bash
node scripts/release-check.mjs --target demo --version <étiquette>
node scripts/release-check.mjs --app admin_diaspora_ga --target demo --version <étiquette d'admin.diaspora.ga>
```

Trois preuves, lues sur le site de la cible :

1. la sonde `/api/sante-fonctionnelle` (LX-01) dit l'état « ok », l'application `diaspora-ga`, la
   source « engine », le moteur configuré et joint ;
2. la version servie est l'étiquette attendue ;
3. le **moteur visé** est celui de la cible : la politique de sécurité du contenu (`connect-src`,
   construite à partir de l'adresse du moteur au moment de la construction) autorise l'origine de
   `DIASPORA_GA_<CIBLE>_CONVEX_URL`, et aucune origine d'un autre moteur.

Le contrôle ne suit aucune redirection : une protection d'accès posée sur le domaine public le ferait
échouer (le contrôle privé de l'étape 8 passe, lui, par la ligne de commande de l'hébergeur). Ses
messages nomment les variables ; une erreur du réseau n'est jamais recopiée, car elle peut citer une
adresse.

## 6. Revenir en arrière

### 6.1 Le site

```bash
node scripts/rollback.mjs --target demo --to <déploiement servi avant la bascule> --version <son étiquette>
node scripts/rollback.mjs --app admin_diaspora_ga --target demo --to <déploiement servi avant la bascule> --version <son étiquette>
```

Le déploiement et son étiquette sont ceux que l'étape 5 a relevés (`release.json`) ; après un contrôle
public en écart, `release.mjs` affiche la commande exacte. Avec `--execute`, après la phrase « REVENIR
<cible> <version> », le script :

1. vérifie que le déploiement désigné existe, est prêt, a été publié pour la production de la cible
   et appartient au projet de `DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID` (pour admin.diaspora.ga :
   `ADMIN_DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID`, jamais celui des membres) ;
2. le remet en service par promotion (`vercel promote`) : **rien n'est reconstruit ni supprimé** ;
3. contrôle que le site dit de nouveau l'étiquette attendue, sur le bon moteur.

Si le contrôle privé échoue (étape 8), il n'y a rien à défaire : le domaine n'a pas changé. À la toute
première publication d'une cible, aucun déploiement précédent n'existe : revenir en arrière consiste
alors à retirer le domaine du projet, geste du propriétaire dans le tableau de bord de l'hébergeur.

### 6.2 Le backend du moteur

Ces scripts ne touchent à aucun backend. La session du moteur remet un backend en arrière en
republiant le commit précédent d'ANTSIA (essai à blanc d'abord, jamais d'index supprimé sans
décision). L'ordre entre le site et le backend se fixe dans l'accord ; après chaque geste,
`release-check.mjs` dit si le site sert encore sa version sur le bon moteur.

## 7. Publier admin.diaspora.ga

```bash
node scripts/release.mjs --app admin_diaspora_ga --target demo --antsia <commit ANTSIA> --diaspora-ga <commit DIASPORA.GA>
```

Les onze étapes du § 4.2, dans le même ordre, avec les mêmes portes. Ce qui change :

- **le projet et le site** : ceux d'`ADMIN_DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID` et
  d'`ADMIN_DIASPORA_GA_<CIBLE>_SITE_URL` (§ 3.1) ; le moteur reste celui de la cible ;
- **l'étiquette** : `admin-diaspora-ga-<12>-antsia-<12>-<cible>`, tirée des mêmes deux commits ; une
  étiquette de diaspora.ga est refusée par le contrôle et le retour arrière d'admin.diaspora.ga, et
  l'inverse ;
- **la sonde** : `/api/sante-fonctionnelle` d'`apps/admin_diaspora_ga`, celle des applications du
  moteur (comme la console) : l'application `admin-diaspora-ga`, l'état « ok », la version attendue, le
  moteur configuré, et l'état du moteur `engine.state` à « reachable » (« slow » est un écart : moteur
  lent). Aucune source de données n'est exigée ; une source autre que « engine » est un écart ;
- **le contrôle public et le retour arrière proposés** portent `--app admin_diaspora_ga`.

À la **première** publication d'admin.diaspora.ga, l'étape 5 ne relève aucun déploiement servi : le
script le dit, et aucun retour arrière n'est possible (§ 6.1, dernier alinéa).

## 8. Publier les deux applications dans la même séance

### 8.1 Pourquoi, et la commande

Quand le moteur déménage des réglages du bureau des membres vers l'application d'administration (lot
A6 : modules, recours, équipes, règles), les réglages ne sont joignables de nulle part entre la
publication du moteur et celle des deux sites. La fiche de l'application d'administration (§ 8,
« Fenêtre de déménagement ») demande de publier dans la même séance. `--app all` le fait sous **un seul
accord** et **un seul contexte figé** :

```bash
node scripts/release.mjs --app all --target demo --antsia <commit ANTSIA> --diaspora-ga <commit DIASPORA.GA>
```

L'ordre est fixe : **le moteur d'abord**, publié par sa session depuis le même commit d'ANTSIA (ce
script ne touche à aucun backend) ; **puis admin.diaspora.ga**, qui rend les réglages joignables ;
**puis diaspora.ga**. Chaque application est publiée sans bascule et contrôlée par **sa propre sonde**
avant qu'une seule bascule parte : un écart sur l'une, et aucun domaine ne change, pas même celui de
l'autre. La seconde porte vient après les deux contrôles privés ; les deux bascules suivent, puis les
deux contrôles publics.

Les deux phrases nomment les deux étiquettes, dans l'ordre : « PUBLIER <cible> <étiquette
d'admin.diaspora.ga> <étiquette de diaspora.ga> », puis « BASCULER … » avec les mêmes. Le relevé
(`release.json`) tient alors une entrée par application (`apps.admin_diaspora_ga`, `apps.diaspora_ga`).

### 8.2 Les étapes

| # | Application | Étape | Ce qui arrête |
|---|---|---|---|
| 1 | — | Porte : accord écrit, puis « PUBLIER <cible> <deux étiquettes> » tapé | toute autre réponse, ou une entrée qui n'est pas un terminal |
| 2 | — | Relire `origin/main` des deux dépôts | échec de la lecture |
| 3 | — | Chaque commit est sur `origin/main` | une branche non fusionnée, un HEAD local |
| 4 | — | Contexte figé, un seul pour les deux applications | une archive impossible |
| 5 | admin.diaspora.ga | Relever son déploiement servi et sa version | rien (une première publication le dit) |
| 6 | admin.diaspora.ga | La publier sans bascule, dans son projet | aucune adresse de déploiement rendue |
| 7 | admin.diaspora.ga | Son déploiement est prêt | un état autre que `READY` |
| 8 | admin.diaspora.ga | Son contrôle privé, par sa sonde | le moindre écart : aucune bascule, aucun domaine ne change |
| 9 | diaspora.ga | Relever son déploiement servi et sa version | rien |
| 10 | diaspora.ga | Le publier sans bascule, dans son projet | aucune adresse de déploiement rendue |
| 11 | diaspora.ga | Son déploiement est prêt | un état autre que `READY` |
| 12 | diaspora.ga | Son contrôle privé, par sa sonde | le moindre écart : aucune bascule, pas même celle d'admin.diaspora.ga |
| 13 | — | Seconde porte : « BASCULER <cible> <deux étiquettes> » tapé, après lecture des deux contrôles | toute autre réponse : les deux déploiements restent publiés sans domaine |
| 14 | admin.diaspora.ga | Bascule de son domaine | échec de la bascule |
| 15 | diaspora.ga | Bascule de son domaine | échec : le script dit qu'admin.diaspora.ga a déjà basculé |
| 16 | admin.diaspora.ga | Son contrôle public | un écart (les deux contrôles publics se jouent, puis le script s'arrête) |
| 17 | diaspora.ga | Son contrôle public | un écart : le script **propose** le retour arrière des deux, sans le jouer |

### 8.3 Revenir en arrière sur les deux

Un retour arrière vaut pour une application à la fois (§ 6.1) : après un contrôle public en écart, le
script propose une commande `rollback.mjs` par application qui avait un déploiement servi, et dit
« aucun déploiement précédent relevé » pour une application publiée pour la première fois. Ramener les
deux sites sans ramener le moteur rouvre la fenêtre du § 8.1 : l'ordre (sites, puis moteur par sa
session, ou l'inverse) se fixe dans l'accord.

## 9. Ce qui reste au propriétaire

Ces scripts ne créent rien chez l'hébergeur et ne touchent à aucun réglage du moteur. Avant la première
publication d'admin.diaspora.ga, le propriétaire, ou l'opérateur qu'il désigne :

1. **crée le projet d'hébergement** d'admin.diaspora.ga pour chaque cible, réglé comme celui de
   diaspora.ga (§ 3), avec le dossier racine `DIASPORA_GA/apps/admin_diaspora_ga` ;
2. **rattache le domaine** `admin.diaspora.ga` au projet de production et **pose ses enregistrements
   DNS** chez le bureau d'enregistrement, puis attend le certificat ; il choisit l'origine de la
   démonstration et la rattache de même ;
3. **pose les variables de la machine** du § 3.1 dans le terminal de la séance de publication
   (`ADMIN_DIASPORA_GA_<CIBLE>_SITE_URL`, `ADMIN_DIASPORA_GA_<CIBLE>_VERCEL_PROJECT_ID`), à côté de
   celles de diaspora.ga ;
4. **fait publier le moteur** depuis un commit d'ANTSIA dont le catalogue porte l'entrée
   `admin_diaspora_ga` (le plan le vérifie, § 4.1), par la session du moteur, avant les sites ; pour la
   démonstration, l'origine choisie au point 2 s'ajoute aux origines de confiance du moteur de
   démonstration (`TRUSTED_ORIGINS`, variable du backend). **Non vérifié** : le moteur reconnaît
   l'application d'une session par l'adresse du catalogue (`site_url`) ; qu'une session d'administration
   soit admise sur une autre origine que celle-ci, en démonstration, reste à établir avec la session du
   moteur avant toute publication de démonstration ;
5. **tape les phrases** de chaque porte, après avoir donné son accord écrit (§ 1) ;
6. **nomme le premier administrateur du réseau** à la console du moteur, sur un compte déjà membre
   (fiche de l'application d'administration, § 7) : sans lui, le site publié ne laisse entrer personne.

## 10. Ce que ces scripts ne couvrent pas

- **Les images autoportantes** (`apps/diaspora_ga/Dockerfile`, `apps/admin_diaspora_ga/Dockerfile`) :
  le secours si la décision d'hébergement (A10) l'impose. Leur plan se lit avec
  `node scripts/deploy-app.mjs <clé du catalogue>` dans le moteur (plan seulement ;
  `bun run --cwd ../ANTSIA deploy:diaspora-ga` pour le site des membres). Aucune n'a été construite.
- **Le backend du moteur** : publié et remis en arrière par sa session (lot EX-01 du moteur, même
  forme).
- **La remise à zéro de la démonstration** : `../ANTSIA/docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md`, § 5.
- **La création du réseau en production** : `docs/36_MISE_EN_PRODUCTION.md`.

## 11. Correspondance avec la méthode tenue hors dépôt (22/10 au 3/11/2026)

| Méthode hors dépôt | Dans le dépôt |
|---|---|
| Préparation : `git archive` des deux commits dans un dossier neuf, `.vercelignore`, empreinte des sources | étape 4 (`freezeContext`, `release-lib.mjs`) ; même liste d'exclusions |
| Publication : `vercel deploy --prod --archive=tgz`, cinq variables publiques en construction et en exécution, les deux commits et l'empreinte en métadonnées | étape 6, avec `--skip-domain` : la bascule devient une étape séparée |
| État `READY` relu par `vercel inspect` | étape 7 |
| Contrôle privé par `vercel curl` avant la bascule | étape 8 |
| Bascule manuelle (`vercel promote`) | étapes 9 et 10, derrière une seconde phrase |
| Contrôles après coup : santé, politique de sécurité limitée au bon backend | étape 11 (`release-check.mjs`) |
| Retour arrière : promotion manuelle du déploiement précédent, noté à la main | `rollback.mjs`, cible relevée à l'étape 5 |
| Identifiants de projet, d'équipe et de backend écrits dans les scripts | variables de la machine, lues à l'exécution |
