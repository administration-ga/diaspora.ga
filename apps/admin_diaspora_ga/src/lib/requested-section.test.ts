import { PERSONAL_STATE_STORAGE_PREFIXES } from "@antsia/api/sign-out-everywhere"
import { LayoutDashboard } from "lucide-react"
import { describe, expect, it } from "vitest"

import { REQUESTED_SECTION_KEY, rememberRequestedSection, type SectionStorage, takeRequestedSection } from "./requested-section"
import { routes } from "./routes"
import { type AdminSection, SECTIONS } from "./sections"

/** CH-815 A1b — la section demandée vit dans l'onglet, jamais dans une adresse (revue A1, F2). */
function memory(): SectionStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  }
}

/** Un stockage qui refuse tout (mode privé strict, quota). */
const refusing: SectionStorage = {
  getItem: () => {
    throw new Error("refusé")
  },
  setItem: () => {
    throw new Error("refusé")
  },
  removeItem: () => {
    throw new Error("refusé")
  },
}

const dashboard = SECTIONS[0]!
const journal: AdminSection = { id: "journal", group: "pilotage", href: routes.journal(), labelKey: "nav.section.journal", icon: LayoutDashboard }
const sections = [dashboard, journal]

describe("section demandée avant la connexion — gardée dans l'onglet, relue contre le registre", () => {
  it("une section du registre est retenue, puis reprise UNE fois et effacée", () => {
    const storage = memory()
    rememberRequestedSection("/journal", sections, storage)
    expect(storage.entries.get(REQUESTED_SECTION_KEY)).toBe("/journal")
    expect(takeRequestedSection(sections, storage)).toBe("/journal")
    expect(storage.entries.has(REQUESTED_SECTION_KEY)).toBe(false)
    expect(takeRequestedSection(sections, storage)).toBe(routes.dashboard())
  })

  it("le tableau de bord, une adresse inconnue ou absente ne sont pas retenus, et effacent ce qui l'était", () => {
    for (const requested of [routes.dashboard(), "/inconnue", "//ailleurs.exemple", "https://ailleurs.exemple/journal", undefined]) {
      const storage = memory()
      storage.entries.set(REQUESTED_SECTION_KEY, "/journal")
      rememberRequestedSection(requested, sections, storage)
      expect(storage.entries.has(REQUESTED_SECTION_KEY), String(requested)).toBe(false)
    }
  })

  it("une valeur posée par un autre code de l'origine n'est jamais suivie telle quelle : seul le registre compte", () => {
    for (const forged of ["//ailleurs.exemple", "https://ailleurs.exemple/journal", "/journal/../x", "/journal?retour=%2F%2Failleurs", "", "javascript:alert(1)"]) {
      const storage = memory()
      storage.entries.set(REQUESTED_SECTION_KEY, forged)
      expect(takeRequestedSection(sections, storage), forged).toBe(routes.dashboard())
      expect(storage.entries.has(REQUESTED_SECTION_KEY), forged).toBe(false)
    }
    // Une section absente du code (pas encore livrée) n'est pas rouverte.
    const storage = memory()
    storage.entries.set(REQUESTED_SECTION_KEY, routes.journal())
    expect(takeRequestedSection(SECTIONS, storage)).toBe(routes.dashboard())
  })

  it("un stockage refusé ou absent ne bloque rien : la connexion mène au tableau de bord", () => {
    expect(() => rememberRequestedSection("/journal", sections, refusing)).not.toThrow()
    expect(takeRequestedSection(sections, refusing)).toBe(routes.dashboard())
    expect(() => rememberRequestedSection("/journal", sections, null)).not.toThrow()
    expect(takeRequestedSection(sections, null)).toBe(routes.dashboard())
  })

  it("la clé porte le préfixe que « Se déconnecter partout » efface", () => {
    expect(PERSONAL_STATE_STORAGE_PREFIXES.some((prefix) => REQUESTED_SECTION_KEY.startsWith(prefix))).toBe(true)
    // Pas une préférence d'apparence (seules épargnées par la sortie de session).
    expect(REQUESTED_SECTION_KEY).not.toMatch(/:(?:appearance|theme)$/)
  })
})
