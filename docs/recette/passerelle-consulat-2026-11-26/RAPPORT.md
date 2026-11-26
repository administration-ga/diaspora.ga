# Recette — passerelle consulat.ga (CH-863, lots D1, D2 et module) — 26/11/2026

## Couple vérifié

- DIASPORA.GA `0052c71` (branche `chantier/ch-863-passerelle-consulat`) avec le moteur `4be5d5aa`
  (branche `chantier/ch-863-module-passerelle`, sur `main` `108f3cd1`, qui contient M1 / ADR-0045).
- `bun run --cwd ../ANTSIA verify` sous le verrou commun, poste s14, de 12 h 43 à 12 h 52 : code 0,
  aucun écart sur les fichiers suivis. Moteur : 4 641 tests de la suite Convex, 2 323 du domaine ;
  application des membres : 2 871 ; surfaces : 1 494 ; administration : 292 ; cliquets compris.
- Les deux branches se fusionnent ensemble : le miroir `ENGINE_NETWORK_FEATURES` du domaine de
  l'application doit suivre la clé `consulateGateway` du moteur.

## Contrôle au navigateur (démonstration locale, données fictives, adresse de consulat.ga configurée)

| Constat | Résultat |
|---|---|
| `/entrer?depuis=consulat` : ligne « Vous arrivez de consulat.ga » et « Continuer avec mon identité numérique » | conforme |
| Module « Démarches consulaires (consulat.ga) » fermé (aucune décision) : aucune entrée « consulat.ga » dans le menu ni au pied du rail | conforme |
| Carte de statut : « M'inscrire au consulat » mène à `https://consulat.ga/register?type=long_stay` | conforme |
| Module ouvert : lien du pied de rail vers `https://consulat.ga/my-space`, même onglet, `rel="noopener noreferrer"`, `referrerPolicy="no-referrer"` | conforme |
| Premier clic : feuille « Vos démarches sur consulat.ga » (membre relié à l'identité numérique : « Ouvrir mon espace consulat.ga », « M'inscrire au consulat ») | conforme, 1 440 px |
| Téléphone 390 px : groupe « Démarches administratives » entre « Mon espace » et « Mes données » dans la feuille du compte | conforme |
| Console | aucune erreur |

## Points relevés, non bloquants

- Au pied du rail, à 1 440 px, le libellé « Mes démarches sur consulat.ga » est tronqué.
- Sur la porte d'arrivée, deux boutons pleins se suivent (identité numérique et code par e-mail).

## Non vérifié

- L'entrée sans ressaisie chez identite.ga (lot D2) : demande le moteur publié sur la démonstration
  et un compte de test du bac à sable.
- La carte du module dans admin.diaspora.ga au navigateur (couverte par les tests de l'administration).
