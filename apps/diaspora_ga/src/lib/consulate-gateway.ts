/**
 * La passerelle « consulat.ga » de DIASPORA.GA (CH-863, lot D1, contrat DIASPORA-PASSERELLE-V1,
 * `docs/contrats/DIASPORA-PASSERELLE-V1.md`).
 *
 * DIASPORA.GA et consulat.ga restent deux applications (deux dépôts, deux bases, deux sessions),
 * ouvertes par la même identité identite.ga. Depuis le menu du compte, la personne passe à
 * consulat.ga dans le MÊME onglet : une navigation simple, sans identifiant, sans rien de
 * pré-rempli, sans référent, sans mesure. Les adresses viennent des destinations fermées du
 * domaine (`@diaspora-ga/domain`, consulate-destinations), composées sur l'adresse de consulat.ga
 * déjà configurée (`publicEnv.consulateUrl`, `NEXT_PUBLIC_CONSULATE_URL`, au catalogue de
 * déploiement) : adresse absente ou invalide, la passerelle n'existe pas du tout.
 *
 * La première fois, un clic simple ouvre une feuille d'information, choisie selon l'état de la
 * personne (`consulateGatewayState`) ; ensuite le lien mène directement. « Déjà vu » se garde dans
 * ce navigateur, jamais sur le serveur.
 */
import { consulateDestinationUrl, type AttestationOutcome, type MembershipStatus } from "@diaspora-ga/domain"
import { MEMBERS_APP_CODE_SWITCH_STATES, type CodeSwitchState } from "@diaspora-ga/features/navigation"

import { publicEnv } from "./env"

/** Les deux adresses de consulat.ga que DIASPORA.GA propose : l'espace personnel, l'inscription. */
export interface ConsulateGatewayLinks {
  readonly mySpace: string
  readonly register: string
}

/** Les adresses du contrat pour une origine ; `null` quand elle manque ou est refusée. */
export function consulateGatewayLinks(origin: string | null | undefined): ConsulateGatewayLinks | null {
  const mySpace = consulateDestinationUrl(origin, "mySpace")
  const register = consulateDestinationUrl(origin, "register")
  return mySpace === null || register === null ? null : { mySpace, register }
}

/** Les adresses depuis la configuration publique de l'application, lue à chaque appel. */
export function configuredConsulateGateway(): ConsulateGatewayLinks | null {
  return consulateGatewayLinks(publicEnv.consulateUrl)
}

/**
 * L'interrupteur de code de la passerelle, celui que montre admin.diaspora.ga en lecture seule et
 * que lit le menu partagé (`MEMBER_GATEWAY_RULES`) : une seule valeur.
 */
export const CONSULATE_GATEWAY_SWITCH: CodeSwitchState = MEMBERS_APP_CODE_SWITCH_STATES.consulateGateway

/**
 * Les attributs de tout lien vers consulat.ga : le même onglet (aucune cible), aucun ouvreur,
 * aucun référent transmis.
 */
export const CONSULATE_LINK_ATTRIBUTES = { rel: "noopener noreferrer", referrerPolicy: "no-referrer" } as const

/**
 * Ce que la feuille dit, selon la personne (vues du port de données, aucun champ ajouté) :
 *  · `attested` — le consulat a attesté son inscription : aucune feuille, « Mon espace consulat.ga » ;
 *  · `idn` — son compte est relié à identite.ga : ouvrir son espace, ou s'inscrire ;
 *  · `light` — compte léger (code par e-mail) ou adhésion en attente : les trois étapes.
 */
export type ConsulateGatewayState = "attested" | "idn" | "light"

export function consulateGatewayState(input: { readonly attestation: AttestationOutcome | "none"; readonly hasIdn: boolean; readonly status: MembershipStatus }): ConsulateGatewayState {
  if (input.attestation === "verified") return "attested"
  return input.hasIdn && input.status !== "en_attente" ? "idn" : "light"
}

/** Un clic simple ouvre-t-il la feuille ? La première fois seulement, et jamais pour un inscrit attesté. */
export function interceptsConsulateClick(state: ConsulateGatewayState, seen: boolean): boolean {
  return state !== "attested" && !seen
}

/** Préfixe `antsia:` : la déconnexion de partout du moteur oublie aussi ce choix. */
export const CONSULATE_GATEWAY_SEEN_KEY = "antsia:diaspora-ga:consulate-gateway:seen"

type DeviceStorage = Pick<Storage, "getItem" | "setItem">

/** Le stockage de ce navigateur, ou `null` (rendu serveur, stockage refusé). */
function deviceStorage(): DeviceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** La feuille a-t-elle déjà été montrée dans ce navigateur ? Lu au clic, jamais au rendu. */
export function consulateGatewaySeen(storage: DeviceStorage | null = deviceStorage()): boolean {
  try {
    return storage?.getItem(CONSULATE_GATEWAY_SEEN_KEY) === "1"
  } catch {
    return false
  }
}

/** Retient que la feuille a été montrée. Un stockage refusé ne retient rien : elle reviendra. */
export function rememberConsulateGatewaySeen(storage: DeviceStorage | null = deviceStorage()): void {
  try {
    storage?.setItem(CONSULATE_GATEWAY_SEEN_KEY, "1")
  } catch {
    // Stockage refusé : la feuille vaut pour cet affichage.
  }
}
