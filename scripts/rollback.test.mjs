import { describe, expect, test } from "bun:test"

import { renderCommand } from "./release-lib.mjs"
import { buildRollbackPlan, executeRollback, isDeploymentReference, parseRollbackArgs, renderRollbackPlan, rollbackCommand } from "./rollback.mjs"

/** Valeurs FICTIVES (domaines réservés à la documentation, RFC 2606) : aucune ressource réelle. */
const DEMO_ENV = Object.freeze({
  DIASPORA_GA_DEMO_SITE_URL: "https://site-demo.example.org",
  DIASPORA_GA_DEMO_CONVEX_URL: "https://moteur-demo.example.net",
  DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_demo",
  DIASPORA_GA_VERCEL_ORG_ID: "equipe_fictive",
  DIASPORA_GA_VERCEL_SCOPE: "portee-fictive",
})
const OLD_DEPLOYMENT = "https://ancien-deploiement.example.org"
const OLD_VERSION = "diaspora-ga-111111111111-antsia-222222222222-demo"
const CSP = "default-src 'self'; connect-src 'self' https://moteur-demo.example.net wss://moteur-demo.example.net"

const plan = () => buildRollbackPlan({ target: "demo", to: OLD_DEPLOYMENT, version: OLD_VERSION })
const report = (version) => ({ status: "ok", application: "diaspora-ga", version, backend: "configured", dataSource: "engine", engine: "reachable" })

describe("ligne de commande", () => {
  test("un déploiement se désigne par son adresse https ou son identifiant", () => {
    expect(isDeploymentReference(OLD_DEPLOYMENT)).toBe(true)
    expect(isDeploymentReference("deploiement_fictif-01")).toBe(true)
    expect(isDeploymentReference("http://ancien.example.org")).toBe(false)
    expect(isDeploymentReference(`${OLD_DEPLOYMENT}/chemin`)).toBe(false)
    expect(isDeploymentReference("--yes")).toBe(false)
    expect(isDeploymentReference("pas une adresse")).toBe(false)
    expect(isDeploymentReference(undefined)).toBe(false)
  })

  test("cible, déploiement et étiquette de la même cible ; aucune option ne saute la confirmation", () => {
    expect(parseRollbackArgs(["--target", "demo", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION])).toEqual({
      target: "demo",
      to: OLD_DEPLOYMENT,
      version: OLD_VERSION,
      execute: false,
      problems: [],
    })
    expect(parseRollbackArgs(["--target", "production", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION, "--execute"]).problems).toEqual([
      "--version désigne une autre cible que --target",
    ])
    expect(parseRollbackArgs(["--force"]).problems).toEqual([
      "argument inconnu : --force",
      "--target doit valoir demo ou production",
      "--to doit désigner un déploiement (adresse https ou identifiant)",
      "--version doit être une étiquette diaspora-ga-<12>-antsia-<12>-<cible>",
    ])
  })

  test("la commande que la publication propose après un contrôle public en écart", () => {
    expect(rollbackCommand("demo", OLD_DEPLOYMENT, OLD_VERSION)).toBe(`node scripts/rollback.mjs --target demo --to ${OLD_DEPLOYMENT} --version ${OLD_VERSION}`)
    expect(rollbackCommand("demo", OLD_DEPLOYMENT, null)).toContain("--version <étiquette servie avant la bascule>")
  })
})

describe("plan de retour arrière", () => {
  test("porte, vérification du déploiement, remise en service par promotion, contrôle public", () => {
    expect(plan().steps.map((step) => step.id)).toEqual(["agreement", "inspect", "promote", "public-check"])
    expect(plan().steps[0].gate).toBe(`REVENIR demo ${OLD_VERSION}`)
    const commands = plan().steps.flatMap((step) => (step.commands ?? []).map(renderCommand))
    expect(commands).toEqual([
      `vercel inspect ${OLD_DEPLOYMENT} --scope <DIASPORA_GA_VERCEL_SCOPE> --format=json`,
      `vercel promote ${OLD_DEPLOYMENT} --scope <DIASPORA_GA_VERCEL_SCOPE> --yes`,
      `node scripts/release-check.mjs --target demo --version ${OLD_VERSION}`,
    ])
    expect(commands.some((command) => /deploy|remove|rm |convex/.test(command))).toBe(false)
  })

  test("le plan rendu nomme les variables et ne recopie aucune valeur de la machine", () => {
    const rendered = renderRollbackPlan(plan(), { problems: ["DIASPORA_GA_VERCEL_SCOPE manque"] })
    expect(rendered).toContain(`version attendue après le retour : ${OLD_VERSION}`)
    expect(rendered).toContain("phrase à taper : REVENIR demo")
    expect(rendered).toContain("avec VERCEL_ORG_ID=<DIASPORA_GA_VERCEL_ORG_ID>, VERCEL_PROJECT_ID=<DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    expect(rendered).toContain("  - DIASPORA_GA_VERCEL_SCOPE manque")
    for (const value of Object.values(DEMO_ENV)) expect(rendered).not.toContain(value)
  })
})

function fakeDeps({ confirmed = true, inspect = { id: "ancien", url: OLD_DEPLOYMENT, readyState: "READY", target: "production", projectId: "projet_fictif_demo" }, promote = 0, servedVersion = OLD_VERSION } = {}) {
  const calls = []
  const logs = []
  const deps = {
    run: (argv, options) => {
      calls.push({ argv, env: options?.env ?? {} })
      if (argv[1] === "inspect") return inspect ? { status: 0, stdout: JSON.stringify(inspect) } : { status: 1, stdout: "" }
      if (argv[1] === "promote") return { status: promote, stdout: "" }
      throw new Error(`commande inattendue : ${argv.join(" ")}`)
    },
    confirm: async () => confirmed,
    fetch: async () => new Response(JSON.stringify(report(servedVersion)), { headers: { "content-security-policy": CSP } }),
    log: (line) => logs.push(line),
    env: DEMO_ENV,
    repos: {},
    sleep: async () => {},
  }
  return { deps, calls, logs, commands: () => calls.map((call) => call.argv.slice(0, 2).join(" ")) }
}

describe("exécution", () => {
  test("sans confirmation, aucune commande ne part", async () => {
    const fake = fakeDeps({ confirmed: false })
    expect(await executeRollback(plan(), fake.deps)).toMatchObject({ ok: false, stage: "agreement" })
    expect(fake.calls).toEqual([])
    expect(fake.logs[0]).toContain("accord écrit et détaillé du propriétaire")
  })

  test("le chemin complet : vérifier, repromouvoir, contrôler la version revenue", async () => {
    const fake = fakeDeps()
    expect(await executeRollback(plan(), fake.deps)).toEqual({ ok: true, stage: "public-check" })
    expect(fake.commands()).toEqual(["vercel inspect", "vercel promote"])
    expect(fake.calls[1]).toEqual({
      argv: ["vercel", "promote", OLD_DEPLOYMENT, "--scope", "portee-fictive", "--yes"],
      env: { VERCEL_ORG_ID: "equipe_fictive", VERCEL_PROJECT_ID: "projet_fictif_demo" },
    })
  })

  test("un déploiement introuvable, non prêt, hors production ou d'un autre projet n'est pas remis en service", async () => {
    const cases = [
      [null, "déploiement introuvable ou réponse illisible"],
      [{ id: "x", readyState: "ERROR" }, "déploiement non prêt (ERROR)"],
      [{ id: "x", readyState: "READY", target: "preview" }, "ce déploiement n'a pas été publié pour la production de la cible"],
      [{ id: "x", readyState: "READY", target: "production", projectId: "autre_projet" }, "ce déploiement n'appartient pas au projet de DIASPORA_GA_DEMO_VERCEL_PROJECT_ID"],
    ]
    for (const [inspect, reason] of cases) {
      const fake = fakeDeps({ inspect })
      expect(await executeRollback(plan(), fake.deps)).toEqual({ ok: false, stage: "inspect", reason })
      expect(fake.commands()).not.toContain("vercel promote")
    }
  })

  test("une remise en service qui échoue, ou une version qui ne revient pas, se disent", async () => {
    expect(await executeRollback(plan(), fakeDeps({ promote: 1 }).deps)).toMatchObject({ ok: false, stage: "promote" })
    const result = await executeRollback(plan(), fakeDeps({ servedVersion: "diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-demo" }).deps)
    expect(result).toMatchObject({ ok: false, stage: "public-check" })
    expect(result.reason).toContain(`attendue « ${OLD_VERSION} »`)
  })
})

// ═══════════════════════════════════════════════════════════════
// admin.diaspora.ga (CH-815, lot A8) : SON projet, SON site
// ═══════════════════════════════════════════════════════════════

const ADMIN = "admin_diaspora_ga"
/** Valeurs FICTIVES (RFC 2606) : la démonstration des deux applications, sur un même moteur. */
const ADMIN_ENV = Object.freeze({
  ...DEMO_ENV,
  ADMIN_DIASPORA_GA_DEMO_SITE_URL: "https://admin-demo.example.org",
  ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_admin_demo",
})
const ADMIN_OLD_VERSION = "admin-diaspora-ga-111111111111-antsia-222222222222-demo"
const adminPlan = () => buildRollbackPlan({ app: ADMIN, target: "demo", to: OLD_DEPLOYMENT, version: ADMIN_OLD_VERSION })
const adminReport = (version) => ({ status: "ok", application: "admin-diaspora-ga", version, backend: "configured", engine: { state: "reachable", version: null, serverTime: null, latencyMs: 40 } })

describe("retour arrière d'admin.diaspora.ga", () => {
  test("--app : une application à la fois, son étiquette, jamais all", () => {
    expect(parseRollbackArgs(["--app", ADMIN, "--target", "demo", "--to", OLD_DEPLOYMENT, "--version", ADMIN_OLD_VERSION])).toEqual({
      app: ADMIN,
      target: "demo",
      to: OLD_DEPLOYMENT,
      version: ADMIN_OLD_VERSION,
      execute: false,
      problems: [],
    })
    expect(parseRollbackArgs(["--target", "demo", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION]).app).toBeUndefined()
    expect(parseRollbackArgs(["--app", "all", "--target", "demo", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION]).problems).toEqual([
      "--app all ne vaut que pour la publication : chaque application se contrôle et se remet en arrière par sa propre commande",
    ])
    expect(parseRollbackArgs(["--app", ADMIN, "--target", "demo", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION]).problems).toEqual([
      "--version désigne une autre application que --app : diaspora_ga, pas admin_diaspora_ga",
    ])
    expect(parseRollbackArgs(["--app", "site", "--target", "demo", "--to", OLD_DEPLOYMENT, "--version", OLD_VERSION]).problems).toEqual([
      "--app inconnue (« site ») : valeurs admises diaspora_ga (par défaut), admin_diaspora_ga",
    ])
  })

  test("la commande proposée nomme l'application ; celle de diaspora.ga reste celle d'avant", () => {
    expect(rollbackCommand("demo", OLD_DEPLOYMENT, ADMIN_OLD_VERSION, ADMIN)).toBe(
      `node scripts/rollback.mjs --app admin_diaspora_ga --target demo --to ${OLD_DEPLOYMENT} --version ${ADMIN_OLD_VERSION}`,
    )
    expect(rollbackCommand("demo", OLD_DEPLOYMENT, OLD_VERSION, "diaspora_ga")).toBe(rollbackCommand("demo", OLD_DEPLOYMENT, OLD_VERSION))
  })

  test("le plan : son projet, son contrôle, sa phrase ; aucune valeur de la machine", () => {
    const plan = adminPlan()
    expect(plan.steps.map((step) => step.id)).toEqual(["agreement", "inspect", "promote", "public-check"])
    expect(plan.phrase).toBe(`REVENIR demo ${ADMIN_OLD_VERSION}`)
    expect(plan.steps.flatMap((step) => (step.commands ?? []).map(renderCommand)).at(-1)).toBe(
      `node scripts/release-check.mjs --app admin_diaspora_ga --target demo --version ${ADMIN_OLD_VERSION}`,
    )
    const rendered = renderRollbackPlan(plan, { problems: ["ADMIN_DIASPORA_GA_DEMO_SITE_URL manque"] })
    expect(rendered).toStartWith("Plan de retour arrière de admin.diaspora.ga — cible demo")
    expect(rendered).toContain("avec VERCEL_ORG_ID=<DIASPORA_GA_VERCEL_ORG_ID>, VERCEL_PROJECT_ID=<ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    expect(rendered).not.toContain("<DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    for (const value of Object.values(ADMIN_ENV)) expect(rendered).not.toContain(value)
  })

  test("exécution : vérifie SON projet, repromeut, contrôle SON site", async () => {
    const requests = []
    const fake = fakeDeps({ inspect: { id: "ancien", url: OLD_DEPLOYMENT, readyState: "READY", target: "production", projectId: "projet_fictif_admin_demo" } })
    fake.deps.env = ADMIN_ENV
    fake.deps.fetch = async (url) => {
      requests.push(String(url))
      return new Response(JSON.stringify(adminReport(ADMIN_OLD_VERSION)), { headers: { "content-security-policy": CSP } })
    }
    expect(await executeRollback(adminPlan(), fake.deps)).toEqual({ ok: true, stage: "public-check" })
    expect(fake.calls[1].env).toEqual({ VERCEL_ORG_ID: "equipe_fictive", VERCEL_PROJECT_ID: "projet_fictif_admin_demo" })
    expect(requests).toEqual(["https://admin-demo.example.org/api/sante-fonctionnelle"])
    expect(fake.logs[0]).toContain("ADMIN_DIASPORA_GA_DEMO_SITE_URL")
  })

  test("un déploiement du projet des membres n'est jamais remis en service sur le site d'administration", async () => {
    const fake = fakeDeps()
    fake.deps.env = ADMIN_ENV
    expect(await executeRollback(adminPlan(), fake.deps)).toEqual({
      ok: false,
      stage: "inspect",
      reason: "ce déploiement n'appartient pas au projet de ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID",
    })
    expect(fake.commands()).not.toContain("vercel promote")
  })
})
