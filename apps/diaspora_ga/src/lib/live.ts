/**
 * L'interrupteur du DIRECT de diaspora.ga (conférences du moteur, CH-817) — module PUR.
 *
 * Décision du propriétaire, la même que pour les appels (plan 04 du 10/11/2026, § 7, décision 2 ;
 * `lib/calls.ts`) : rien n'est proposé tant que le direct n'a pas été prouvé avec un vrai serveur
 * vidéo, à deux comptes. Les clés du serveur vidéo sont un geste du propriétaire.
 *
 * Fermé, le direct est ENTIER et BRANCHÉ, mais rien n'y mène :
 *  · la page `routes.conference` (`app/direct/[id]`) répond « introuvable » ;
 *  · « Créer » n'offre pas « Une conférence » (règle partagée du menu des membres, `codeSwitch`) ;
 *  · l'îlot des surfaces du moteur (`IcomIsland`) déclare `liveAvailable` faux : le moteur ne monte
 *    pas l'hôte du direct de la couche de communication, ne place aucun direct en tête du lecteur des
 *    actus, et ne propose pas de lancer une conférence depuis un appel.
 * Le jour où le direct est prouvé, on l'ouvre en UNE valeur, sans rien réécrire :
 * `MEMBERS_APP_CODE_SWITCH_STATES.live = "open"` (`packages/diaspora-ga-features/src/navigation/code-switches.ts`).
 * Ce que l'ouverture demande en plus (variables du moteur, origine du serveur vidéo dans la politique
 * de sécurité, recette à deux comptes) : `docs/36_MISE_EN_PRODUCTION.md`, § 6.3.
 *
 * Pourquoi la valeur vit dans le paquet partagé et pas ici : admin.diaspora.ga la montre en lecture
 * seule (« fermé par le code ») et son aperçu du menu la lit ; une seule valeur, donc aucun écart
 * possible entre ce que l'administration montre et ce que diaspora.ga sert. Pourquoi une valeur du
 * dépôt et pas une variable publique de construction : toute variable `NEXT_PUBLIC_*` lue par
 * l'application doit être déclarée au catalogue de déploiement du moteur (`deploy/catalog.json`,
 * cliquet `deploy-catalog`), qui n'est pas dans la zone de DIASPORA.GA.
 */
import { MEMBERS_APP_CODE_SWITCH_STATES, type CodeSwitchState } from "@diaspora-ga/features/navigation"

import type { DataSourceKind } from "./data-source"

export const LIVE_SWITCH_STATES = ["closed", "open"] as const satisfies readonly CodeSwitchState[]
export type LiveSwitch = (typeof LIVE_SWITCH_STATES)[number]

/** L'interrupteur lui-même : celui que montre admin.diaspora.ga, fermé tant que le direct n'est pas prouvé. */
export const LIVE_SWITCH: LiveSwitch = MEMBERS_APP_CODE_SWITCH_STATES.live

/** Seul « open » ouvre le direct ; toute autre valeur le garde fermé. */
export function isLiveSwitchOpen(state: LiveSwitch): boolean {
  return state === "open"
}

/** Les écrans et l'îlot du moteur demandent ici si le direct peut être proposé. */
export function liveIsOpen(): boolean {
  return isLiveSwitchOpen(LIVE_SWITCH)
}

/**
 * La page d'un direct est-elle servie ? Il faut l'interrupteur ouvert ET le moteur comme source :
 * la démonstration de ce navigateur n'a ni serveur, ni salle, ni session.
 */
export function conferenceRouteServed(dataSource: DataSourceKind, state: LiveSwitch = LIVE_SWITCH): boolean {
  return isLiveSwitchOpen(state) && dataSource === "engine"
}

/**
 * L'identifiant d'une session lu dans l'adresse, décodé UNE fois (comme la page du direct du
 * moteur) : `null` s'il est vide ou mal encodé, la page répond alors « introuvable ». Aucune
 * validation de forme : une session inconnue, d'un autre réseau ou hors audience reçoit du moteur
 * le même refus indistinct.
 */
export function conferenceSessionId(segment: string): string | null {
  let value: string
  try {
    value = decodeURIComponent(segment)
  } catch {
    return null
  }
  return value.length > 0 ? value : null
}
