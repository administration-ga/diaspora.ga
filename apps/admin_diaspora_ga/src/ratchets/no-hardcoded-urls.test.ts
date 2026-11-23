// Dupliqué de apps/diaspora_ga/src/ratchets/no-hardcoded-urls.test.ts @ 237b585 — adaptations : sources et table des routes d'admin.diaspora.ga.
import { describe, expect, it } from "vitest"

import { detectHardcodedUrls } from "./hardcoded-urls"
import { productSources } from "./sources"

/**
 * Cliquet « aucune adresse en dur » d'admin.diaspora.ga : l'application passe par la
 * table des routes et par l'environnement. La table des routes est le SEUL fichier où
 * une route s'écrit (contrat CH-815, section « Application »).
 */
const ROUTE_TABLE = "apps/admin_diaspora_ga/src/lib/routes.ts"

describe("cliquet adresses — aucune route ni URL écrite en dur dans admin.diaspora.ga", () => {
  const all = productSources([".ts", ".tsx"])
  const files = all.filter((file) => file.path !== ROUTE_TABLE)

  it("relit bien l'application, table des routes comprise", () => {
    expect(all.some((file) => file.path === ROUTE_TABLE)).toBe(true)
    expect(files.some((file) => file.path.endsWith("components/admin-shell.tsx"))).toBe(true)
    expect(files.length).toBeGreaterThan(15)
  })

  it("le cliquet sait reconnaître un lien, une navigation, une propriété de route et une URL absolue", () => {
    const source = [
      '<Link href="/journal" />',
      'router.replace("/entrer")',
      'const link = { href: "/modules" }',
      'const api = "https://exemple.org/api"',
      '<Link href={routes.journal()} />',
    ].join("\n")
    const lines = detectHardcodedUrls("apps/admin_diaspora_ga/src/a.tsx", source).map((finding) => Number(finding.split(":")[1]?.split(" ")[0]))
    expect(lines).toEqual([1, 2, 3, 4])
  })

  it("aucune route ni URL absolue hors de la table des routes", () => {
    expect(files.flatMap((file) => detectHardcodedUrls(file.path, file.text))).toEqual([])
  })
})
