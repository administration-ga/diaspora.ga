/**
 * Les interrupteurs de CODE de l'application des membres : ce ne sont pas des modules du réseau
 * (ADR-0041 du moteur), ils ne s'ouvrent ni ne se ferment depuis l'administration. Ils se lisent
 * ici pour qu'admin.diaspora.ga les montre en lecture seule (« ouvert par le code » ou « fermé par
 * le code »).
 *
 *  · `calls` — les gestes qui LANCENT un appel (interrupteur `CALLS_SWITCH` de diaspora.ga,
 *    `apps/diaspora_ga/src/lib/calls.ts`, déclaré au moteur par `callsAvailable`) : fermé ;
 *  · `live` — le live (le direct du moteur) : la page `routes.conference`, l'entrée « Un live » de
 *    « Créer » et le raccourci « Live » du fil, le lien des annonces de direct dans le fil et la déclaration
 *    `liveAvailable` au moteur. Sa valeur ci-dessous EST l'interrupteur (CH-817) : diaspora.ga la
 *    lit par `apps/diaspora_ga/src/lib/live.ts`, le menu des membres ci-contre aussi (`codeSwitch`),
 *    la carte de publication aussi. OUVERT le 26/11/2026 : le serveur vidéo du moteur tourne sur le
 *    serveur OVH (dossier `Stacks/rtc_antsia_demo` de l'infrastructure) ; la recette à deux comptes
 *    reste à faire avant toute annonce (`docs/36_MISE_EN_PRODUCTION.md`, § 6.3) ;
 *  · `icomPro` — l'espace iCom Pro, boutiques et mises en relation (`icomPro` du moteur, non
 *    déclaré) : fermé ;
 *  · `consulateGateway` — la passerelle « consulat.ga » (CH-863, lot D1, contrat
 *    DIASPORA-PASSERELLE-V1) : le groupe « Démarches administratives » du menu du compte et le lien
 *    au pied du rail du bureau. Une simple navigation vers une autre application, rien ne lui est
 *    transmis ; elle n'existe que si l'adresse de consulat.ga est configurée
 *    (`apps/diaspora_ga/src/lib/consulate-gateway.ts`). Ouverte le 26/11/2026 (plan approuvé de
 *    CH-863). La carte de statut et la carte d'arrivée ne la lisent pas : leurs liens vers
 *    consulat.ga ne dépendent que de l'adresse configurée.
 *
 * diaspora.ga prouve par un test que ces états sont ceux de son code : l'interrupteur des appels,
 * ce que son îlot iCom déclare au moteur (appels, direct, iCom Pro) et la passerelle consulat.ga.
 */
export const MEMBERS_APP_CODE_SWITCHES = ["calls", "live", "icomPro", "consulateGateway"] as const
export type MembersAppCodeSwitch = (typeof MEMBERS_APP_CODE_SWITCHES)[number]

export type CodeSwitchState = "open" | "closed"

export const MEMBERS_APP_CODE_SWITCH_STATES: Readonly<Record<MembersAppCodeSwitch, CodeSwitchState>> = {
  calls: "closed",
  live: "open",
  icomPro: "closed",
  consulateGateway: "open",
}
