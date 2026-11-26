# Contrat DIASPORA-PASSERELLE-V1 — passer de consulat.ga à DIASPORA.GA, et retour

> Version 1, 26 novembre 2026 (chantier CH-863, plan approuvé par le propriétaire). Document jumeau :
> le dépôt de consulat.ga doit porter le même texte sous le même nom (`docs/contrats/DIASPORA-PASSERELLE-V1.md`,
> lot C1 du chantier). Toute modification se fait dans les deux dépôts à la fois et change le numéro de version.

## Objet

DIASPORA.GA (le réseau social de la diaspora gabonaise) et consulat.ga (les démarches consulaires) restent
deux applications distinctes : deux dépôts, deux bases de données, deux sessions. Une même identité
numérique (identite.ga) permet de se connecter à l'une et à l'autre. Ce contrat dit comment une personne
passe de l'une à l'autre, depuis l'intérieur de chacune : par une **navigation simple**, rien de plus.

## Règles

1. **Même onglet.** Le passage remplace la page courante ; ni nouvel onglet, ni encastrement (iframe).
2. **Destinations fermées.** Chaque côté ne mène qu'aux adresses listées ci-dessous, sans en ajouter.
3. **Rien de personnel ne voyage.** Aucun identifiant de la personne, aucun champ pré-rempli, aucune
   donnée de profil dans l'adresse. Le seul paramètre admis est une valeur fixe, la même pour tous.
4. **Aucun référent.** Chaque lien porte `rel="noopener noreferrer"` et `referrerpolicy="no-referrer"`.
5. **Adresse lue dans la configuration.** Chaque côté lit l'origine de l'autre dans sa configuration
   publique (DIASPORA.GA : `NEXT_PUBLIC_CONSULATE_URL` ; consulat.ga : `NEXT_PUBLIC_DIASPORA_URL`). Une
   origine absente, ou qui n'est pas une origine `https` nue (sans identifiants, chemin, requête ni ancre),
   fait disparaître le lien : jamais de lien mort.
6. **Aucune mesure par personne.** Le passage n'est ni compté ni tracé individuellement.
7. **Chaque côté garde sa connexion.** Arriver sur l'autre application ne connecte personne d'office :
   la personne y entre par son propre geste (l'identité numérique, ou le moyen propre à l'application).
   DIASPORA.GA ne part jamais de lui-même vers identite.ga.

## Destinations

| Sens | Clé | Chemin sur l'application d'arrivée | Ce que la personne y trouve |
|---|---|---|---|
| consulat.ga → DIASPORA.GA | `enter` | `/entrer?depuis=consulat` | La porte de DIASPORA.GA, qui dit « Vous arrivez de consulat.ga » ; `depuis=consulat` est un repère d'origine fermé, qui ne désigne personne |
| DIASPORA.GA → consulat.ga | `mySpace` | `/my-space` (aucun paramètre) | Son espace consulat.ga |
| DIASPORA.GA → consulat.ga | `register` | `/register?type=long_stay` | L'inscription consulaire, type « long séjour » pré-choisi (valeur fixe, non personnelle) |

Côté DIASPORA.GA, la porte d'arrivée n'admet que la valeur `consulat` : toute autre valeur est ignorée et
la porte ordinaire s'affiche. Les destinations vers consulat.ga sont tenues par le domaine
(`packages/diaspora-ga-domain/src/consulate-destinations.ts`), la porte d'arrivée par la table des routes
de l'application (`apps/diaspora_ga/src/lib/routes.ts`, `lib/arrival.ts`). Le module qui ouvre l'entrée du
menu est une clé du moteur du réseau (`consulateGateway`, ADR-0041 du moteur, amendé le 26/11/2026) : il ne
garde aucune fonction du moteur et ne change rien à ces destinations.

## Ce que chaque côté affiche

- **DIASPORA.GA** : dans le menu du compte (bureau et téléphone), un groupe « Démarches administratives »
  avec l'entrée « consulat.ga », et un lien discret au pied du rail du bureau. **Cette entrée est fermée
  par défaut** : c'est un module du réseau (`consulateGateway`, « Démarches consulaires (consulat.ga) »),
  que l'administrateur du réseau ouvre et ferme depuis admin.diaspora.ga, section « Modules », avec un
  motif inscrit au journal — en miroir de l'onglet « Diaspora » de consulat.ga. Module fermé, ou adresse de
  consulat.ga absente de la configuration, ni l'entrée ni le lien du rail n'apparaissent. La première fois,
  une feuille d'information explique le passage (identité numérique, inscription consulaire, accès à
  consulat.ga) et rappelle que consulat.ga est une autre application, à qui DIASPORA.GA ne transmet rien.
  À l'arrivée depuis consulat.ga, une carte le dit une fois, nomme le compte connecté et propose « Revenir
  à consulat.ga » ou « Ce n'est pas moi » (qui déconnecte partout et rouvre la porte ordinaire). Cette
  carte, la porte d'arrivée et le lien « M'inscrire au consulat » de la carte de statut ne dépendent pas du
  module : seulement de l'adresse configurée.
- **consulat.ga** (prévu au lot C1, pas encore livré) : un onglet « Diaspora » dans l'espace citoyen,
  fermé par défaut et ouvert par le super administrateur depuis admin.consulat.ga ; un panneau
  d'information avant le départ.

## Hors de ce contrat

L'**attestation consulaire** (contrat DIASPORA-ATTESTATION-V1) est un flux distinct : un échange de serveur
à serveur, signé, soumis au consentement explicite de la personne, qui ne rend qu'un résultat booléen. Le
présent contrat n'y touche pas et ne s'en sert pas : passer d'une application à l'autre ne transmet aucune
attestation, et n'en demande aucune.

L'entrée sans ressaisie sur la porte d'arrivée (la session identite.ga acceptée tant qu'elle vit) est un
lot à part, qui demande un changement du moteur ; tant qu'il n'est pas livré, la porte d'arrivée propose
l'entrée ordinaire par l'identité numérique.
