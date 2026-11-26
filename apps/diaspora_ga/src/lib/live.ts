/**
 * L'interrupteur du DIRECT de diaspora.ga (conférences du moteur, CH-817) — module PUR.
 *
 * Décision du propriétaire, la même que pour les appels (plan 04 du 10/11/2026, § 7, décision 2 ;
 * `lib/calls.ts`) : rien n'est proposé tant que le direct n'a pas de vrai serveur vidéo. Les clés du
 * serveur vidéo sont un geste du propriétaire.
 *
 * OUVERT le 26/11/2026, en UNE valeur, sans rien réécrire :
 * `MEMBERS_APP_CODE_SWITCH_STATES.live = "open"` (`packages/diaspora-ga-features/src/navigation/code-switches.ts`).
 * Le serveur vidéo du moteur (LiveKit) tourne sur le serveur OVH (dossier `Stacks/rtc_antsia_demo`
 * de l'infrastructure) ; l'origine de sa connexion entre dans la politique de sécurité du site à la
 * construction (`Stacks/diaspora_ga/build.sh.modele`) ; les variables du moteur sont posées par le
 * propriétaire. RESTE À FAIRE avant toute annonce : la recette à deux comptes
 * (`docs/36_MISE_EN_PRODUCTION.md`, § 6.3, étape 4).
 *
 * Ouvert, avec le moteur comme source :
 *  · la page `routes.conference` (`app/direct/[id]`) monte l'écran du direct du moteur ;
 *  · « Créer » offre « Un live », en tête (règle partagée du menu des membres, `codeSwitch`) ; la carte
 *    « Quoi de neuf ? » du fil et le composeur offrent « Live » par la même règle (`useComposer().goLive`) ;
 *  · une annonce de direct dans le fil mène à sa page (carte de publication, `conferenceFeatureRoute`) ;
 *  · l'îlot des surfaces du moteur (`IcomIsland`) déclare `liveAvailable` vrai : le moteur monte
 *    l'hôte du direct de la couche de communication, place les directs en tête du lecteur des actus
 *    et propose de lancer un live depuis un appel. Les textes du moteur disent « live », jamais
 *    « conférence » (surcharges de `@diaspora-ga/features/i18n`, `engine-overrides`).
 * Refermé (`"closed"`), le direct reste ENTIER et BRANCHÉ, mais rien n'y mène plus : page
 * introuvable, aucune entrée dans « Créer », annonce du fil en texte simple, `liveAvailable` faux.
 *
 * Pourquoi la valeur vit dans le paquet partagé et pas ici : admin.diaspora.ga la montre en lecture
 * seule (« ouvert par le code ») et son aperçu du menu la lit ; une seule valeur, donc aucun écart
 * possible entre ce que l'administration montre et ce que diaspora.ga sert. Pourquoi une valeur du
 * dépôt et pas une variable publique de construction : toute variable `NEXT_PUBLIC_*` lue par
 * l'application doit être déclarée au catalogue de déploiement du moteur (`deploy/catalog.json`,
 * cliquet `deploy-catalog`), qui n'est pas dans la zone de DIASPORA.GA.
 */
import type { FeatureRoutes } from "@diaspora-ga/features"
import { MEMBERS_APP_CODE_SWITCH_STATES, type CodeSwitchState } from "@diaspora-ga/features/navigation"

import type { DataSourceKind } from "./data-source"
import { routes } from "./routes"

export const LIVE_SWITCH_STATES = ["closed", "open"] as const satisfies readonly CodeSwitchState[]
export type LiveSwitch = (typeof LIVE_SWITCH_STATES)[number]

/** L'interrupteur lui-même : celui que montre admin.diaspora.ga, ouvert depuis le 26/11/2026. */
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
 * La page d'un direct comme destination des surfaces (l'annonce d'un direct dans le fil, lot A5) :
 * fournie seulement quand cette page est servie (`conferenceRouteServed`). Sans elle, la carte de
 * publication dit le direct, son titre et son statut, sans lien vers une page introuvable.
 */
export function conferenceFeatureRoute(dataSource: DataSourceKind, state: LiveSwitch = LIVE_SWITCH): Pick<FeatureRoutes, "conference"> {
  return conferenceRouteServed(dataSource, state) ? { conference: routes.conference } : {}
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
