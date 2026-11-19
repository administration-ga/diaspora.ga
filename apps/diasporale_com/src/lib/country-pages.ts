/**
 * Les pages d'un pays montrées dans le rail du fil, comme le rail des pages du réseau
 * de l'administration (`PagesSuggestionsRail`) : un aperçu borné, jamais un annuaire.
 * PROPRIÉTAIRE : chantier « pages ».
 *
 * Les pages officielles d'abord (la confiance la plus haute), puis associations et
 * entreprises en alternance, pour que l'une ne masque pas l'autre. Règle pure.
 */
import type { PageView } from "@diasporale/features/data"

/** Les pages montrées au plus dans le rail. */
export const RAIL_PAGES_MAX = 4

export interface CountryPagesLists {
  readonly officialPages: readonly PageView[]
  readonly associations: readonly PageView[]
  readonly companies: readonly PageView[]
}

export function countryPagesPreview(lists: CountryPagesLists, max: number = RAIL_PAGES_MAX): readonly PageView[] {
  const preview: PageView[] = [...lists.officialPages]
  const longest = Math.max(lists.associations.length, lists.companies.length)
  for (let index = 0; index < longest; index += 1) {
    const association = lists.associations[index]
    const company = lists.companies[index]
    if (association) preview.push(association)
    if (company) preview.push(company)
  }
  // Une même page ne paraît qu'une fois, quelle que soit la liste qui la porte.
  const seen = new Set<string>()
  const unique = preview.filter((page) => {
    if (seen.has(page.id)) return false
    seen.add(page.id)
    return true
  })
  return unique.slice(0, Math.max(0, max))
}
