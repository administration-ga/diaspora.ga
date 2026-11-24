import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { describe, expect, it } from "vitest"

import { ROUTE_VIEWS, type RouteView } from "@/lib/route-views"

import { REPO_ROOT } from "./sources"

/**
 * Cliquet « une page = une vue » (décision du 24/11/2026, § 3 ; plan du lot 2, § 5) : chaque page
 * de l'application a sa nature, tenue par chemin de page dans `lib/route-views.ts` :
 *   · la table et le dossier `src/app` concordent, ligne pour ligne ;
 *   · la liste des pages en attente ne peut que rétrécir : une page neuve ne naît pas `pending` ;
 *   · une page `view` monte un écran qui demande la vue à sa coque (`layout="view"`), et aucun
 *     écran d'une page `stream` ou `pending` ne la demande.
 */
const APP = join(REPO_ROOT, "apps/diaspora_ga/src/app")
const SCREENS = join(REPO_ROOT, "apps/diaspora_ga/src/screens")

/**
 * Les pages en attente de leur lot au 24/11/2026 (plan du lot 2, § 5). Cette liste ne s'allonge
 * jamais : une page qui passe `view`, `stream` ou `reference` en sort, une page neuve n'y entre pas.
 */
const PENDING_BASELINE: ReadonlySet<string> = new Set([
  "/mes-donnees",
  "/moderation",
  "/mon-activite",
  "/mon-activite/demandes/[requestId]",
  "/mes-demandes",
  "/mes-demandes/[requestId]",
  "/mes-associations",
  "/mes-candidatures",
  "/mes-mentorats",
  "/parrainer",
  "/verification",
  "/nouvelle-page",
  "/pages/[handle]/gerer",
  "/pages/[handle]/adherents",
  "/pages/[handle]/revendiquer",
  "/pages/[handle]/evenements/[eventId]",
  "/services/[offerId]",
  "/emploi/[jobId]",
  "/entraide/[itemId]",
  "/mentorat/[mentorId]",
  "/kit-arrivee/[resourceId]",
  "/messages/[[...chemin]]",
  "/actus/[[...chemin]]",
  "/direct/[id]",
])

/** Les fichiers `page.tsx` du dossier des routes. */
function pageFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name)
    if (statSync(full).isDirectory()) return pageFiles(full)
    return name === "page.tsx" ? [full] : []
  })
}

/** Le chemin d'une page tel que la table le tient : son dossier sous `src/app`, `/` pour la porte. */
function pagePath(file: string): string {
  const folder = relative(APP, join(file, ".."))
  return folder === "" ? "/" : `/${folder.split(sep).join("/")}`
}

const PAGES = new Map(pageFiles(APP).map((file) => [pagePath(file), file]))

/** Les écrans que monte une page (`@/screens/…`), lus sur le disque. */
function screensOf(page: string): { readonly name: string; readonly text: string }[] {
  const source = readFileSync(PAGES.get(page)!, "utf8")
  return [...source.matchAll(/from\s+["']@\/screens\/([\w-]+)["']/g)].map((match) => {
    const name = match[1]!
    const file = join(SCREENS, `${name}.tsx`)
    return { name, text: existsSync(file) ? readFileSync(file, "utf8") : "" }
  })
}

const pagesOfKind = (kind: RouteView) => Object.entries(ROUTE_VIEWS).filter(([, view]) => view === kind).map(([page]) => page)
const ASKS_VIEW = 'layout="view"'

describe("cliquet « une page = une vue » — la nature de chaque page", () => {
  it("relit bien le dossier des routes", () => {
    expect(PAGES.size).toBeGreaterThan(50)
    expect(PAGES.has("/")).toBe(true)
    expect(PAGES.has("/parametres")).toBe(true)
  })

  it("chaque page a sa ligne dans la table, et chaque ligne a sa page", () => {
    expect([...PAGES.keys()].filter((page) => !(page in ROUTE_VIEWS)).sort()).toEqual([])
    expect(Object.keys(ROUTE_VIEWS).filter((page) => !PAGES.has(page)).sort()).toEqual([])
  })

  it("les pages en attente ne font que diminuer : aucune hors de la liste du 24/11", () => {
    expect(pagesOfKind("pending").filter((page) => !PENDING_BASELINE.has(page))).toEqual([])
  })

  it("une page `view` monte un écran qui demande la vue à sa coque", () => {
    const views = pagesOfKind("view")
    expect(views).toContain("/parametres")
    const missing = views.filter((page) => {
      const screens = screensOf(page)
      return screens.length === 0 || !screens.some((screen) => screen.text.includes(ASKS_VIEW))
    })
    expect(missing).toEqual([])
  })

  it("aucun écran d'une page de flux ou en attente ne demande la vue", () => {
    const offenders = [...pagesOfKind("stream"), ...pagesOfKind("pending")].flatMap((page) =>
      screensOf(page)
        .filter((screen) => screen.text.includes(ASKS_VIEW))
        .map((screen) => `${page} → screens/${screen.name}.tsx`),
    )
    expect(offenders).toEqual([])
  })
})
