import { createEngineNextConfig } from "@antsia/api/next-config"
import type { NextConfig } from "next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * CH-815 A1b — `Referrer-Policy: no-referrer` sur TOUTES les routes d'admin.diaspora.ga
 * (revue A1, F2 : l'adresse de retour d'IDN porte le jeton à usage unique), les autres
 * en-têtes de sécurité du moteur (CSP comprise) gardés tels quels et dans leur ordre.
 * Configuration lue en mode production : aucun fichier d'environnement n'est lu.
 */
type HeaderRules = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>

async function rulesOf(config: NextConfig): Promise<HeaderRules> {
  return (await config.headers?.()) ?? []
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://moteur-essai.convex.cloud")
  vi.stubEnv("CONVEX_SITE_URL", "https://moteur-essai.convex.site")
  vi.resetModules()
})
afterEach(() => vi.unstubAllEnvs())

async function appConfig(): Promise<NextConfig> {
  return (await import("../../next.config")).default
}

describe("en-têtes d'admin.diaspora.ga — aucun Referer", () => {
  it("une règle couvre toutes les routes, et chaque règle porte `Referrer-Policy: no-referrer`, une seule fois", async () => {
    const rules = await rulesOf(await appConfig())
    expect(rules.some((rule) => rule.source === "/(.*)" && rule.has === undefined && rule.missing === undefined)).toBe(true)
    for (const rule of rules) {
      const policies = rule.headers.filter((header) => header.key.toLowerCase() === "referrer-policy")
      expect(policies, rule.source).toEqual([{ key: "Referrer-Policy", value: "no-referrer" }])
    }
  })

  it("les autres en-têtes du moteur restent identiques (CSP, nosniff, cadres, permissions, HSTS)", async () => {
    const engine = await rulesOf(createEngineNextConfig({ appDir: process.cwd(), transpilePackages: ["@diaspora-ga/domain", "@diaspora-ga/features"] }))
    const app = await rulesOf(await appConfig())
    const withoutReferrer = (rules: HeaderRules) =>
      rules.map((rule) => ({ ...rule, headers: rule.headers.filter((header) => header.key.toLowerCase() !== "referrer-policy") }))
    expect(withoutReferrer(app)).toEqual(withoutReferrer(engine))
    const keys = app.flatMap((rule) => rule.headers.map((header) => header.key))
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(keys, key).toContain(key)
    }
    // La politique est REMPLACÉE à sa place, pas ajoutée en double après celle du moteur.
    const engineOrder = engine[0]!.headers.map((header) => header.key)
    expect(app[0]!.headers.map((header) => header.key)).toEqual(engineOrder)
  })

  it("le reste de la configuration commune est inchangé", async () => {
    const engine = createEngineNextConfig({ appDir: process.cwd(), transpilePackages: ["@diaspora-ga/domain", "@diaspora-ga/features"] })
    const { headers: _appHeaders, ...app } = await appConfig()
    const { headers: _engineHeaders, ...rest } = engine
    expect(app).toEqual(rest)
  })
})
