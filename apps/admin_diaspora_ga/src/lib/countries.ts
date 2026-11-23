/**
 * Les pays du réseau tels que la section « Pays ouverts » les lit et les règle (fiche CH-815 § 4.2,
 * lot A3 du moteur, suite : `diaspora/networkSettings.countries` et `setOpenCountry`, décision de
 * l'architecte du 23/11/2026) — module PUR : les seuils d'ouverture du domaine de DIASPORA.GA
 * (jamais réécrits ici), et les refus métier d'une ouverture, ensemble fermé, chacun avec sa phrase.
 */
import { engineErrorAppRule } from "@antsia/social-contracts/errors"
import type { api } from "@convex/_generated/api"
import { COUNTRY_OPENING_GAPS, COUNTRY_OPENING_REQUIREMENTS, type CountryOpeningGap } from "@diaspora-ga/domain"
import type { FunctionReturnType } from "convex/server"

/** Un pays du réseau pour son administration : ouverture, compteurs présentés, équipes du pays, modérateurs actifs, `canOpen`. */
export type CountryRow = FunctionReturnType<typeof api.modules.diaspora.networkSettings.countries>[number]

/** Les seuils d'ouverture d'un pays (cahier § 7, A8) : associations relais attestées, modérateurs actifs vérifiés. */
export const OPENING = COUNTRY_OPENING_REQUIREMENTS

/** Les refus d'une ouverture rendus par le moteur (`appRule`, refus `conflict`), et leur phrase dans l'espace `admin`. */
export const COUNTRY_REFUSAL_KEYS = {
  moderator_missing: "countries.refusal.moderatorMissing",
  relay_associations_missing: "countries.refusal.relayMissing",
} as const satisfies Record<CountryOpeningGap, `countries.refusal.${string}`>

/** Le refus d'une ouverture, s'il appartient à l'ensemble fermé du domaine ; ses paramètres numériques (le seuil requis). */
export function countryRefusalOf(error: unknown): { readonly key: (typeof COUNTRY_REFUSAL_KEYS)[CountryOpeningGap]; readonly params: Readonly<Record<string, number>> } | null {
  const refusal = engineErrorAppRule(error)
  const gap = COUNTRY_OPENING_GAPS.find((candidate) => candidate === refusal?.appRule)
  if (refusal === null || gap === undefined) return null
  return { key: COUNTRY_REFUSAL_KEYS[gap], params: refusal.appParams }
}

/** Un pays ouvert sans modérateur actif dans une équipe du pays : la lecture signale l'anomalie. */
export function openWithoutModerator(row: Pick<CountryRow, "open" | "canOpen">): boolean {
  return row.open && !row.canOpen
}
