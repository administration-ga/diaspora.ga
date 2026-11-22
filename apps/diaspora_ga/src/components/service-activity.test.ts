import type { NetworkFeature } from "@diaspora-ga/features/data"
import { describe, expect, it } from "vitest"

import { ACTIVITY_TAB_FEATURES, ACTIVITY_TABS, activityTabOf, offeredActivityTabs } from "./service-activity"

/** Une garde dont seules ces clés sont ouvertes. */
const gate = (...open: NetworkFeature[]) => ({ isOpen: (feature: NetworkFeature) => open.includes(feature) })

describe("« Mes pages » — les onglets suivent les modules ouverts (CH-816, P0)", () => {
  it("chaque onglet relève d'un module : offres et demandes des services, emplois de l'emploi, pages des pages", () => {
    expect(ACTIVITY_TAB_FEATURES).toEqual({ offres: "services", demandes: "services", emplois: "jobs", pages: "pages" })
    expect(Object.keys(ACTIVITY_TAB_FEATURES).sort()).toEqual([...ACTIVITY_TABS].sort())
  })

  it.each([
    { open: [] as NetworkFeature[], offered: [] },
    { open: ["pages"] as NetworkFeature[], offered: ["pages"] },
    { open: ["pages", "pilotMetrics"] as NetworkFeature[], offered: ["pages"] },
    { open: ["pages", "services"] as NetworkFeature[], offered: ["offres", "demandes", "pages"] },
    { open: ["pages", "jobs"] as NetworkFeature[], offered: ["emplois", "pages"] },
    { open: ["pages", "services", "jobs"] as NetworkFeature[], offered: ["offres", "demandes", "emplois", "pages"] },
  ])("modules ouverts $open : onglets offerts $offered, dans l'ordre", ({ open, offered }) => {
    expect(offeredActivityTabs(gate(...open))).toEqual(offered)
  })

  it.each([
    { raw: null, offered: ["pages"] as const, shown: "pages" },
    { raw: "offres", offered: ["pages"] as const, shown: "pages" },
    { raw: "demandes", offered: ["pages"] as const, shown: "pages" },
    { raw: "emplois", offered: ["offres", "demandes", "pages"] as const, shown: "offres" },
    { raw: "inconnu", offered: ["offres", "demandes", "pages"] as const, shown: "offres" },
    { raw: null, offered: ["offres", "demandes", "pages"] as const, shown: "offres" },
    { raw: "demandes", offered: ["offres", "demandes", "pages"] as const, shown: "demandes" },
    { raw: "pages", offered: ["offres", "demandes", "pages"] as const, shown: "pages" },
  ])("l'adresse $raw parmi $offered montre « $shown »", ({ raw, offered, shown }) => {
    expect(activityTabOf(raw, offered)).toBe(shown)
  })

  it("aucun onglet offert : aucun onglet montré", () => {
    expect(activityTabOf("pages", [])).toBeNull()
    expect(activityTabOf(null, [])).toBeNull()
  })
})
