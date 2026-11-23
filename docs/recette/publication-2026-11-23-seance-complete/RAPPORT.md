# Séance de publication complète — 23 novembre 2026 au soir

Première séance à trois temps jouée avec les scripts des dépôts (`docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`, § 8 ;
`ANTSIA/docs/36_PUBLICATION_ET_RETOUR_ARRIERE.md`) : le moteur de démonstration, puis admin.diaspora.ga (première
publication) et diaspora.ga dans la même séance. Ordre du propriétaire, 23/11 à 23 h : « commit, pousse et déploie ».
Un seul publieur (la session CH-815, qui avait aussi reçu l'ordre, s'est retirée sans rien lancer). Ce rapport ne
contient aucun identifiant de déploiement, de projet ni d'équipe.

## Ce qui a été publié

| Sujet | Valeur |
|---|---|
| Moteur ANTSIA | `2623cde995e0` (`main`, antsia#207, CH-831) |
| DIASPORA.GA | `1f6ee34f5ea8` (`main`, diaspora.ga#126) |
| Couple vérifié au registre | DIASPORA.GA `fd68d38` + moteur `2623cde9` (`docs/recette/amorcage-administrateur-2026-11-23/`) ; `1f6ee34` n'y ajoute que de la documentation |
| Cible | `demo` |
| Moteur de démonstration avant la séance | `d67a34fd81b1` |
| admin.diaspora.ga | `admin-diaspora-ga-1f6ee34f5ea8-antsia-2623cde995e0-demo` (première publication : aucune version précédente) |
| diaspora.ga | `diaspora-ga-1f6ee34f5ea8-antsia-2623cde995e0-demo` |
| Version de diaspora.ga avant la bascule (cible du retour arrière) | `diaspora-ga-3c5cbb4ffb53-antsia-c9006352c152-demo` |

## Préalables posés le même soir

- Projet d'hébergement propre à admin.diaspora.ga pour la démonstration, réglé comme celui de diaspora.ga (dossier
  racine `DIASPORA_GA/apps/admin_diaspora_ga`, Node 24, installation par le moteur, protection hors domaine public).
- Domaine `admin.diaspora.ga` rattaché à ce projet ; enregistrement CNAME chez le bureau d'enregistrement vers le nom
  donné par l'hébergeur ; certificat émis au premier déploiement.
- Variables de la machine `ADMIN_DIASPORA_GA_DEMO_SITE_URL` et `ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID` ajoutées au
  fichier privé. Rien n'a été ajouté à `TRUSTED_ORIGINS` ni à `APPLICATION_EXTRA_ORIGINS_JSON` : l'origine
  `https://admin.diaspora.ga` est de confiance par le catalogue du moteur.

## Moteur de démonstration

| Étape | Verdict |
|---|---|
| Relevé de l'API du commit sur un backend local | 1 157 fonctions (1 115 au moteur précédent) |
| `export` | fait |
| `moteur-demo-essai` | passé : 0 fonction retirée, 42 ajoutées, 8 signatures changées, 6 index ajoutés (porte des comptes de démonstration), 0 supprimé |
| `moteur-demo` | fait |
| `controle-moteur-demo` | API servie identique au relevé (1 157 sur 1 157, aucun écart) ; seule la sonde du site d'ANTSIA échoue (redirection, site protégé), comme les 22 et 23/11 |

`ANTSIA_DEMO_GATE_SECRET` n'a pas été posé : la porte des comptes de démonstration reste désarmée. Entre l'envoi du
moteur et la bascule des sites (environ vingt minutes), l'ancien diaspora.ga a continué de répondre « ok ».

## Sites

| Étape | Verdict |
|---|---|
| Première phrase tapée par le propriétaire | faite |
| Publication sans bascule et déploiement prêt, les deux applications | faits |
| Contrôle privé d'admin.diaspora.ga | bon (sonde « ok », version attendue, moteur joint) |
| Contrôle privé de diaspora.ga | bon (sonde « ok », version attendue, source « engine », moteur joint) |
| Seconde phrase, puis bascule des deux domaines | faite |
| Contrôle public des deux applications (`release-check.mjs`) | bon |

## Constats en ligne, après la bascule

- `https://admin.diaspora.ga/api/sante-fonctionnelle` : état « ok », application `admin-diaspora-ga`, version attendue,
  moteur joint (63 ms). Certificat au nom d'`admin.diaspora.ga`.
- `https://diaspora.ga/api/sante-fonctionnelle` : état « ok », version attendue, source « engine », moteur joint.
- admin.diaspora.ga, sans session : le tableau de bord renvoie vers `/entrer`, qui dit « Accès réservé à
  l'administration du réseau, par l'identité numérique » et « La connexion par l'identité numérique n'est pas
  disponible pour le moment » : attendu, l'identité numérique n'est pas encore en service sur la démonstration.
- diaspora.ga, avec la session déjà ouverte dans le navigateur de contrôle : le fil du hub France s'affiche, barre
  Fil · Membres · Messages, aucune erreur de console. `/membres` répond.

## Ce qui n'est pas fait

- **L'administration de la démonstration ne répond à personne** tant que les gestes du propriétaire ne sont pas faits :
  application de démonstration en bac à sable au portail développeur d'identite.ga (futurs administrateurs en comptes
  de test), `IDN_CLIENT_ID`, `IDN_CLIENT_SECRET` et `IDN_ISSUER` sur le moteur de démonstration, `SITE_URL` de ce
  moteur égal à l'origine de diaspora.ga ; puis amorçage du premier administrateur (`networkAdminBootstrap.nameFirst`)
  et essai d'entrée par `https://admin.diaspora.ga/entrer` (`ANTSIA/docs/23_ENVIRONNEMENT_DE_DEMONSTRATION.md`, § 7).
  D'ici là, les réglages qui ont quitté le bureau de diaspora.ga (recours, équipes, règles, modules, fondateurs, pages
  officielles, mesure du pilote) ne se règlent plus sur la démonstration.
- La pastille « Compte démo » de la porte (CH-817) n'a pas été vue : le navigateur de contrôle avait une session
  ouverte, qui n'a pas été fermée.
- Le retour arrière n'a pas été joué. Constat au bureau seulement, apparence sombre ; ni téléphone, ni appareil réel.
