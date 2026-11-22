/**
 * Les onglets de « Mes pages » (`/mon-activite?onglet=…`), module pur : lu par
 * l'écran, par les cliquets i18n et par les tests, sans rien monter de React.
 * Mêmes valeurs que `routes.myActivity(tab)`.
 */
import type { FeatureGate, NetworkFeature } from "@diaspora-ga/features/data"

// « emplois » (DG-025) : les offres d'emploi et candidatures des pages employeuses.
export const ACTIVITY_TABS = ["offres", "demandes", "emplois", "pages"] as const
export type ActivityTab = (typeof ACTIVITY_TABS)[number]

/**
 * Le module dont relève chaque onglet (ADR-0041 du moteur) : fermé, l'onglet n'est
 * pas offert — ni onglet, ni écran « indisponible ». Les offres et les demandes
 * relèvent des services, les emplois de l'emploi, les pages des pages.
 */
export const ACTIVITY_TAB_FEATURES = {
  offres: "services",
  demandes: "services",
  emplois: "jobs",
  pages: "pages",
} as const satisfies Readonly<Record<ActivityTab, NetworkFeature>>

/** Les onglets offerts, dans l'ordre de `ACTIVITY_TABS` : ceux dont le module est ouvert. */
export function offeredActivityTabs(gate: Pick<FeatureGate, "isOpen">): readonly ActivityTab[] {
  return ACTIVITY_TABS.filter((tab) => gate.isOpen(ACTIVITY_TAB_FEATURES[tab]))
}

/**
 * L'onglet montré : celui que nomme l'adresse s'il est offert, sinon le premier
 * offert (inconnu, absent ou module fermé : la même réponse) ; aucun offert : `null`.
 */
export function activityTabOf(raw: string | null, offered: readonly ActivityTab[]): ActivityTab | null {
  return offered.find((tab) => tab === raw) ?? offered[0] ?? null
}
