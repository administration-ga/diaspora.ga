# Médias du fil : grille intelligente, visionneuse, bord à bord, vidéo et composeur selon UDB (26/11/2026)

Application : PR 139 d'`administration-ga/diaspora.ga`. Moteur : PR 211 (antivirus tolérant), 212 (dix photos)
et 213 (vidéos lourdes) d'`administration-ga/antsia`. L'étude de référence est la note
`Decision_medias_direct_actus_2026-11-25.md`, rangée dans la documentation du projet sous `Medias_du_fil_2026-11-25`.

## Ce qui ne marchait pas

Le 25/11, les photos et les vidéos publiées ne s'affichaient pas. L'antivirus du moteur, sur Cloud Run, répondait
503 (facturation fermée). La garde des fichiers est fermée par défaut, si bien qu'aucun média non analysé n'était
servi. L'antivirus tourne depuis sur le serveur OVH. Le 25/11 au soir, cinq médias publiés, dont une vidéo MP4,
ont été analysés sains et servis.

## Ce que le lot livre

- **État réel des médias.**
  - Un média retenu dit pourquoi au lieu de « Média indisponible ».
  - Le composeur n'annonce plus « Publié. » tant que les médias sont en vérification.
  - Les images et les vidéos ont un repli en cas d'échec de chargement.
- **Grille intelligente.**
  - De 1 à 4 photos, la disposition suit le nombre de photos.
  - Au-delà, trois vignettes, puis une quatrième tuile « +N », avec N = total − 3 : 10 photos donnent « +7 ».
- **Visionneuse plein écran**, en défilement horizontal :
  - balayage au doigt, flèches à l'écran et au clavier ;
  - position « 2 / N » annoncée ;
  - Échap qui rend le focus.
- **Médias bord à bord dans la carte**, découpés par ses coins.
- **Vidéo du fil selon UDB.**
  - La première image s'affiche.
  - La vidéo joue muette quand elle est la plus visible, se met en pause hors de l'écran, et a deux boutons de 44 px.
  - Rien ne démarre seul en mouvement réduit ni en économie de données.
- **Composeur selon UDB.**
  - Raccourcis Photo et Vidéo.
  - Pourcentage d'envoi.
  - « Réessayer » sans perdre le texte.
- **Avec le moteur.**
  - Jusqu'à dix photos par publication.
  - Une vidéo de téléphone trop lourde est compressée au lieu d'être refusée.
  - L'antivirus met les analyses en file d'attente et se rattrape seul après une panne.

## Vérification

`bun run --cwd ../ANTSIA verify`, sous le verrou commun, le 26/11 de 6 h 39 à 6 h 52 (poste s12). Couple vérifié :
moteur `1872ca54` (le `main` du moteur `6deb5b5b`, plus les PR 211, 212 et 213) et DIASPORA.GA `ade3736`. Résultat
**vert** :

- moteur : 4 244 tests sur 274 fichiers ;
- typage : 13 paquets ;
- tests : 13 paquets, dont 2 764 pour l'application et 1 439 pour les surfaces ;
- lint : 12 paquets ;
- aucun écart dans les fichiers suivis.

Après la fusion des trois PR du moteur, le `main` du moteur `547b80bc` a un arbre identique à celui vérifié.

## Au navigateur

Serveur de développement du poste s12, fournisseur de démonstration, compte fictif de Mireille IVINDO.

- **Dix photos** : grille 2 × 2, la quatrième tuile marquée « +7 ». Son nom accessible est « Voir 7 photos de plus,
  à partir de la photo 4 sur 10 ».
- **Bord à bord** : la grille fait la largeur de la carte, à 1280 px (672 px) comme à 390 px (358 px).
- **Visionneuse** : elle s'ouvre à « 4 / 10 », avec le focus sur « Fermer » et l'annonce « Média 4 sur 10 ». La flèche
  du clavier passe à « 5 / 10 », et Échap ferme en rendant le focus à la tuile.
- **Vidéo** : muette, sur sa première image. Elle reste à l'arrêt en mouvement réduit, comme prévu. Boutons
  « Lire la vidéo » et « Activer le son » de 44 px.
- **Raccourcis** Photo et Vidéo de 44 px sur « Quoi de neuf ? ».
- **Console** : aucune erreur de l'application.

## Limites

- Rien n'est éprouvé sur un vrai téléphone : lecture muette sur Safari iPhone, compression d'un vrai MP4 de plus de
  60 Mo, .mov d'iPhone. C'est la recette R1.
- Le direct reste fermé : il attend un serveur LiveKit sur le serveur OVH.
- Le contrat fédéré RESEAU-PUBLIC-V1 reste à quatre images.
