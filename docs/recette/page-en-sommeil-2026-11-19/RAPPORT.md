# Page en sommeil et page sans responsable — 19 novembre 2026

Ce rapport dit l'état vérifié de DIASPORALE et du moteur après la PR 91 de DIASPORALE et la PR 185 d'ANTSIA, septième tranche du modèle du réseau social d'espace.administration.ga (AS-11a du plan 07). La vérification a tourné sous le verrou commun des sessions. Ce rapport ne contient aucun identifiant de déploiement.

## Le couple vérifié

| Sujet | Constat |
|---|---|
| Couple de versions | ANTSIA `0785f6a` (tête de la PR 185), DIASPORALE `70edfb3` (tête de la PR 91) |
| Arbres | après les fusions, l'arbre d'ANTSIA `main` (`aaa2162`) est identique à l'arbre vérifié (`0c4cb33`), celui de DIASPORALE `main` (`b3ce7a9`) aussi (`103246f`) |
| Commande | vérification complète depuis le moteur (`bun run verify`), dans le poste s2, de 23 h 05 à 23 h 22, sans attente dans la file |
| Résultat | **vert** |

| Contrôle | Résultat |
|---|---|
| Tests du moteur | 3 789 passés |
| Cliquets du moteur | 169 passés |
| Tests des scripts du moteur | 171 passés |
| Domaine de DIASPORALE | 793 tests passés, couverture à 100 % |
| Surfaces de DIASPORALE | 1 237 tests passés |
| Application DIASPORALE | 2 275 tests passés |
| Typage (12 paquets) et lint (11) | aucune erreur |

Le nouveau module `pages/sleep` du moteur est entré dans le code généré par `codegen` (commit `bb8ae1c` de la PR 185), jamais à la main.

## La décision

Instruite par l'agent architecte (ADR du vault, `10-PROJETS/diasporale/decisions/2026-11-19-page-en-sommeil-trente-jours-sans-nouvel-etat.md`), suivant la recommandation de la décision 8 du plan 07. Le sommeil est l'état `inactive`, que tous les lecteurs du moteur respectent déjà, plus une échéance `pages.sleepEndsAt` à trente jours. Rien n'est écrit sur les objets de la page, rien n'est effacé ; l'échéance se constate à la lecture, sans tâche planifiée. Le retrait définitif, avec l'effacement des adhésions, est le lot AS-11b, différé après la validation juridique du délai et de l'effacement.

## Ce que contiennent les PR

- **Moteur (PR 185)** :
  - `putPageToSleep`, `wakePage` et `mySleepingPages` (module `pages/sleep`, seau `page.manage`, journal `page.sleep` et `page.wake`) ; seul un administrateur endort une page de nature créable par un membre ; tout administrateur la réveille tant que l'échéance court et qu'aucune mesure du juge ne la tient (lecteur `sleepingPageTeamRole`, gardé par le cliquet des lecteurs d'autorité) ;
  - règles `PAGE_SLEEP_EXPIRED` (réveil après l'échéance) et `PAGE_ASLEEP` (validation d'une revendication pendant le sommeil ; le refus reste possible) ; équipe figée pendant le sommeil ; reprise par l'opérateur journalisée ;
  - `pageStanding.orphan` : page native, hors institution, sans administrateur vivant, sans rien révéler de l'équipe ;
  - garde de non-régression : pendant le sommeil, offre absente et non contactable, candidature, inscription, adhésion, entrée au groupe, abonnement, commentaire, réaction, entraide, kit et conversation fermés ; tout revient au réveil, adhésions intactes.
- **Application (PR 91)** : « Mettre la page en sommeil » dans l'onglet identité, avec une confirmation qui dit les effets réels (les délais courent : une demande peut expirer et son auteur est prévenu, une offre d'emploi peut se clore, un direct s'arrête) et l'échéance ; état « Cette page est en sommeil » dans la gestion ; section « En sommeil » de « Mes pages » avec « Réactiver », masqué dès l'échéance, puis un lien de contact ; bandeau « Cette page n'a plus de responsable » avec « Revendiquer » ou le contact ; code `moderation_desk_page_asleep` au bureau ; démonstration à la même matrice.

La relecture par un agent n'a relevé aucun bloquant ; ses huit points (textes qui promettaient un gel, équipe nommée à tort, conflit trompeur au bureau, bouton à l'échéance, test d'échéance, garde incomplète, compteur du hub de démonstration, durée en dur) ont été corrigés avant la vérification.

## Recette au navigateur (démonstration, poste s2)

| Parcours | Largeur et thème | Constat |
|---|---|---|
| L'administrateur, onglet identité | 1 440 px, clair | « Mettre la page en sommeil » ; la confirmation liste les effets et l'échéance (19 décembre 2026) ; après confirmation, la gestion dit « Cette page est en sommeil » avec « Réactiver » |
| Une autre membre | 1 440 px | la fiche répond par le refus indistinct ; les deux offres de la page ont quitté « Services » |
| Page communautaire sans responsable | 375 px, sombre | bandeau « Cette page n'a plus de responsable » avec « Revendiquer cette page » ; aucun défilement horizontal |
| L'administrateur, « Mes pages » | 375 px, sombre | « En sommeil jusqu'au 19 décembre 2026 » ; « Réactiver la page … » la rend visible ; ses offres reviennent dans « Services » |
| Console | — | aucune erreur de l'application (seulement la connexion du rechargement à chaud) |

Point mineur relevé, à reprendre : quand la seule page d'une personne est en sommeil, « Mes pages » affiche encore « Vous ne gérez encore aucune page » au-dessus de la section « En sommeil ».

Non joués : le mode moteur ; l'échéance réelle de trente jours (prouvée par les tests à l'horloge simulée) ; l'appareil réel ; le mobile.
