import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { LayoutDashboard } from "lucide-react"
import { describe, expect, it } from "vitest"

import { routes } from "./routes"
import { groupedSections, isSectionActive, SECTION_GROUPS, SECTIONS, sectionHrefOf, type AdminSection } from "./sections"

/** Le dossier du gabarit gardé : une page par section, et une section par page. */
const CONSOLE_DIR = fileURLToPath(new URL("../app/(console)", import.meta.url))

function pagesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name)
    if (statSync(full).isDirectory()) return pagesUnder(full)
    return name === "page.tsx" ? [full] : []
  })
}

/** L'adresse servie par une page du groupe `(console)` (le groupe ne compte pas dans l'adresse). */
function hrefOfPage(page: string): string {
  const segments = relative(CONSOLE_DIR, page).split(sep).slice(0, -1)
  return `/${segments.join("/")}`
}

describe("registre des sections — le menu ne montre que ce qui existe", () => {
  it("chaque section du registre a sa page sous le gabarit gardé, et chaque page y a sa section", () => {
    const pages = pagesUnder(CONSOLE_DIR).map(hrefOfPage).sort()
    expect(SECTIONS.map((section) => section.href).sort()).toEqual(pages)
    for (const section of SECTIONS) {
      const page = section.href === routes.dashboard() ? join(CONSOLE_DIR, "page.tsx") : join(CONSOLE_DIR, ...section.href.slice(1).split("/"), "page.tsx")
      expect(existsSync(page), section.id).toBe(true)
    }
  })

  it("chaque section vient de la table des routes, sans doublon, dans un groupe connu", () => {
    const declared = new Set(Object.values(routes).map((route) => (typeof route === "function" && route.length === 0 ? (route as () => string)() : null)))
    expect(new Set(SECTIONS.map((section) => section.id)).size).toBe(SECTIONS.length)
    for (const section of SECTIONS) {
      expect(declared.has(section.href), section.id).toBe(true)
      expect(SECTION_GROUPS).toContain(section.group)
    }
  })

  it("avec le lot A7 : tableau de bord, mesure et journal (Pilotage), modules et aperçu (Application des membres), institutions, fondateurs et pays (Communauté), recours, équipe et règles (Confiance)", () => {
    expect(SECTIONS.map((section) => section.id)).toEqual(["dashboard", "metrics", "journal", "modules", "menuPreview", "institutions", "founders", "countries", "appeals", "team", "rules"])
    expect(groupedSections().map((entry) => [entry.group, entry.sections.map((section) => section.href)])).toEqual([
      ["pilotage", [routes.dashboard(), routes.metrics(), routes.journal()]],
      ["membersApp", [routes.modules(), routes.menuPreview()]],
      ["community", [routes.institutions(), routes.founders(), routes.countries()]],
      ["trust", [routes.appeals(), routes.team(), routes.rules()]],
    ])
  })

  it("ajouter une section, c'est une ligne : elle prend sa place dans son groupe, les groupes vides restent cachés", () => {
    const journal: AdminSection = { id: "journal", group: "pilotage", href: routes.journal(), labelKey: "nav.section.journal", icon: LayoutDashboard }
    const modules: AdminSection = { id: "modules", group: "membersApp", href: routes.modules(), labelKey: "nav.section.modules", icon: LayoutDashboard }
    const appeals: AdminSection = { id: "appeals", group: "trust", href: routes.appeals(), labelKey: "nav.section.appeals", icon: LayoutDashboard }
    const base = SECTIONS.filter((section) => section.id === "dashboard")
    const grouped = groupedSections([...base, appeals, journal, modules])
    expect(grouped.map((entry) => entry.group)).toEqual(["pilotage", "membersApp", "trust"])
    expect(grouped[0]?.sections.map((section) => section.id)).toEqual(["dashboard", "journal"])
  })
})

describe("section courante et section d'une adresse", () => {
  const dashboard = SECTIONS[0]!
  const journal: AdminSection = { id: "journal", group: "pilotage", href: routes.journal(), labelKey: "nav.section.journal", icon: LayoutDashboard }

  it("le tableau de bord n'est courant qu'à la racine ; une section l'est sur son adresse et en dessous", () => {
    expect(isSectionActive(dashboard, "/")).toBe(true)
    expect(isSectionActive(dashboard, "/journal")).toBe(false)
    expect(isSectionActive(journal, "/journal")).toBe(true)
    expect(isSectionActive(journal, "/journal/entree")).toBe(true)
    expect(isSectionActive(journal, "/journaux")).toBe(false)
    expect(isSectionActive(journal, null)).toBe(false)
  })

  it("la section d'une adresse, pour la renvoyer à l'entrée", () => {
    expect(sectionHrefOf("/journal/entree", [dashboard, journal])).toBe("/journal")
    expect(sectionHrefOf("/inconnue", [dashboard, journal])).toBeUndefined()
    expect(sectionHrefOf("/", [dashboard, journal])).toBe("/")
  })
})
