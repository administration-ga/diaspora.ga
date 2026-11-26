# Passage de CONSULAT.GA à DIASPORA.GA

Le citoyen appuie sur **DIASPORA.GA** dans son espace consulaire. Le logo animé accompagne la vérification du ticket. Un membre déjà reconnu retrouve son fil. À la première adhésion, le ressortissant confirme son identité chez IDN et accepte la création de son profil social. Le badge **CONSULAT.GA** du fil ramène à l’espace consulaire quand le module correspondant est ouvert.

| Point de départ | Comportement |
| --- | --- |
| consulat.ga dans un navigateur | Le lien ouvre un nouvel onglet. La vérification de la session et le retour se font dans cet onglet. |
| Application Consulat avec Diaspora installée | Le système ouvre le lien HTTPS associé à Diaspora. Les deux applications effectuent le passage avec les sessions de l’appareil. |
| Application Consulat avec Diaspora absente | La page mobile propose les fiches des boutiques publiées. « Continuer sur le web » utilise l’application Consulat pour autoriser le navigateur. |
| Session consulaire expirée, utilisateur inéligible ou passerelle fermée | Le serveur refuse d’émettre une session Diaspora. |

## Arrivée sans ticket consulaire

Quand le service de tickets est indisponible, le lien V1 indique seulement que la navigation provient du Consulat. Diaspora affiche son logo puis demande à IDN une nouvelle authentification (`prompt=login`), y compris si un membre utilise déjà Diaspora dans ce navigateur. Sur un appareil partagé, le ressortissant confirme ainsi son propre compte avant d’ouvrir le fil. L’identifiant consulaire ne peut être prérempli dans ce mode. Un membre retrouve son fil après IDN. Une personne qui rejoint le réseau confirme son profil. Seul un rapprochement vérifié côté serveur établit le niveau 2.

## Échange entre les services

1. Diaspora génère un état et un vérificateur aléatoires indépendants de 256 bits. Le navigateur ou l’application garde le vérificateur. Le consulat reçoit son empreinte SHA-256.
2. Le serveur consulaire vérifie la session, l’accès à la passerelle et la durée de validité. Il émet un code valable 90 secondes. Le retour passe par le fragment d’une adresse fixe du domaine Diaspora.
3. Diaspora efface le fragment puis présente le code et le vérificateur à son propre serveur. ANTSIA les échange côté serveur auprès du consulat. La consommation du code est atomique. Le consulat vérifie à nouveau l’éligibilité et la session source.
4. Le serveur reçoit un identifiant consulaire pseudonyme et, si le compte consulaire est relié à IDN, le sujet stable du fournisseur IDN. Il retrouve le membre par une liaison consulaire déjà établie ou par ce sujet. Une contradiction entre les deux liaisons interrompt le passage.
5. Pour une première adhésion, Diaspora ouvre IDN avec l’identifiant de connexion associé au compte consulaire lorsqu’il est disponible. Celui-ci reste visible pendant la saisie du code. Au retour, un nouveau ticket permet de comparer le sujet IDN du compte consulaire à celui de la session authentifiée. La nationalité gabonaise requise pour l’adhésion provient directement d’IDN.
6. Diaspora présente le profil proposé avec le nom, les prénoms et le pays de résidence connus. Le ressortissant choisit le pays s’il manque, puis accepte la publication du profil social. La visibilité dans l’annuaire et les notifications sont désactivées par défaut. Une adhésion déjà validée mène directement au fil.

## Statut et parrainage dans DIASPORA.GA

Dès que la passerelle confirme le compte CONSULAT.GA, DIASPORA.GA accorde le niveau 2 (membre vérifié). Pour une première adhésion, ce statut prend effet à l’acceptation du profil social. Pour une adhésion existante, les droits sont recalculés au retour du consulat. Une suspension ou un départ reste prioritaire.

Si le ressortissant arrive directement par IDN, Diaspora peut aussi demander au Consulat si le même sujet vérifié possède un compte, après consentement au profil social. Le Consulat répond par un booléen. Après une réponse négative ou une indisponibilité, le moteur attend quinze minutes avant le prochain essai, déclenché lors d’un nouveau passage du membre.

Le membre vérifié trouve son code personnel dans **Parrainer** et peut le transmettre immédiatement, dans la limite de dix parrainages sur trente jours glissants. Le proche saisit ce code depuis sa salle d’attente ou la page **Parrainer**. Chaque utilisation réussie remplace le code.

## Configuration de production

À l’arrivée, le site interroge la configuration publique du moteur. Elle annonce uniquement l’origine de l’application quand les trois paramètres du ticket sont configurés. Le site utilise le ticket sur cette origine et garde l’entrée IDN historique si le moteur ne l’annonce pas ou ne répond pas. Une reprise de ticket reste en V2 jusqu’à la fin de sa vérification. Sur OVH, le changement prend effet dès la configuration du moteur, avec la même image web.

| Emplacement | Réglage |
| --- | --- |
| Convex consulaire et Convex ANTSIA | Installer le même secret aléatoire dans `DIASPORA_PASS_SECRET` (au moins 32 caractères). Le conserver dans les gestionnaires de secrets des deux déploiements. |
| Convex ANTSIA | `CONSULAT_PASS_ISSUER` est l’origine HTTPS des actions HTTP du déploiement consulaire. `DIASPORA_PASS_APP_ORIGIN` est l’origine exacte de Diaspora, en production `https://diaspora.ga`. |
| Web Diaspora | Utiliser la source de données `engine` et la configuration publique `NEXT_PUBLIC_CONSULATE_URL`. Définir `DIASPORA_ANDROID_CERT_SHA256` avec l’empreinte du certificat de signature de l’application distribuée par Google Play. |
| Web Consulat | Configurer `CONSULAT_ANDROID_CERT_SHA256` avec l’empreinte du certificat de signature de l’application consulaire. Les deux domaines servent les associations HTTPS Apple et Android sous `/.well-known/`. |
| Applications iOS | Les associations ciblent l’équipe Apple du Consulat `5Y39TTNCM7`. Les identifiants sont `ga.consulat.mobile` et `ga.diaspora.mobile`. En cas de changement d’équipe pour Diaspora, adapter son fichier d’association avant la signature. |
| Boutiques | Une fois les fiches publiques, renseigner `DIASPORA_APPLE_STORE_ID` avec l’identifiant numérique fourni par Apple et `DIASPORA_PLAY_STORE_LIVE=true` pour le paquet Android `ga.diaspora.mobile`. |

Mettre en service les deux backends, les pages web et les associations de domaines avant de distribuer les nouvelles versions de Consulat et Diaspora. Le navigateur conserve le parcours direct via la route web dédiée. Sur téléphone, l’ouverture dépend de l’association vérifiée par le système et du choix de l’utilisateur pour ce domaine.

## Projet mobile

L’entrée Expo se trouve dans `apps/diaspora_ga_mobile`. L’application React Native affiche dans une WebView le fil, les publications, les messages et les écrans existants du site. Elle gère les liens associés, la zone sûre du téléphone, la navigation retour Android et la reprise après une erreur de chargement. La session est conservée dans le contexte de l’application.

Depuis l’installation partagée ANTSIA, le paquet expose `dev`, `ios`, `android`, `test`, `typecheck` et `export`. Les profils EAS de recette et de production sont définis dans `eas.json`. La recette sur appareils signés doit couvrir les démarrages à froid et à chaud, le navigateur seul, le retour depuis Consulat, le passage après installation et une session source expirée.
