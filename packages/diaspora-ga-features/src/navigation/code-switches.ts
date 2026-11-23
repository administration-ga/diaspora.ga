/**
 * Les interrupteurs de CODE de l'application des membres : ce ne sont pas des modules du réseau
 * (ADR-0041 du moteur), ils ne s'ouvrent ni ne se ferment depuis l'administration. Ils se lisent
 * ici pour qu'admin.diaspora.ga les montre en lecture seule (« fermé par le code »).
 *
 *  · `calls` — les gestes qui LANCENT un appel (interrupteur `CALLS_SWITCH` de diaspora.ga,
 *    `apps/diaspora_ga/src/lib/calls.ts`, déclaré au moteur par `callsAvailable`) ;
 *  · `live` — le direct (conférences du moteur) : la page `routes.conference`, l'entrée « Une
 *    conférence » de « Créer » et la déclaration `liveAvailable` au moteur. Sa valeur ci-dessous EST
 *    l'interrupteur, la seule à changer pour l'ouvrir (CH-817) : diaspora.ga la lit par
 *    `apps/diaspora_ga/src/lib/live.ts`, le menu des membres ci-contre aussi (`codeSwitch`) ;
 *  · `icomPro` — l'espace iCom Pro, boutiques et mises en relation (`icomPro` du moteur, non déclaré).
 *
 * diaspora.ga prouve par un test que ces états sont ceux de son code : l'interrupteur des appels
 * et ce que son îlot iCom déclare au moteur (appels, direct, iCom Pro).
 */
export const MEMBERS_APP_CODE_SWITCHES = ["calls", "live", "icomPro"] as const
export type MembersAppCodeSwitch = (typeof MEMBERS_APP_CODE_SWITCHES)[number]

export type CodeSwitchState = "open" | "closed"

export const MEMBERS_APP_CODE_SWITCH_STATES: Readonly<Record<MembersAppCodeSwitch, CodeSwitchState>> = {
  calls: "closed",
  live: "closed",
  icomPro: "closed",
}
