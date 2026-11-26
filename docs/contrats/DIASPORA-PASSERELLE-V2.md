# Passage de CONSULAT.GA à DIASPORA.GA

Le citoyen appuie sur **DIASPORA.GA** dans son espace consulaire. Une session consulaire active et un profil autorisé par le réglage « Passerelles » suffisent pour ouvrir une session Diaspora. Le réseau garde son parcours de première adhésion. Un membre déjà reconnu retrouve son fil. Le badge **CONSULAT.GA** du fil ramène à l’espace consulaire quand le module correspondant est ouvert.

| Point de départ | Comportement |
| --- | --- |
| consulat.ga dans un navigateur | Le lien ouvre un nouvel onglet. La vérification de la session et le retour se font dans cet onglet. |
| Application Consulat avec Diaspora installée | Le système ouvre le lien HTTPS associé à Diaspora. Les deux applications effectuent le passage avec les sessions de l’appareil. |
| Application Consulat avec Diaspora absente | La page mobile propose les fiches des boutiques publiées. « Continuer sur le web » utilise l’application Consulat pour autoriser le navigateur. |
| Session consulaire expirée, utilisateur inéligible ou passerelle fermée | Le serveur refuse d’émettre une session Diaspora. |

## Échange entre les services

1. Diaspora génère un état et un vérificateur aléatoires indépendants de 256 bits. Le navigateur ou l’application garde le vérificateur. Le consulat reçoit son empreinte SHA-256.
2. Le serveur consulaire vérifie la session, l’accès à la passerelle et la durée de validité. Il émet un code valable 90 secondes. Le retour passe par le fragment d’une adresse fixe du domaine Diaspora.
3. Diaspora efface le fragment puis présente le code et le vérificateur à son propre serveur. ANTSIA les échange côté serveur auprès du consulat. La consommation du code est atomique. Le consulat vérifie à nouveau l’éligibilité et la session source.
4. L’échange fournit un identifiant consulaire pseudonyme. Il permet de retrouver une identité IDN déjà liée ou un compte Diaspora déjà connecté dont les deux services ont vérifié la même adresse. Le navigateur ne reçoit aucune adresse consulaire.

## Statut et parrainage dans DIASPORA.GA

Dès que la passerelle confirme le compte CONSULAT.GA, DIASPORA.GA accorde le statut de membre vérifié. Pour une première adhésion, ce statut prend effet à la fin du parcours habituel. Pour une adhésion existante, les droits sont recalculés au retour du consulat. Une suspension ou un départ reste prioritaire.

Le membre trouve son code personnel dans **Parrainer** et peut le transmettre immédiatement, dans la limite de dix parrainages sur trente jours glissants. Le proche saisit ce code depuis sa salle d’attente ou la page **Parrainer**. Chaque utilisation réussie remplace le code.

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
