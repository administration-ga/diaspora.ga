# Annuaire parcourable et catégories de services — 23 novembre 2026

Ce rapport dit l'état vérifié de DIASPORA.GA et du moteur pour les lots P3 et P4 du chantier CH-816 (ordre du propriétaire du 23/11/2026 : « Oui, lance P3 et P4 »). La vérification a tourné sous le verrou commun des sessions, dans le poste s2. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `873b08e` (branche `chantier/ch-816-p3-annuaire`), DIASPORA.GA `2b63afa` (branche `chantier/ch-816-p3-p4`) |
| Base | ANTSIA `c900635`, DIASPORA.GA `237b585` (`main` des deux dépôts) |
| Commande | vérification complète depuis le moteur (`bun run verify`, `codegen` compris), le 23/11 de 8 h 39 à 8 h 50, sur les commits, puis `bun run test:scripts` de DIASPORA.GA ; aucune dépendance ajoutée |
| Résultat | **vert** (code de sortie 0) |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 251 fichiers, 3 815 tests passés (250 et 3 804 au couple précédent) |
| Cliquets du moteur | 30 fichiers, 173 tests passés |
| Domaine de DIASPORA.GA | 803 tests passés, couverture complète |
| Surfaces de DIASPORA.GA | 69 fichiers, 1 267 tests passés |
| Application DIASPORA.GA | 169 fichiers, 2 452 tests passés |
| Scripts de DIASPORA.GA (`test:scripts`) | 86 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur ; aucun avertissement de plus qu'avant |

## Ce que les lots changent

**P3 — annuaire parcourable.**
- `/membres` permet de parcourir les membres d'un pays ouvert, d'une ville, et seulement les vérifiés, vingt par page ; la recherche par nom reste en tête.
- Seuls apparaissent les membres qui ont choisi d'être dans l'annuaire et que leur niveau rend visibles au lecteur ; un profil privé ou un blocage les retire ; un compte en attente n'y a pas accès.
- Pays et ville sont jugés sur la facette telle que le lecteur la voit : un pays ou une ville masqués ne se devinent pas. La même règle ferme une fuite existante du filtre de pays de la recherche par nom.
- « Vérifié » est calculé à la lecture, jamais stocké.
- Moteur : fonction `browseMembers` ; deux champs facultatifs (`country`, `cityKey`) et deux index sur `peopleDirectory`, écrits par la tranche seule ; rattrapage `migrations:backfillDirectoryPlaces`, idempotent, à lancer à la publication.

**P4 — catégories de services.** Onze catégories au lieu de cinq : ingénierie et conseil technique, restauration et traiteur, couture et mode, bâtiment et rénovation, événementiel, informatique et dépannage, ajoutées après les cinq du pilote. Proposition à valider par le propriétaire. Le schéma du moteur s'élargit sans migration.

## Recette au navigateur

Jouée le 23/11/2026 sur le poste s2, en démonstration, compte fictif vérifié en France.

| Constat | Largeur, apparence |
|---|---|
| `/membres` : recherche en tête, puis « Parcourir l'annuaire des membres » (pays, ville, « Vérifiés seulement ») et la liste du pays | 1 440 px, clair |
| « Vérifiés seulement » : seuls les membres vérifiés restent ; le filtre s'écrit dans l'adresse | 1 440 px, clair |
| Ville « bordeaux » : un seul membre, titre « Membres : Bordeaux, France » ; aucun défilement horizontal | 390 px, sombre |
| Console du navigateur : aucune erreur | toutes |

## Ce qui n'est pas vérifié

- Le mode moteur au navigateur ; un appareil réel ; la largeur de 834 px.
- Les nouvelles catégories à l'écran : le module des services est fermé ; le filtre à onze choix est couvert par les tests.
- La migration de rattrapage sur des données réelles.

## Ce qui reste à décider avant la publication

- **Textes du consentement à l'annuaire**, à faire relire par le juriste : `consent.directory.body` et `settings.directoryLead` disent maintenant qu'on peut être trouvé en parcourant les membres de son pays ou de sa ville. La version du texte de consentement (`CONSENT_TEXT_VERSIONS.directory`, commune avec ANTSIA) n'a pas été montée : à trancher avec le juriste.
- **Liste des catégories**, à valider ; une catégorie se retire sans migration tant qu'aucune offre publiée ne l'utilise.
- **Ordre de publication** : fusion du moteur sur accord écrit, puis de l'application ; publication du moteur, rattrapage, puis du site.
