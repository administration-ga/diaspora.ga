import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { LayoutDashboard } from "lucide-react"
import { describe, expect, it } from "vitest"

import { routes } from "./routes"
import { groupedSections, isSectionActive, returnPathFrom, SECTION_GROUPS, SECTIONS, sectionHrefOf, type AdminSection } from "./sections"

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

  it("avec le lot A5 : le tableau de bord (Pilotage), puis les modules et l'aperçu du menu (Application des membres)", () => {
    expect(SECTIONS.map((section) => section.id)).toEqual(["dashboard", "modules", "menuPreview"])
    expect(groupedSections().map((entry) => [entry.group, entry.sections.map((section) => section.href)])).toEqual([
      ["pilotage", [routes.dashboard()]],
      ["membersApp", [routes.modules(), routes.menuPreview()]],
    ])
  })

  it("ajouter une section, c'est une ligne : elle prend sa place dans son groupe, les groupes vides restent cachés", () => {
    const journal: AdminSection = { id: "journal", group: "pilotage", href: routes.journal(), labelKey: "nav.section.journal", icon: LayoutDashboard }
    const modules: AdminSection = { id: "modules", group: "membersApp", href: routes.modules(), labelKey: "nav.section.modules", icon: LayoutDashboard }
    const appeals: AdminSection = { id: "appeals", group: "trust", href: routes.appeals(), labelKey: "nav.section.appeals", icon: LayoutDashboard }
    const grouped = groupedSections([...SECTIONS, appeals, journal, modules])
    expect(grouped.map((entry) => entry.group)).toEqual(["pilotage", "membersApp", "trust"])
    expect(grouped[0]?.sections.map((section) => section.id)).toEqual(["dashboard", "journal"])
  })
})

describe("section courante et section à rouvrir", () => {
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

  it("seule une adresse du registre est rouverte ; tout le reste mène au tableau de bord", () => {
    const sections = [dashboard, journal]
    expect(returnPathFrom("?retour=%2Fjournal", sections)).toBe("/journal")
    for (const forged of ["?retour=%2F%2Failleurs.exemple", "?retour=https%3A%2F%2Failleurs.exemple%2Fjournal", "?retour=%2Fjournal%2F..%2Fx", "?retour=", "", "?autre=1"]) {
      expect(returnPathFrom(forged, sections), forged).toBe("/")
    }
    // Une section pas encore présente dans le code n'est pas rouverte.
    expect(returnPathFrom("?retour=%2Fjournal")).toBe("/")
  })

  it("la section d'une adresse, pour la renvoyer à l'entrée", () => {
    expect(sectionHrefOf("/journal/entree", [dashboard, journal])).toBe("/journal")
    expect(sectionHrefOf("/inconnue", [dashboard, journal])).toBeUndefined()
    expect(sectionHrefOf("/", [dashboard, journal])).toBe("/")
  })
})
