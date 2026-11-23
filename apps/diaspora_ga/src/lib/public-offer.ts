/**
 * Ce que la page d'entrée publique ANNONCE (CH-816) — module PUR, déclaration de l'application.
 *
 * Décision du propriétaire du 22/11/2026 : « accorder la page d'entrée aux modules ouverts, en
 * retirant ce qui est fermé ». Le réseau démarre simple (ADR-0041 du moteur) : le socle (le fil,
 * la recherche des membres, la messagerie iCom, les actus des pays) est servi d'emblée ; les huit
 * modules activables restent fermés tant que l'administration du réseau ne les a pas ouverts. Au
 * lancement, seules les pages le sont.
 *
 * Pourquoi une DÉCLARATION et non une lecture : la page d'entrée se lit sans session. Savoir quels
 * modules sont ouverts demande une adhésion, et aucune projection publique n'est ajoutée au moteur
 * pour le dire. Ce que la page annonce est donc écrit ici, tenu d'accord avec ce que
 * l'administration a ouvert : quand elle ouvre un module, on ajoute sa ligne et on republie.
 * Même règle pour la vérification consulaire : tant que le contrat d'attestation avec consulat.ga
 * n'est pas en service, la page ne la présente pas comme disponible.
 *
 * Rien n'est retiré : les cartes des modules fermés restent écrites (textes fr et en) et citées par
 * la vision sous la porte, qui ne les rend pas. Chaque carte relève du socle (`null`) ou d'UN seul
 * module ; les mesures du pilote, réservées à l'équipe, n'en ont aucune.
 *
 * Qui lit cette déclaration : la vision sous la porte (`components/door-vision.tsx`) et la carte
 * d'inscription de la porte (`screens/landing-screen.tsx`).
 */
import type { NetworkFeature } from "@diaspora-ga/features/data"

/** Les modules que la page d'entrée annonce : ceux que l'administration du réseau a ouverts. */
export const ANNOUNCED_FEATURES: readonly NetworkFeature[] = ["pages"]

/** La page présente-t-elle la vérification par consulat.ga comme disponible ? Pas avant le contrat. */
export const CONSULAR_ATTESTATION_ANNOUNCED: boolean = false

export type OfferCardId =
  | "country"
  | "people"
  | "pages"
  | "groupsAndEvents"
  | "services"
  | "jobs"
  | "mutualAid"
  | "mentoring"
  | "arrivalKit"
  | "contact"

/** Une carte de « Ce que vous y trouvez » : le socle (`feature: null`) ou un seul module. */
export interface OfferCard {
  readonly id: OfferCardId
  readonly feature: NetworkFeature | null
}

/** Toutes les cartes, dans l'ordre d'affichage. */
export const OFFER_CARDS: readonly OfferCard[] = [
  { id: "country", feature: null },
  { id: "people", feature: null },
  { id: "pages", feature: "pages" },
  { id: "groupsAndEvents", feature: "groupsAndEvents" },
  { id: "services", feature: "services" },
  { id: "jobs", feature: "jobs" },
  { id: "mutualAid", feature: "mutualAid" },
  { id: "mentoring", feature: "mentoring" },
  { id: "arrivalKit", feature: "arrivalKit" },
  { id: "contact", feature: null },
]

/**
 * Les cartes à montrer, dans l'ordre d'affichage : celles du socle, et celles des modules annoncés.
 * L'ordre de la déclaration ne compte pas ; un module inconnu ou cité deux fois ne change rien.
 */
export function announcedOfferCards(announced: readonly NetworkFeature[] = ANNOUNCED_FEATURES): readonly OfferCard[] {
  return OFFER_CARDS.filter((card) => card.feature === null || announced.includes(card.feature))
}
