# Renommage en DIASPORA.GA — 20 novembre 2026

Ce rapport dit l'état vérifié de DIASPORA.GA et du moteur après la PR 97 de DIASPORA.GA et la PR 189 d'ANTSIA : le renommage complet de DIASPORALE en DIASPORA.GA (chantier CH-800, décision du propriétaire du 20/11/2026), clés techniques comprises. La vérification a tourné sous le verrou commun des sessions, `main` gelés dans les deux dépôts. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `44cf017` (tête de la PR 189), DIASPORA.GA `dae9cc5` (tête de la PR 97) |
| Base | régénérés par le script de renommage depuis ANTSIA `e30e46e` et DIASPORA.GA `b63d688` (après la huitième tranche et le registre 96) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`0a88cd9`) est identique à l'arbre vérifié (`4b643b5`), celui de DIASPORA.GA `main` (`55b503c`) aussi (`977f2ca`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 09 h 46 à 09 h 56, après `bun install` (seul `bun.lock` change : 13 lignes, toutes du renommage) |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 795 passés |
| Cliquets du moteur | 169 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORA.GA | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORA.GA | 1 247 tests passés |
| Application DIASPORA.GA | 2 287 tests passés |
| Scripts de DIASPORA.GA (`test:scripts`) | 86 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

## Ce que le renommage change

- **Marque et domaine** : DIASPORA.GA, `diaspora.ga` ; l'application vit dans `apps/diaspora_ga`, le dossier du dépôt est `ECOSYSTEMES/DIASPORA_GA`.
- **Clés techniques** : clé de réseau et charte `diaspora-ga`, paquets `@diaspora-ga/domain` et `@diaspora-ga/features`, variables `DIASPORA_GA_*`, fonctions du moteur `joinDiasporaGa` et `leaveDiasporaGa`, comptes de démonstration `demo.diaspora-ga.test`.
- **Inchangé** : la tranche `diaspora` du moteur, les contrats `DIASPORA-*-V1`, les thèmes du compte `sable` et `gaboma`.
- **Documents datés** : figés sous l'ancien nom ; correspondance dans `docs/RENOMMAGE_DIASPORA_GA_2026-11-20.md` ; ADR-0040 du moteur.

## Deux défauts trouvés par la vérification

Les deux ont été corrigés dans le script de renommage lui-même, puis chaque fichier de code renommé a été recalculé depuis son original : aucun autre écart.

1. **Cliquet des identifiants d'hébergement (moteur)** : la liste des projets surveillés perdait l'ancien nom, alors que le projet de l'hébergeur le porte encore et que les registres datés le citent ; l'essai sur le dépôt d'avant le nettoyage comptait 50 identifiants au lieu de 51. Le cliquet surveille désormais les deux noms ; le mot `workspace` rejoint les vrais mots du code (`diaspora-ga-workspace`).
2. **Marque dans les expressions régulières des essais (application)** : la barre qui ferme une expression régulière était prise pour un séparateur de dossier ; neuf lignes de trois fichiers d'essais attendaient `DIASPORA_GA` au lieu de la marque, d'où dix échecs. Elles attendent désormais `DIASPORA\.GA`.

## Recette au navigateur

Application lancée en local (`next dev`, source de démonstration, données fictives) :

- accueil, titre et manifeste : « DIASPORA.GA » ;
- charte posée sur la page : `data-charte="diaspora-ga"`, jetons de couleur appliqués ;
- aucune occurrence de l'ancien nom dans la page servie ;
- entrée par un compte de démonstration jusqu'au fil France (« Fil · DIASPORA.GA ») ;
- aucune erreur de console de l'application.

## Ce qui reste au propriétaire

- **Publication de la démonstration** : remise à zéro du backend de démonstration puis graines (suppression de données), variables de la machine qui publie sous leurs nouveaux noms, `networkSlug` de `NOTIFICATION_APPLICATIONS_JSON` ; tant qu'elle n'est pas faite, la démonstration en ligne sert l'ancienne version.
- **Textes légaux et de consentement** : la marque y change, aucune version n'est montée ; à confirmer avec le juriste.
