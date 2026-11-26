# Ouverture du direct et annonces du fil (lot A5) (26/11/2026)

Application : branche `chantier/direct-ouverture` d'`administration-ga/diaspora.ga`, partie de `main` (`520b3b4`).
Moteur : `main` d'`administration-ga/antsia` (`547b80bc`), sans modification. Le serveur vidéo du moteur de
démonstration tourne depuis le 26/11 sur le serveur OVH de NTSAGUI (dossier
`OKA_TECH/INFRASTRUCTURE/Montage_serveur/Stacks/rtc_antsia_demo` de l'atelier).

## Ce que le lot livre

- **Le direct ouvert par le code.** `MEMBERS_APP_CODE_SWITCH_STATES.live = "open"`
  (`packages/diaspora-ga-features/src/navigation/code-switches.ts`). Les appels et iCom Pro restent fermés.
  Avec le moteur comme source :
  - la page `/direct/<session>` monte l'écran du direct du moteur ;
  - « Créer » offre « Une conférence », au bureau comme au téléphone, à qui publie avec iCom ouvert ;
  - l'îlot des surfaces du moteur déclare `liveAvailable` vrai (hôte du direct, directs en tête du lecteur des
    actus, conférence lancée depuis un appel) ;
  - admin.diaspora.ga montre le direct « Ouvert par le code » ; la section s'intitule désormais « Réglés dans le
    code ».
  La démonstration de ce navigateur ne sert toujours pas le direct (page introuvable).
- **Lot A5 : le direct et l'évènement annoncés dans la carte de publication.** Le fil du moteur rendait déjà
  l'annonce (`live` et `event` de `myFeed`) ; `toPostView` les perdait. Ils passent désormais dans la vue
  (`PostView.live`, `PostView.event`, facultatifs), et la carte de DIASPORA.GA les montre après les médias :
  - **direct** : titre et statut (« En direct », avec un point qui ne pulse que si le mouvement est permis ;
    « Programmé » ; « Terminé »). C'est un lien de 44 px au moins vers la page du direct quand cette page est
    servie (direct ouvert ET moteur branché) ; sinon, du texte simple ;
  - **évènement** : titre, plage dans la langue et le fuseau du lecteur (fuseau dit à la fin), « Annulé » le cas
    échéant, et ma réponse si j'en ai une. Aucun lien : un évènement annoncé au fil est personnel, et DIASPORA.GA
    n'a de page que pour un évènement d'association. La carte ne propose aucune réponse.
  - Rendu de référence : la carte de publication du moteur, adaptée aux composants, jetons et textes de
    DIASPORA.GA, sans import de la surface du moteur. Le fournisseur de démonstration ne sert ni direct ni
    évènement annoncé : ses données sont inchangées.
- **Documentation** : `docs/36_MISE_EN_PRODUCTION.md`, § 6.3 (serveur vidéo sur le serveur OVH, origine passée
  à la construction par `Stacks/diaspora_ga/build.sh.modele`, interrupteur ouvert, recette à faire).

## Configuration du moteur pour le réseau

Lu dans le moteur `547b80bc`, sans rien y changer : la création d'une conférence (`live/sessions.create`) ne
dépend d'aucun module du réseau (aucune option `feature`, contrairement aux évènements, `groupsAndEvents`). Ce qui
la borne : une adhésion au moins « déclarée », l'absence de sanction, le débit `live.create`, la relecture du
réseau sur la surface `live` (sans réglage, aucune relecture préalable), puis, pour entrer dans la salle, les
trois variables du serveur vidéo sur le backend.

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 26/11 de 7 h 45 à 7 h 58 (poste s12). Couple vérifié :
moteur `547b80bc` (le `main` du moteur, sans modification) et DIASPORA.GA `7e06426`. Résultat **vert** :

- code généré et typage strict du backend ;
- moteur : 4 244 tests sur 274 fichiers ; cliquets : 203 tests sur 34 fichiers ; scripts : 181 tests ;
- typage : 13 paquets ;
- tests : 13 paquets, dont 2 767 pour l'application, 1 462 pour les surfaces de DIASPORA.GA, 281 pour
  admin.diaspora.ga et 834 pour le domaine ;
- lint : 12 paquets, aucune erreur ;
- aucun écart dans les fichiers suivis.

Tests ajoutés ou réécrits par le lot :
- la projection : `toPostView` porte `live` et `event`, les omet quand ils sont absents ou nuls ;
- le bloc du direct : chaque statut en français et en anglais, le point qui ne pulse qu'en mouvement permis, la
  cible du lien, le texte simple quand le direct est refermé ou que la page n'est pas servie ;
- le bloc de l'évènement : la plage, l'annulation, chaque réponse ;
- la carte avec et sans annonce ;
- la position ouverte de l'interrupteur et ses conséquences (page, « Créer », `liveAvailable`, administration),
  chacune avec son cas « refermé ».

## Limites

- **La recette à deux comptes reste à faire** (§ 6.3, étape 4), sur la démonstration, avant toute annonce :
  préparer, lancer, voir et entendre, discuter, sortir et revenir, exclure et réintégrer, fermer la discussion,
  terminer.
- **Aucun enregistrement ni rediffusion** : aucun service Egress n'est déployé à côté du serveur vidéo de
  démonstration. Une rediffusion demandée ne peut pas être produite.
- Le bloc du direct et celui de l'évènement ne se voient qu'avec le moteur : la démonstration de ce navigateur
  n'en sert pas. Ils sont prouvés par les tests des composants et de la projection.
- Le reste du document de mise en production (§ 6.2, § 6.4, § 9) décrit encore l'ancienne chaîne de
  publication ; seul le § 6.3 est mis à jour par ce lot.
