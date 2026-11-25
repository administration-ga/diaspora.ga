# Accueil en un écran, pré-rempli par IDN — lots A et M1 (25/11/2026)

Décision du 25/11/2026, validée par le propriétaire (« Oui, lance-les ») avec les recommandations de l'architecte :
bouton « Créer mon profil et entrer », pré-remplissage de 24 h, nom civil complet comme nom affiché par défaut. La
note de décision fait foi ; elle est dans la documentation du projet (`Accueil_un_ecran_2026-11-25/`).

- **Application, lot A** : branche `chantier/accueil-un-ecran`, tête `ae58a26`.
- **Moteur, lot M1** : branche `chantier/accueil-idn-m1` d'`administration-ga/antsia`, tête `dd104714`. Sa fusion
  attend l'accord écrit du propriétaire.
- **Rien n'est publié.** Le nouveau parcours ne part pas en ligne avant la validation des textes légaux v1.1 (la
  proposition est dans le même dossier de documentation).

## Ce que les deux lots livrent

**`/bienvenue` en un écran** (lots A1, A2) :

- identité (nom affiché et @identifiant) et résidence en lignes de rappel « Modifier » quand IDN les fournit, en
  champs sinon ;
- une phrase qui dit ce que les membres verront, puis un bouton « Créer mon profil et entrer ».

Le clic est le consentement au profil social : `social_profile` accordé, origine `onboarding`, version
`2026-10-14` inchangée. L'annuaire reste masqué et les notifications coupées ; l'année d'arrivée reste aux
réglages. Rien n'est écrit avant le clic.

**Propositions d'identifiant d'IDN seulement** quand il en donne (consigne du propriétaire). Sans IDN (entrée par
code), ce sont celles tirées du nom affiché.

**Invite de première visite** (lot A3), dans la coque hors des vues :

- l'annuaire et les notifications de l'appareil, chacun par son geste (origine `prompt`) ;
- les liens vers les rubriques des réglages ;
- une fermeture valable pour de bon sur l'appareil.

**Pré-remplissage facultatif** (lot A4) : l'application lit `modules/people/idnPrefill:myEntryPrefill` par son
nom. Sans la fonction (moteur `f152b07e`), elle retombe sur la saisie, sans erreur.

**Moteur, lot M1** (ADR-0044 du moteur, proposé) :

- `idnHandleLadder` donne six propositions au plus : le prénom présent dans l'identifiant IDN, puis l'identifiant
  IDN, puis les autres prénoms, puis l'échelle existante ;
- `idnEntryPrefill` ne lit jamais le NIP, la date ou le lieu de naissance, le genre ni la photo ;
- la table `idnPrefills` est écrite par le seul rappel IDN, gardée 24 h, effacée à la publication du profil, et
  purgée chaque jour ;
- la requête `myEntryPrefill` compose le nom avec le normaliseur partagé.

## Vérification complète

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 25/11 de 22 h 55 à 23 h 12, poste s11, sur le moteur
`dd104714` (lot M1) avec DIASPORA.GA `ae58a26` (lot A). Résultat **vert**, code 0 :

- moteur : 4 200 tests sur 271 fichiers ;
- typecheck : 13 paquets ;
- tests : 13 paquets, dont 2 804 pour l'application et 1 386 pour le paquet de surfaces ;
- lint : 12 paquets ;
- aucun écart dans les fichiers suivis.

Preuves rouge puis vert :

- **Propositions** : le test « propositions d'IDN : seules elles sont offertes » échoue avec l'ancienne union
  (identifiants d'IDN et tirés du nom) et passe avec la nouvelle règle.
- **Invite** : la fixture refusait un prénom accentué dans l'identifiant ; elle est corrigée.
- **Lot M1** : les preuves sont dans le rapport de sa branche (ADR-0044).

## Recette au navigateur

Serveur de développement du poste s11, fournisseur de démonstration (données fictives, ce navigateur seulement),
remis à zéro ; identité IDN simulée d'Awa OGOOUÉ ; 1280×800.

1. **`/bienvenue`** : un seul écran, sans étape, et la phrase de consentement. On y voit :
   - la ligne « OGOOUÉ Awa · @awa · Proposé d'après votre identité IDN — Modifier » ;
   - le pays et la ville en champs (la démonstration ne connaît pas la résidence) ;
   - le bouton « Créer mon profil et entrer ».
2. **France choisie, puis un clic** : profil créé (`awa`, « OGOOUÉ Awa »), arrivée sur le hub France. Le journal des
   consentements porte :
   - `social_profile` accordé, origine `onboarding` ;
   - `directory` et `notifications` refusés ;
   - un annuaire `hidden`.
3. **L'invite « À vous de choisir, maintenant ou plus tard »** s'affiche en tête du hub. « Visible des membres de mon
   pays » donne :
   - un consentement `directory` accordé, origine `prompt` ;
   - une visibilité `country` ;
   - le message « Votre visibilité dans l'annuaire est enregistrée. ».

   L'invite disparaît ensuite : il ne lui reste rien à proposer, car ce navigateur n'offre pas de notifications de
   l'appareil.
4. **`/parametres#annuaire`** : le document ne défile pas, la sous-vue « Fil et annuaire » s'ouvre, et l'invite
   n'apparaît pas dans une vue.
5. Console sans erreur.

## Limites

- Le parcours avec le vrai moteur et IDN réel n'est pas rejoué au navigateur : M1 n'est pas fusionné ni publié.
- La résidence venant d'IDN (lots I et M2) n'existe pas encore : le pays reste un champ.
- Lecteur d'écran et téléphone réel non essayés.
- Le geste unique (entrer et consentir au profil) est soumis à la relecture juridique de la proposition v1.1.
