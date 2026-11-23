# Comptes de démonstration par acteur — 19 octobre 2026, porte du 23 novembre 2026

Demande du propriétaire : « le bouton des comptes démo des différents acteurs et users de
DIASPORA.GA ». Le contrat (17 acteurs) a été posé par la session du plan global ; le
propriétaire a confié la suite à la session de la porte d'entrée. Modèle : les comptes de
démonstration de la racine d'ANTSIA (`convex/modules/platform/demoAccounts.ts`,
`DemoAccountsPanel`, `DemoAccountBootstrap`).

Complément du 19/10 au soir : trois acteurs de plus, pour les comptes de recette du plan global
(docs/14, § 6.1) que les 17 premiers ne couvraient pas. Ce sont le membre bloqué, le suspendu à
la racine et l'utilisateur extérieur au réseau. Avec le membre fondateur (EA-01), le catalogue
déclare **21 acteurs**.

Complément du 23/11 (CH-817, fiche
`DOCUMENTATION/DIASPORA_GA/Parite_espace_2026-11-23/Fiche_porte_compte_demo_DIASPORA_GA_2026-11-23.md`,
lots A0, E1 à E4 du moteur, A1) : demande du propriétaire, « tout en bas de manière subtile un petit
bouton pilule "compte démo" », un code de 6 chiffres et 1 lettre, reçu par WhatsApp sur un numéro
autorisé. Les comptes ne proposent plus que les fonctions ouvertes, avec des publications d'exemple.

## Ce que voit la personne qui teste

- Tout en bas de la porte (`/`, `/entrer` et leurs étapes), sous le pied de page : une petite
  pastille « Compte démo », aux couleurs du repère de démonstration. La carte d'accès ne porte plus
  aucun bouton de démonstration.
- Ce que la pastille ouvre dépend de l'état de la porte du moteur
  (`platform/authentication.configuration`, champ `demoGate`) :

| État | Où | Ce que fait la pastille |
|---|---|---|
| `closed` | production, ou comptes de démonstration fermés | rien ne s'affiche |
| `open` | porte non armée (développement local, par exemple) | la feuille des acteurs, directement, comme l'ancien bouton ; rien si le catalogue est vide |
| `unavailable` | porte armée mais incomplète (secret trop court, envoi WhatsApp non configuré) | la feuille dit « indisponible pour le moment », sans formulaire |
| `gated` | démonstration en ligne, porte armée | numéro WhatsApp, puis code, puis la feuille des acteurs ; sans `NEXT_PUBLIC_CONVEX_SITE_URL`, rien ne s'affiche (jamais un geste mort) |

- Porte armée, la feuille se suit en trois temps :
  1. **le numéro WhatsApp**, avec son indicatif (E.164), normalisé par le contrat du moteur
     (`normalizeDemoGatePhone`) ;
  2. **le code** : l'écran ne dit jamais « envoyé », il dit « Si ce numéro est autorisé, le code
     arrive sur WhatsApp ; sans message après une minute, l'envoi n'a pas abouti. » Le champ accepte
     6 chiffres puis une lettre, en majuscules, groupés (`482 913 K`) ; l'échéance du code se
     décompte ; « Renvoyer un code » attend une minute après chaque demande, et trois demandes au
     plus par quart d'heure (reflet du seau du moteur par numéro) ; « Changer de numéro » revient au
     premier temps. Un code faux ou expiré a un seul message ; trop d'essais dit l'attente du moteur
     (`retryAfterMs`) ; une panne du réseau se reprend ;
  3. **les acteurs** : la feuille d'avant, groupée en Membres, Pages, Rôles et services, Accès
     restreints (les groupes vides ne s'affichent pas), l'heure de fin de l'accès, et « Fermer
     l'accès ».
- Chaque acteur montre son nom fictif « Prénom NOM », ce qu'il illustre, son pays et le statut
  qu'il obtiendra. L'utilisateur extérieur au réseau n'a pas de statut : il porte « Hors réseau ».
- Un appui suffit. La connexion passe par le VRAI code à usage unique (6 chiffres), lu pour la
  personne : le code de la porte n'est pas celui de la connexion. Puis l'accueil, l'équipement et les
  gestes des modules ouverts se font tout seuls, avec un avis du début à la fin. On arrive sur le
  fil ; l'utilisateur extérieur, lui, arrive à l'accueil de DIASPORA.GA.
- En démonstration (données fictives de ce navigateur), la même pastille mène à `/demo`, sans porte.
- Échap referme la feuille et rend le focus à la pastille ; le défi en cours survit à la feuille
  refermée.

## La porte (moteur, lots E1 à E4 ; site, lot A1)

- **Le verrou réel est la lecture du code**, `devTools.latestOtp` : les adresses réservées ne
  reçoivent aucun courriel, qui ne lit pas leur code n'entre pas. Porte armée, `latestOtp` (pour la
  famille `…@demo.diaspora-ga.test` seulement) et `demoAccounts.catalogue` exigent un jeton de
  session de porte (`gateToken`). Le site le passe aux deux lectures, pour les seules adresses
  réservées ; le formulaire de code ordinaire de la porte le passe aussi, une adresse ordinaire ne le
  reçoit jamais.
- **Les deux routes HTTP** du moteur (`POST /demo-gate/request` et `POST /demo-gate/verify`), sur
  l'origine des actions HTTP, sont appelées DIRECTEMENT par le navigateur
  (`apps/diaspora_ga/src/data/engine-demo-gate.ts`) : le relais d'authentification du site retire
  l'adresse du visiteur, dont la porte a besoin pour ses seaux. Corps JSON, sans témoin, sans cache,
  sans redirection. La demande répond pareil pour un numéro autorisé, refusé ou limité.
- **La session de porte** dure trente minutes, non renouvelable. Son jeton ne vit que dans le
  `sessionStorage` de l'onglet (clé `diaspora-ga:demo-gate`), ou dans la mémoire de la page quand ce
  stockage est refusé ; jamais dans une adresse, un journal, un témoin ni le `localStorage`. Le site
  l'oublie lui-même à l'échéance (une requête du moteur fige son horloge). Elle survit à la sortie
  d'un acteur, pour en essayer un autre sans nouveau code, et disparaît avec l'onglet.
- **La liste des numéros** est une table d'empreintes du moteur, alimentée par la fonction interne
  `allowPhones` que le propriétaire lance ; aucun numéro dans un dépôt.
- La porte s'arme par la seule présence de `ANTSIA_DEMO_GATE_SECRET` sur le déploiement de
  démonstration ; les variables (noms seuls) sont au `docs/36`, § 6.4.

## Le catalogue par règle (`packages/diaspora-ga-domain/src/demo-accounts.ts`)

La liste déclarée reste à 21 ; le moteur ne PROPOSE un acteur (`diasporaGaDemoActorsOffered`) que
si les modules qu'il illustre (`requires`) et son pays sont ouverts. Les acteurs de recette
(`audience: "recette"` : le média, le collectif, et les quatre accès restreints) ne sont proposés
qu'en développement local. Aucun pays ne s'ouvre plus d'office : l'ouverture est une décision de
l'administration du réseau.

Au lancement (le socle, les pages, la France) : 11 acteurs sur 21 — `nouveau`, `leger`, `declare`,
`parraine`, `verifie`, `fondateur`, `association`, `entreprise`, `institution`, `moderateur`,
`administrateur`. Le mentor reparaît seul quand `mentoring` s'ouvre, le talent avec `jobs`.

L'amorçage (`apps/diaspora_ga/src/components/demo-account-bootstrap.tsx`) ne joue que les gestes
dont le module est ouvert (`DIASPORA_GA_DEMO_GESTURE_FEATURES`) : mentor avec `mentoring`, talent et
offre d'emploi avec `jobs`, offre de service avec `services`, mission avec `mutualAid`, évènements de
l'association avec `groupsAndEvents`. Modules fermés, l'association et l'entreprise sont prêtes sans
« préparation non aboutie ». Les modules ouverts ne se lisent qu'avec une adhésion : la préparation
se fait en deux temps (accueil et équipement, puis gestes quand le nouveau membre a relu ses
modules), et une source remontée entre-temps ne la relance pas.

## Les publications d'exemple (`packages/diaspora-ga-domain/src/demo-content.ts`, lot E4 du moteur)

Le moteur les écrit à l'équipement de chaque acteur (`demoContent.animateActor`, planifiée par
`equipMyDemoAccount`), sans graine manuelle : deux ou trois publications personnelles par acteur qui
publie (statut effectif déclaré ou vérifié : `leger` et `nouveau` ne publient rien), deux au nom de
la page pour les acteurs de page si les pages sont ouvertes, quelques réactions et un commentaire
entre acteurs dès que les deux comptes existent, jamais entre deux comptes bloqués. Texte seul,
marqué « Démo — », visibilité `network`, jamais à la racine ; une publication retirée n'est jamais
recréée.

## Les acteurs (`packages/diaspora-ga-domain/src/demo-accounts.ts`)

Adresses réservées `<acteur>@demo.diaspora-ga.test`. Le domaine `.test` n'est jamais routable.

| Groupe | Acteurs | Ce qui est posé |
|---|---|---|
| Membres | nouveau, leger, declare, parraine, verifie, fondateur, belgique, canada | Statut dérivé des faits fictifs : rien (en attente), IDN niveau 1 ou 2, parrainage par « verifie », attestation consulaire, admission fondatrice tracée ; Belgique et Canada proposés seulement si leur pays est ouvert. |
| Pages | association, entreprise, media, communaute, institution | Une page par nature dans le pays de l'acteur, l'acteur administrateur. Confiance communauté, vérifiée ou officielle (institution seulement). Type d'association ou secteur. |
| Rôles et services | mentor, talent, moderateur, administrateur | Profil de mentor, profil de talent ; rôle de modération et équipe de démonstration ; administration du réseau. |
| Accès restreints | suspendu, suspendu-racine, bloque, exterieur | Suspension dans DIASPORA.GA seulement ; suspension à la racine, qui vaut partout ; blocage par « verifie » ; compte ANTSIA sans adhésion DIASPORA.GA. |

Gestes réels, joués par l'application à la première entrée, si leur module est ouvert :
- profil de mentor (mentor) et profil de talent (talent) ;
- offre de service et offre d'emploi de la page d'entreprise (entreprise) ;
- mission bénévole de l'association (association) ;
- deux événements fictifs de l'association (association, geste `associationEvent`, EV-01 du
  plan 08, ajouté le 10/11/2026) : une soirée d'accueil ouverte à tout DIASPORA.GA, deux places,
  dans sept jours ; une assemblée générale réservée aux adhérents, dans quatorze jours. Fuseau de
  Paris, heure ronde. Créés par la capacité du port (`associationEvents.create`), chacun sous une
  clé d'idempotence stable (`diaspora-ga-demo:association-event:accueil`, `…:assemblee`). Aucune
  politique de modération n'est posée : ils restent « en attente de modération », visibles de
  l'équipe de la page seule, jusqu'à l'approbation par la modératrice (compte `moderateur`) au
  bureau, par le chemin réel.

## Fonctionnement

1. **Catalogue** : `api.modules.diaspora.demoAccounts.catalogue`, une `@publicProjection`.
   Elle est vide hors des comptes de démonstration ouverts (`demoAccountsAllowed` : outils de
   développement locaux, ou déploiement de démonstration déclaré), et, porte armée, sans session de
   porte valide (`gateToken`). Elle applique la règle d'offre du domaine.
2. **Connexion** : `requestCode` puis `verifyCode` du port. Le code se lit par
   `devTools.latestOtp` (avec le jeton de porte pour une adresse réservée), avec jusqu'à 8 lectures
   espacées de 250 ms. L'acteur choisi est mémorisé sous la clé `antsia:diaspora-ga:demo-account`,
   que la déconnexion de partout purge.
3. **Accueil réel** : `actions.join`, qui pose le profil publié, les consentements (profil,
   annuaire) et l'adhésion, avec le pays et la ville de l'acteur. L'utilisateur extérieur au
   réseau ne rejoue que l'accueil d'ANTSIA, `demoAccounts.welcomeOutsider` : le consentement au
   profil social, puis le profil publié, par les mutations de l'écran d'accueil. Jamais `join`.
4. **Équipement** : `equipMyDemoAccount`, un `@selfScoped` exécuté seulement si l'adresse
   vérifiée de la session est celle de l'acteur.
   - Les faits fictifs :
     - le compte et la preuve IDN `diaspora-ga-demo-idn-<acteur>`, de nationalité GA ;
     - le lien d'attestation consulaire, et la demande « vérifiée » que lisent les réglages ;
     - le parrainage par « verifie », antidaté de 31 jours. Parrain et filleuls ne sont retenus
       que sur leur adresse réservée vérifiée, jamais sur le seul identifiant public.
   - Puis la VRAIE dérivation (`applyDerivedStatus`).
   - Ensuite le rôle, l'équipe et la page ; aucun pays ne s'ouvre d'office (CH-817) : un acteur
     d'un pays fermé n'est ni proposé ni équipé (refus indistinct d'un acteur non proposé).
   - Le blocage de « bloque » par « verifie », par le vrai mécanisme du moteur :
     `graph/connections.blockPair`, le corps de `blockPerson`, extrait sans changement. Il garde
     les conditions de `blockPerson` : le bloqueur membre actif du réseau, la cible vivante. Il
     se pose dès que les deux comptes existent, quel que soit l'ordre d'équipement, et les deux
     comptes sont retenus sur leur adresse réservée vérifiée.
   - Les sanctions en dernier, car elles ne sont jamais dérivées :
     - la suspension de « suspendu », dans DIASPORA.GA seulement ;
     - celle de « suspendu-racine » à la racine, par le chemin de la console :
       `people/memberships.suspendRootMembership`, le cœur de `suspendEverywhere`, extrait sans
       changement. Elle vaut partout, et l'adhésion DIASPORA.GA garde son statut propre.
   - L'utilisateur extérieur n'a pas d'adhésion DIASPORA.GA. L'équipement exige son accueil
     d'ANTSIA (profil publié, consentement), l'admet à la racine par la vraie règle d'admission,
     comme les comptes de la racine, et n'écrit rien dans DIASPORA.GA.
   - L'équipement rend le statut EFFECTIF, celui que lit l'application ; statut et rôle sont
     vides sans adhésion.
   - Le tout est idempotent.
5. **Gestes** : par les capacités du port. Ils ne se jouent qu'à la première entrée, ceux d'une
   page seulement à sa création, et seulement si leur module est ouvert (voir plus haut).

## Limites connues

- L'ordre d'équipement compte pour le parrainage. Équipé avant « verifie », « parraine » reste
  en attente ; il passe déclaré, par parrainage, dès que « verifie » est équipé, qui complète
  ses filleuls. Le blocage de « bloque » se complète de la même façon.
- Rééquiper un acteur le remet dans son état : un blocage levé à la main par « verifie » est
  reposé au prochain équipement de « bloque » ou de « verifie ».
- La suspension à la racine ne se lève que par la console des opérateurs (`liftSuspension`) ;
  les comptes de démonstration ne la lèvent jamais.
- Si l'utilisateur extérieur entre de lui-même dans DIASPORA.GA, son adhésion reste la sienne :
  l'équipement la rend telle quelle et n'y pose rien.
- Les envois de code sont limités à 3 par 5 minutes et par adresse, et les connexions à 5 par
  15 minutes. Un quatrième appui rapide sur le même acteur est refusé un moment.
- Les gestes d'une page ne se jouent qu'à sa création : sur un backend où l'association a déjà
  été équipée avant EV-01, ses deux événements ne se créent pas (backend local neuf, ou création
  à la main par l'écran de la page).
- La politique des conversations de mise en relation (CC-V) n'est PAS ouverte par les comptes
  de démonstration : décision réservée au propriétaire, ou à un opérateur. Pour un backend LOCAL,
  la graine du banc de recette (LX-04, `modules/diaspora/seed:matchmakingBenchForRecette` dans
  ANTSIA) pose l'équipe de démonstration et y met la modératrice ; elle relit les trois politiques
  sans les écrire tant que le moteur n'a pas extrait le cœur de `setPolicy` (issue [S1]). Elle est
  refusée sur tout déploiement en nuage, démonstration comprise.
- L'équipe de modération de démonstration n'a pas de périmètre : elle reçoit les nouveaux
  signalements du réseau local.
- Pendant la préparation, quelques secondes, l'adhésion est encore « en attente » : la carte de
  statut peut s'afficher, puis se retire.
- Porte : les sessions déjà ouvertes sur des comptes de démonstration durent 7 jours ; armer la
  porte ne les ferme pas. Qui connaît un numéro autorisé peut lui faire recevoir 10 codes par jour
  (accepté pour une démonstration). Sans `x-forwarded-for` sur les actions HTTP du déploiement, tous
  les visiteurs partagent le seau d'adresse `unknown` : à constater en recette.
- La règle d'offre change aussi le panneau en développement local : un acteur d'un module ou d'un
  pays fermé n'y paraît plus.

## Vérifications

- Tests :
  - CH-817 (lot A1) : pastille et feuille (27, `components/demo-accounts-panel.test.tsx` : chaque
    état et chaque étape, refus, noms accessibles, focus, Échap), adaptateur de la porte (36,
    `data/engine-demo-gate.test.ts` : chaque statut HTTP, session de l'onglet et son échéance,
    stockage refusé, jeton passé aux deux lectures), amorçage (22, dont 6 pour les modules
    fermés et les deux temps), règles de l'écran (4, `diaspora-ga-features/src/data/demo-gate-port.test.ts`),
    porte d'accueil sans l'ancien bouton (2, `screens/landing-screen.test.tsx`) ;
  - avant CH-817 : panneau (8), amorçage (16 depuis EV-01, dont 4 pour les événements de
    l'association), catalogue du domaine (7) ;
  - équipement côté moteur : `demoAccounts.test.ts` d'ANTSIA, 49 tests, dont 13 pour les accès
    restreints, chaque garde avec son contrôle positif ;
  - cliquets i18n : familles `demoAccounts.*` et `demoGate.*` (fragment `demo-gate.json`, hors de
    la vitrine).
- Recette sur le moteur local, 19/10 au soir :
  - entreprise : statut vérifiée, page « Saveurs du Gabon (démonstration) », offre de service et
    offre d'emploi publiées ;
  - association : statut vérifiée, attestation « vérifiée » aux réglages, page de Lyon, mission
    bénévole publiée.
- Recette des accès restreints, même moteur local, 19/10 vers 22 h (`diaspora-ga-engine` sur :3031) :
  - la feuille de la porte montre 20 acteurs en quatre groupes. « Accès restreints » réunit
    Membre suspendu, Suspension à la racine, Membre bloqué et Extérieur au réseau, ce dernier
    marqué « Hors réseau » ;
  - extérieur : arrivée à l'accueil de DIASPORA.GA (étape 1 sur 3). Côté moteur : profil ANTSIA
    publié (`demo.exterieur`), une seule adhésion, à la racine, « déclarée » ; aucune adhésion
    DIASPORA.GA ;
  - membre bloqué : « Compte de démonstration prêt : Yannick MBADINGA. », puis le fil. Équipé
    avant son bloqueur, il n'était pas encore bloqué. Le blocage s'est posé à l'équipement de
    « Membre vérifié » : une intention et une ligne de relation fermée dans `diaspora-ga`, et
    l'onglet « Personnes bloquées » de Patrice MBOUMBA en compte une ;
  - suspension à la racine : « Compte de démonstration prêt : Christelle IVANGA. », puis l'avis
    « Votre compte est suspendu ». Côté moteur, la racine est « suspendue » et l'adhésion
    DIASPORA.GA est restée « vérifiée ».
- Remarques relevées en recette :
  - CORRIGÉE le 19/10 au soir : un compte connecté sans adhésion (l'extérieur, comme le nouvel
    arrivant) n'avait aucune sortie dans l'accueil, ni « Se déconnecter », ni réglages. Le bas de
    `/bienvenue` porte désormais « Ce n'est pas votre compte, ou vous voulez en changer ? » et
    « Se déconnecter partout », la même déconnexion que les réglages (`useSignOutEverywhere`) ;
  - CORRIGÉE le 19/10 au soir : sous l'avis de suspension, le fil d'un compte suspendu disait « Les
    publications ne sont pas disponibles. Vérifiez votre connexion », le message générique de tout
    refus de lecture. Un refus d'accès (`ACCESS_REFUSAL_CODES` : suspension, adhésion, statut,
    session, élément disparu) se dit maintenant tel quel, sans « Réessayer » : « Ces publications
    ne vous sont pas accessibles », puis le texte du refus. Cela vaut pour le fil, les murs de profil
    et de page, et la vue Découverte. Une panne garde son message et sa reprise.
