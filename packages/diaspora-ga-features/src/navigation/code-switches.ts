/**
 * Les interrupteurs de CODE de l'application des membres : ce ne sont pas des modules du réseau
 * (ADR-0041 du moteur), ils ne s'ouvrent ni ne se ferment depuis l'administration. Ils se lisent
 * ici pour qu'admin.diaspora.ga les montre en lecture seule (« fermé par le code »).
 *
 *  · `calls` — les gestes qui LANCENT un appel (interrupteur `CALLS_SWITCH` de diaspora.ga,
 *    `apps/diaspora_ga/src/lib/calls.ts`, déclaré au moteur par `callsAvailable`) ;
 *  · `live` — la route de conférence en direct (`liveAvailable` du moteur, non déclarée) ;
 *  · `icomPro` — l'espace iCom Pro, boutiques et mises en relation (`icomPro` du moteur, non déclaré).
 *
 * diaspora.ga prouve par un test que ces états sont ceux de son code : l'interrupteur des appels
 * et ce que son îlot iCom déclare au moteur.
 */
export const MEMBERS_APP_CODE_SWITCHES = ["calls", "live", "icomPro"] as const
export type MembersAppCodeSwitch = (typeof MEMBERS_APP_CODE_SWITCHES)[number]

export type CodeSwitchState = "open" | "closed"

export const MEMBERS_APP_CODE_SWITCH_STATES: Readonly<Record<MembersAppCodeSwitch, CodeSwitchState>> = {
  calls: "closed",
  live: "closed",
  icomPro: "closed",
}
