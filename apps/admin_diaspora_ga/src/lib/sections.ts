import { Blocks, LayoutDashboard, MonitorSmartphone, type LucideIcon } from "lucide-react"

import { routes } from "./routes"

/**
 * Le registre des sections de l'administration (fiche CH-815 § 4.2) : le menu est du
 * code (D4), il n'accorde aucun droit, et il ne montre que ce qui EXISTE. Chaque lot
 * ajoute sa section ici en une ligne (groupe, adresse de la table des routes, clé
 * i18n, icône lucide), avec sa page sous `src/app/(console)/` ; un test vérifie que
 * le registre et les pages se répondent exactement.
 */
export const SECTION_GROUPS = ["pilotage", "membersApp", "community", "trust"] as const
export type SectionGroup = (typeof SECTION_GROUPS)[number]

/** Le libellé de chaque groupe, en toutes lettres (cliquet des clés). */
export const SECTION_GROUP_KEYS: Readonly<Record<SectionGroup, string>> = {
  pilotage: "nav.group.pilotage",
  membersApp: "nav.group.membersApp",
  community: "nav.group.community",
  trust: "nav.group.trust",
}

export interface AdminSection {
  readonly id: string
  readonly group: SectionGroup
  /** Une adresse de `routes.ts`, jamais écrite ici. */
  readonly href: string
  /** Clé de l'espace de noms `admin`, citée en toutes lettres (cliquet des clés). */
  readonly labelKey: `nav.section.${string}`
  readonly icon: LucideIcon
}

/** Les sections présentes dans le code, dans l'ordre du menu. */
export const SECTIONS: readonly AdminSection[] = [
  { id: "dashboard", group: "pilotage", href: routes.dashboard(), labelKey: "nav.section.dashboard", icon: LayoutDashboard },
  // Application des membres (lot A5) : les modules, puis l'aperçu du menu qu'ils composent.
  { id: "modules", group: "membersApp", href: routes.modules(), labelKey: "nav.section.modules", icon: Blocks },
  { id: "menuPreview", group: "membersApp", href: routes.menuPreview(), labelKey: "nav.section.menuPreview", icon: MonitorSmartphone },
]

export interface SectionGroupEntries {
  readonly group: SectionGroup
  readonly sections: readonly AdminSection[]
}

/** Les groupes du menu, dans leur ordre ; un groupe sans section présente n'est pas affiché. */
export function groupedSections(sections: readonly AdminSection[] = SECTIONS): SectionGroupEntries[] {
  return SECTION_GROUPS.map((group) => ({ group, sections: sections.filter((section) => section.group === group) })).filter(
    (entry) => entry.sections.length > 0,
  )
}

/** La section courante : le tableau de bord à la racine seulement, une autre section sur son adresse et en dessous. */
export function isSectionActive(section: AdminSection, pathname: string | null): boolean {
  if (pathname === null) return false
  if (section.href === routes.dashboard()) return pathname === section.href
  return pathname === section.href || pathname.startsWith(`${section.href}/`)
}

/** La section qui porte une adresse du registre (retenue avant la page d'entrée), sinon `undefined`. */
export function sectionHrefOf(pathname: string | null, sections: readonly AdminSection[] = SECTIONS): string | undefined {
  return sections.find((section) => isSectionActive(section, pathname))?.href
}
