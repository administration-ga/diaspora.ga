import { describe, expect, test } from "bun:test"

// La vraie politique de sécurité des applications du moteur : le contrôle lit ce format-là.
import { buildContentSecurityPolicy } from "../../ANTSIA/packages/api/csp.mjs"
import { checkRelease, checkSuccessLine, cspSources, evaluateEngineTarget, evaluateHealth, evaluateHealthText, parseCheckArgs } from "./release-check.mjs"

/** Valeurs FICTIVES (domaines réservés à la documentation, RFC 2606) : aucune ressource réelle. */
const SITE = "https://site-demo.example.org"
const ENGINE = "https://moteur-demo.example.net"
const VERSION = "diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-demo"
const report = (overrides = {}) => ({ status: "ok", application: "diaspora-ga", version: VERSION, backend: "configured", dataSource: "engine", engine: "reachable", ...overrides })
const productionCsp = (convexUrl) => buildContentSecurityPolicy({ convexUrl, isDev: false })

describe("ligne de commande", () => {
  test("une cible et une étiquette de la même cible", () => {
    expect(parseCheckArgs(["--target", "demo", "--version", VERSION])).toEqual({ target: "demo", version: VERSION, problems: [] })
    expect(parseCheckArgs(["--target", "production", "--version", VERSION]).problems).toEqual(["--version désigne une autre cible que --target"])
    expect(parseCheckArgs(["--target", "demo", "--version", "main-abc"]).problems).toEqual(["--version doit être une étiquette diaspora-ga-<12>-antsia-<12>-<cible>"])
    expect(parseCheckArgs([]).problems).toEqual(["--target doit valoir demo ou production", "--version doit être une étiquette diaspora-ga-<12>-antsia-<12>-<cible>"])
  })
})

describe("rapport de la sonde (LX-01)", () => {
  test("un rapport conforme n'a aucun écart", () => {
    expect(evaluateHealth(report(), { version: VERSION })).toEqual([])
  })

  test("chaque écart se dit : application, état, version, source, moteur", () => {
    expect(evaluateHealth(report({ application: "antsia-ga" }), { version: VERSION })).toEqual(["la sonde n'est pas celle de diaspora-ga"])
    expect(evaluateHealth(report({ status: "degraded", engine: "unreachable" }), { version: VERSION })).toEqual([
      "état dégradé : le service ne peut pas servir ses données",
      "moteur injoignable depuis le site",
    ])
    expect(evaluateHealth(report({ version: "dev" }), { version: VERSION })).toEqual([`version servie « dev », attendue « ${VERSION} »`])
    expect(evaluateHealth(report({ dataSource: "demo", engine: "not_checked" }), { version: VERSION })).toEqual([
      "source de données autre que « engine » : un site publié sert le moteur, jamais les données fictives",
      "moteur injoignable depuis le site",
    ])
    expect(evaluateHealth(report({ backend: "missing" }), { version: VERSION })).toEqual(["adresse du moteur absente de la construction"])
  })

  test("sans version attendue, la version n'est pas comparée (relevé avant publication)", () => {
    expect(evaluateHealth(report({ version: "autre" }), { version: null })).toEqual([])
  })

  test("une réponse qui n'est pas un rapport est un écart", () => {
    expect(evaluateHealth(null, { version: VERSION })).toEqual(["la sonde ne rend pas un rapport lisible"])
    expect(evaluateHealthText("<html>Authentification requise</html>", { version: VERSION })).toEqual(["réponse de la sonde illisible (pas du JSON)"])
    expect(evaluateHealthText(JSON.stringify(report()), { version: VERSION })).toEqual([])
  })
})

describe("moteur visé, lu dans la politique de sécurité", () => {
  test("lit les sources d'une directive", () => {
    expect(cspSources("default-src 'self'; connect-src 'self' https://a.example wss://a.example", "connect-src")).toEqual(["'self'", "https://a.example", "wss://a.example"])
    expect(cspSources("default-src 'self'", "connect-src")).toEqual([])
    expect(cspSources(null, "connect-src")).toEqual([])
  })

  test("la politique réelle du moteur, construite pour le moteur de la cible, est conforme", () => {
    expect(evaluateEngineTarget(productionCsp("https://moteur-demo.convex.cloud"), "https://moteur-demo.convex.cloud", "DIASPORA_GA_DEMO_CONVEX_URL")).toEqual([])
    expect(evaluateEngineTarget(productionCsp(ENGINE), ENGINE, "DIASPORA_GA_DEMO_CONVEX_URL")).toEqual([])
  })

  test("un site construit pour un autre moteur est signalé, en nommant la variable", () => {
    const csp = productionCsp("https://moteur-production.convex.cloud")
    expect(evaluateEngineTarget(csp, "https://moteur-demo.convex.cloud", "DIASPORA_GA_DEMO_CONVEX_URL")).toEqual([
      "la politique de sécurité n'autorise pas le moteur de DIASPORA_GA_DEMO_CONVEX_URL",
      "la politique de sécurité autorise 2 origine(s) d'un autre moteur que celui de DIASPORA_GA_DEMO_CONVEX_URL",
    ])
  })

  test("un moteur de trop, ou une politique absente, sont des écarts", () => {
    const csp = productionCsp("https://moteur-demo.convex.cloud").replace("connect-src 'self'", "connect-src 'self' https://autre.convex.cloud")
    expect(evaluateEngineTarget(csp, "https://moteur-demo.convex.cloud", "DIASPORA_GA_DEMO_CONVEX_URL")).toEqual([
      "la politique de sécurité autorise 1 origine(s) d'un autre moteur que celui de DIASPORA_GA_DEMO_CONVEX_URL",
    ])
    expect(evaluateEngineTarget(null, ENGINE, "DIASPORA_GA_DEMO_CONVEX_URL")).toEqual(["en-tête Content-Security-Policy absent : le moteur visé ne se vérifie pas"])
  })
})

describe("contrôle d'une version servie", () => {
  const respond = (body, csp = productionCsp(ENGINE)) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: csp ? { "content-security-policy": csp } : {} })

  test("lit la sonde du site, sans cache et sans suivre de redirection", async () => {
    const requests = []
    const fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      return respond(report())
    }
    expect(await checkRelease({ target: "demo", siteUrl: SITE, convexUrl: ENGINE, version: VERSION, fetch })).toEqual({ ok: true, problems: [], report: report(), attempts: 1 })
    expect(requests).toEqual([{ url: `${SITE}/api/sante-fonctionnelle`, init: { cache: "no-store", redirect: "error", headers: { accept: "application/json" } } }])
  })

  test("réessaie le temps que la bascule se propage, puis conclut", async () => {
    const answers = [respond(report({ version: "ancienne" })), respond(report())]
    const pauses = []
    const result = await checkRelease({ target: "demo", siteUrl: SITE, convexUrl: ENGINE, version: VERSION, fetch: async () => answers.shift(), attempts: 3, delayMs: 10, sleep: async (ms) => pauses.push(ms) })
    expect(result).toMatchObject({ ok: true, attempts: 2 })
    expect(pauses).toEqual([10])
  })

  test("un écart persistant échoue avec ses raisons ; la politique compte autant que la sonde", async () => {
    const result = await checkRelease({ target: "demo", siteUrl: SITE, convexUrl: ENGINE, version: VERSION, fetch: async () => respond(report(), null), attempts: 2 })
    expect(result).toEqual({ ok: false, problems: ["en-tête Content-Security-Policy absent : le moteur visé ne se vérifie pas"], report: report(), attempts: 2 })
    expect((await checkRelease({ target: "demo", siteUrl: SITE, convexUrl: ENGINE, version: VERSION, fetch: async () => respond("<html>") })).problems).toEqual([
      "réponse de la sonde illisible (pas du JSON)",
    ])
  })

  test("un site injoignable se dit sans recopier l'erreur, qui peut citer une adresse", async () => {
    const result = await checkRelease({
      target: "production",
      siteUrl: SITE,
      convexUrl: ENGINE,
      version: VERSION,
      fetch: async () => {
        throw new Error(`getaddrinfo ENOTFOUND ${SITE}`)
      },
    })
    expect(result).toEqual({ ok: false, problems: ["site de DIASPORA_GA_PRODUCTION_SITE_URL injoignable"], report: null, attempts: 1 })
  })
})

// ═══════════════════════════════════════════════════════════════
// admin.diaspora.ga (CH-815, lot A8) : sa sonde, son site
// ═══════════════════════════════════════════════════════════════

const ADMIN = "admin_diaspora_ga"
const ADMIN_SITE = "https://admin-demo.example.org"
const ADMIN_VERSION = "admin-diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-demo"
/**
 * La forme que rend la sonde commune du moteur (`createHealthProbe`, packages/api/src/health.ts
 * d'ANTSIA), celle de la console et d'admin.diaspora.ga : l'état du moteur est un objet.
 */
const adminReport = (overrides = {}, engine = {}) => ({
  status: "ok",
  application: "admin-diaspora-ga",
  version: ADMIN_VERSION,
  backend: "configured",
  engine: { state: "reachable", version: null, serverTime: "2026-11-23T08:00:00.000Z", latencyMs: 40, ...engine },
  ...overrides,
})

describe("ligne de commande --app", () => {
  test("admin.diaspora.ga se contrôle par son étiquette ; sans --app, rien ne change", () => {
    expect(parseCheckArgs(["--app", ADMIN, "--target", "demo", "--version", ADMIN_VERSION])).toEqual({ app: ADMIN, target: "demo", version: ADMIN_VERSION, problems: [] })
    expect(parseCheckArgs(["--target", "demo", "--version", VERSION]).app).toBeUndefined()
    expect(parseCheckArgs(["--app", "diaspora_ga", "--target", "demo", "--version", VERSION])).toEqual({ app: "diaspora_ga", target: "demo", version: VERSION, problems: [] })
  })

  test("une étiquette de l'autre application, all ou une application inconnue sont refusés", () => {
    expect(parseCheckArgs(["--target", "demo", "--version", ADMIN_VERSION]).problems).toEqual(["--version désigne une autre application que --app : admin_diaspora_ga, pas diaspora_ga"])
    expect(parseCheckArgs(["--app", ADMIN, "--target", "demo", "--version", VERSION]).problems).toEqual(["--version désigne une autre application que --app : diaspora_ga, pas admin_diaspora_ga"])
    expect(parseCheckArgs(["--app", "all", "--target", "demo", "--version", VERSION]).problems).toEqual([
      "--app all ne vaut que pour la publication : chaque application se contrôle et se remet en arrière par sa propre commande",
    ])
    expect(parseCheckArgs(["--app", "console", "--target", "demo", "--version", VERSION]).problems).toEqual([
      "--app inconnue (« console ») : valeurs admises diaspora_ga (par défaut), admin_diaspora_ga",
    ])
  })
})

describe("sonde d'admin.diaspora.ga", () => {
  test("un rapport conforme de la sonde commune n'a aucun écart ; aucune source de données n'est exigée", () => {
    expect(evaluateHealth(adminReport(), { version: ADMIN_VERSION, app: ADMIN })).toEqual([])
    expect(evaluateHealth(adminReport({ dataSource: "engine" }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([])
    expect(evaluateHealthText(JSON.stringify(adminReport()), { version: ADMIN_VERSION, app: ADMIN })).toEqual([])
  })

  test("chaque écart se dit : application, version, données fictives, moteur lent, injoignable ou illisible", () => {
    expect(evaluateHealth(adminReport({ application: "diaspora-ga" }), { version: ADMIN_VERSION, app: ADMIN })).toEqual(["la sonde n'est pas celle de admin-diaspora-ga"])
    expect(evaluateHealth(adminReport({ version: VERSION }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([`version servie « ${VERSION} », attendue « ${ADMIN_VERSION} »`])
    expect(evaluateHealth(adminReport({ dataSource: "demo" }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([
      "source de données autre que « engine » : un site publié sert le moteur, jamais les données fictives",
    ])
    expect(evaluateHealth(adminReport({ status: "degraded" }, { state: "slow", latencyMs: 1500 }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([
      "état dégradé : le service ne peut pas servir ses données",
      "moteur lent : il répond au-delà du seuil de la sonde",
    ])
    expect(evaluateHealth(adminReport({ status: "degraded" }, { state: "timeout" }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([
      "état dégradé : le service ne peut pas servir ses données",
      "moteur injoignable depuis le site",
    ])
    expect(evaluateHealth(adminReport({ engine: "reachable" }), { version: ADMIN_VERSION, app: ADMIN })).toEqual([
      "état du moteur illisible : la sonde de admin-diaspora-ga rend engine.state (sonde commune du moteur)",
    ])
  })

  test("un rapport de diaspora.ga n'est pas celui d'admin.diaspora.ga, et l'inverse", () => {
    expect(evaluateHealth(report(), { version: VERSION, app: ADMIN })).toEqual([
      "la sonde n'est pas celle de admin-diaspora-ga",
      "état du moteur illisible : la sonde de admin-diaspora-ga rend engine.state (sonde commune du moteur)",
    ])
    expect(evaluateHealth(adminReport(), { version: ADMIN_VERSION })).toEqual([
      "la sonde n'est pas celle de diaspora-ga",
      "source de données autre que « engine » : un site publié sert le moteur, jamais les données fictives",
      "moteur injoignable depuis le site",
    ])
  })

  test("le contrôle lit la sonde du site d'administration, et nomme SES variables", async () => {
    const requests = []
    const fetch = async (url) => {
      requests.push(String(url))
      return new Response(JSON.stringify(adminReport()), { headers: { "content-security-policy": productionCsp(ENGINE) } })
    }
    expect(await checkRelease({ app: ADMIN, target: "demo", siteUrl: ADMIN_SITE, convexUrl: ENGINE, version: ADMIN_VERSION, fetch })).toMatchObject({ ok: true, problems: [] })
    expect(requests).toEqual([`${ADMIN_SITE}/api/sante-fonctionnelle`])
    const otherEngine = async () => new Response(JSON.stringify(adminReport()), { headers: { "content-security-policy": productionCsp("https://moteur-production.convex.cloud") } })
    expect((await checkRelease({ app: ADMIN, target: "demo", siteUrl: ADMIN_SITE, convexUrl: "https://moteur-demo.convex.cloud", version: ADMIN_VERSION, fetch: otherEngine })).problems).toEqual([
      "la politique de sécurité n'autorise pas le moteur de DIASPORA_GA_DEMO_CONVEX_URL",
      "la politique de sécurité autorise 2 origine(s) d'un autre moteur que celui de DIASPORA_GA_DEMO_CONVEX_URL",
    ])
    const down = async () => {
      throw new Error(`getaddrinfo ENOTFOUND ${ADMIN_SITE}`)
    }
    expect(await checkRelease({ app: ADMIN, target: "production", siteUrl: ADMIN_SITE, convexUrl: ENGINE, version: ADMIN_VERSION, fetch: down })).toEqual({
      ok: false,
      problems: ["site de ADMIN_DIASPORA_GA_PRODUCTION_SITE_URL injoignable"],
      report: null,
      attempts: 1,
    })
  })

  test("la ligne de succès : celle d'avant pour diaspora.ga, l'application nommée pour admin.diaspora.ga", () => {
    expect(checkSuccessLine({ target: "demo", version: VERSION })).toBe(`✓ demo sert ${VERSION} : sonde « ok », source « engine », moteur joint et visé (DIASPORA_GA_DEMO_CONVEX_URL).`)
    expect(checkSuccessLine({ app: ADMIN, target: "demo", version: ADMIN_VERSION })).toBe(
      `✓ admin.diaspora.ga (demo) sert ${ADMIN_VERSION} : sonde « ok », moteur joint et visé (DIASPORA_GA_DEMO_CONVEX_URL).`,
    )
  })
})
