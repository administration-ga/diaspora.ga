import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildReleasePlan, executeRelease, parseReleaseArgs, releaseAgreementPoints, renderReleasePlan } from "./release.mjs"
import { PUBLIC_RELEASE_VARIABLES, releaseApp, renderCommand } from "./release-lib.mjs"

/** Valeurs FICTIVES (domaines réservés à la documentation, RFC 2606) : aucune ressource réelle. */
const DEMO_ENV = Object.freeze({
  DIASPORA_GA_DEMO_SITE_URL: "https://site-demo.example.org",
  DIASPORA_GA_DEMO_CONVEX_URL: "https://moteur-demo.example.net",
  DIASPORA_GA_DEMO_CONVEX_SITE_URL: "https://actions-demo.example.net",
  DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_demo",
  DIASPORA_GA_VERCEL_ORG_ID: "equipe_fictive",
  DIASPORA_GA_VERCEL_SCOPE: "portee-fictive",
})
const ANTSIA = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) })
const DIASPORA_GA = Object.freeze({ commit: "d".repeat(40), tree: "e".repeat(40) })
const VERSION = "diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-demo"
const OLD_VERSION = "diaspora-ga-111111111111-antsia-222222222222-demo"
const NEW_DEPLOYMENT = "https://nouveau-deploiement.example.org"
const OLD_DEPLOYMENT = "https://ancien-deploiement.example.org"
const CSP = "default-src 'self'; connect-src 'self' https://moteur-demo.example.net wss://moteur-demo.example.net https://moteur-demo.example.site; object-src 'none'"

const plan = () => buildReleasePlan({ target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA })
const report = (version) => ({ status: "ok", application: "diaspora-ga", version, backend: "configured", dataSource: "engine", engine: "reachable" })

describe("ligne de commande", () => {
  test("cible, deux commits, et --execute seulement en drapeau", () => {
    expect(parseReleaseArgs(["--target", "demo", "--antsia", "origin/main", "--diaspora-ga", "abc1234"])).toEqual({
      target: "demo",
      antsia: "origin/main",
      diasporaGa: "abc1234",
      execute: false,
      problems: [],
    })
    expect(parseReleaseArgs(["--target", "production", "--antsia", "x", "--diaspora-ga", "y", "--execute"]).execute).toBe(true)
  })

  test("aucune option ne saute la confirmation : --yes ou --force sont des arguments inconnus", () => {
    const { problems } = parseReleaseArgs(["--target", "staging", "--yes", "--force"])
    expect(problems).toEqual([
      "argument inconnu : --yes",
      "argument inconnu : --force",
      "--target doit valoir demo ou production",
      "--antsia <commit> manque",
      "--diaspora-ga <commit> manque",
    ])
  })
})

describe("plan de publication", () => {
  test("suit la méthode du 22/10 au 3/11 : figer, publier sans bascule, contrôler, basculer, contrôler", () => {
    expect(plan().steps.map((step) => step.id)).toEqual([
      "agreement",
      "fetch",
      "published",
      "freeze",
      "served",
      "deploy",
      "ready",
      "private-check",
      "confirm-promote",
      "promote",
      "public-check",
    ])
    expect(plan().version).toBe(VERSION)
  })

  test("deux portes tapées : avant toute commande, puis avant la bascule", () => {
    const steps = plan().steps
    expect(steps[0].gate).toBe(`PUBLIER demo ${VERSION}`)
    expect(steps.findIndex((step) => step.gate === `BASCULER demo ${VERSION}`)).toBe(steps.findIndex((step) => step.id === "promote") - 1)
    expect(steps.filter((step) => step.gate).length).toBe(2)
  })

  test("la publication part sans bascule, avec les seules variables publiques et les deux commits en métadonnées", () => {
    const [deploy] = plan().steps.find((step) => step.id === "deploy").commands
    const text = renderCommand(deploy)
    for (const flag of ["--prod", "--skip-domain", "--archive=tgz", "--yes"]) expect(deploy).toContain(flag)
    expect(text).toContain(`--meta diasporaGaReleaseCommit=${DIASPORA_GA.commit}`)
    expect(text).toContain(`--meta antsiaReleaseCommit=${ANTSIA.commit}`)
    expect(text).toContain("--build-env NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE=engine --env NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE=engine")
    expect(text).toContain(`--build-env NEXT_PUBLIC_BUILD_SHA=${VERSION}`)
    expect(text).toContain("--build-env NEXT_PUBLIC_CONVEX_URL=<DIASPORA_GA_DEMO_CONVEX_URL>")
    const passed = deploy.filter((_, index) => deploy[index - 1] === "--build-env").map((arg) => arg[0].slice(0, -1))
    expect(passed.every((name) => PUBLIC_RELEASE_VARIABLES.includes(name))).toBe(true)
    expect(passed).not.toContain("NEXT_PUBLIC_IDN_PORTAL_URL")
  })

  test("aucune commande de bascule avant la seconde porte, aucune commande de backend", () => {
    const commands = plan().steps.flatMap((step) => (step.commands ?? []).map(renderCommand))
    const promoteAt = commands.findIndex((command) => command.startsWith("vercel promote"))
    expect(commands.filter((command) => command.startsWith("vercel promote")).length).toBe(1)
    expect(commands.slice(0, promoteAt).some((command) => command.includes("promote"))).toBe(false)
    expect(commands.some((command) => /convex (deploy|run|env)/.test(command))).toBe(false)
  })

  test("les liens d'élévation ne passent que s'ils sont posés sur la machine", () => {
    const withLinks = buildReleasePlan({ target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA, values: { idnPortalUrl: "x", consulateUrl: "y" } })
    expect(withLinks.variables.map(([name]) => name)).toContain("NEXT_PUBLIC_IDN_PORTAL_URL")
    expect(withLinks.variables.map(([name]) => name)).toContain("NEXT_PUBLIC_CONSULATE_URL")
  })

  test("la production a ses propres variables et sa propre étiquette", () => {
    const production = buildReleasePlan({ target: "production", antsia: ANTSIA, diasporaGa: DIASPORA_GA })
    const rendered = renderReleasePlan(production)
    expect(production.version).toBe("diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-production")
    expect(rendered).toContain("<DIASPORA_GA_PRODUCTION_SITE_URL>")
    expect(rendered).not.toContain("DIASPORA_GA_DEMO_")
  })

  test("le plan rendu nomme les variables et ne recopie aucune valeur de la machine", () => {
    const rendered = renderReleasePlan(buildReleasePlan({ target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA, values: { siteUrl: DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL } }), {
      published: { antsia: true, diasporaGa: false },
      problems: ["DIASPORA_GA_VERCEL_SCOPE manque"],
    })
    expect(rendered).toContain(`version : ${VERSION}`)
    expect(rendered).toContain(`ANTSIA ${ANTSIA.commit} (arbre ${ANTSIA.tree})`)
    expect(rendered).toContain("ANTSIA oui, DIASPORA_GA NON")
    expect(rendered).toContain("phrase à taper : PUBLIER demo")
    expect(rendered).toContain("avec VERCEL_ORG_ID=<DIASPORA_GA_VERCEL_ORG_ID>, VERCEL_PROJECT_ID=<DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    expect(rendered).toContain("  - DIASPORA_GA_VERCEL_SCOPE manque")
    for (const value of Object.values(DEMO_ENV)) expect(rendered).not.toContain(value)
  })

  test("l'accord porte sur les commits, la cible, l'ordre et le retour arrière", () => {
    const points = releaseAgreementPoints(plan())
    expect(points.map((point) => point.split(" : ")[0])).toEqual(["commits", "cible", "ordre", "retour arrière"])
    expect(points[0]).toContain(ANTSIA.commit)
    expect(points[0]).toContain(DIASPORA_GA.commit)
  })
})

/** Une machine et un hébergeur simulés : chaque commande est relevée, rien ne sort. */
function fakeDeps({ answers = [true, true], published = true, deploy = `${NEW_DEPLOYMENT}\n`, ready = "READY", privateReport = report(VERSION), publicVersion = VERSION, freezeError = null, servedFails = false } = {}) {
  const calls = []
  const logs = []
  const records = []
  let promoted = false
  const confirmations = [...answers]
  const run = (argv, options) => {
    calls.push({ argv, env: options?.env ?? {} })
    const [tool, verb] = argv
    if (tool === "git" && argv.includes("merge-base")) return { status: published === true || argv.includes(published) ? 0 : 1, stdout: "" }
    if (tool === "git") return { status: 0, stdout: "" }
    if (verb === "inspect" && argv[2] === DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL) {
      return servedFails ? { status: 1, stdout: "" } : { status: 0, stdout: JSON.stringify({ id: "ancien", url: OLD_DEPLOYMENT.replace("https://", ""), readyState: "READY" }) }
    }
    if (verb === "deploy") return { status: deploy ? 0 : 1, stdout: deploy ?? "" }
    if (verb === "inspect") return { status: 0, stdout: JSON.stringify({ id: "nouveau", url: NEW_DEPLOYMENT, readyState: ready }) }
    if (verb === "curl") return { status: 0, stdout: typeof privateReport === "string" ? privateReport : JSON.stringify(privateReport) }
    if (verb === "promote") {
      promoted = true
      return { status: 0, stdout: "" }
    }
    throw new Error(`commande inattendue : ${argv.join(" ")}`)
  }
  const fetch = async (url) => {
    expect(String(url)).toBe(`${DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL}/api/sante-fonctionnelle`)
    return new Response(JSON.stringify(report(promoted ? publicVersion : OLD_VERSION)), { status: 200, headers: { "content-security-policy": CSP } })
  }
  const deps = {
    run,
    fetch,
    confirm: async () => confirmations.shift() ?? false,
    log: (line) => logs.push(line),
    env: DEMO_ENV,
    repos: { ANTSIA: "/depots/ANTSIA", DIASPORA_GA: "/depots/DIASPORA_GA" },
    makeWorkdir: () => mkdtempSync(join(tmpdir(), "diaspora-ga-essai-publication-")),
    freeze: ({ workdir, commits }) => {
      if (freezeError) throw new Error(freezeError)
      expect(commits).toEqual({ ANTSIA: ANTSIA.commit, DIASPORA_GA: DIASPORA_GA.commit })
      return { context: join(workdir, "ECOSYSTEMES"), fingerprint: "f".repeat(64), files: 42 }
    },
    record: (_workdir, record) => records.push(structuredClone(record)),
    sleep: async () => {},
  }
  const commands = () => calls.map((call) => call.argv.slice(0, 2).join(" "))
  return { deps, calls, logs, records, commands }
}

describe("exécution", () => {
  test("sans la première confirmation, aucune commande ne part", async () => {
    const fake = fakeDeps({ answers: [false] })
    const result = await executeRelease(plan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "agreement" })
    expect(fake.calls).toEqual([])
    expect(fake.logs[0]).toContain("accord écrit et détaillé du propriétaire")
  })

  test("le chemin complet : figer, publier sans bascule, contrôler, basculer, contrôler", async () => {
    const fake = fakeDeps()
    const result = await executeRelease(plan(), fake.deps)
    expect(result.ok).toBe(true)
    expect(fake.commands()).toEqual(["git -C", "git -C", "git -C", "git -C", "vercel inspect", "vercel deploy", "vercel inspect", "vercel curl", "vercel promote"])
    const deploy = fake.calls.find((call) => call.argv[1] === "deploy")
    expect(deploy.argv).toContain("--skip-domain")
    expect(deploy.argv).toContain(`NEXT_PUBLIC_SITE_URL=${DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL}`)
    expect(deploy.argv).toContain(`sourceFingerprint=${"f".repeat(64)}`)
    expect(deploy.env).toEqual({ VERCEL_ORG_ID: "equipe_fictive", VERCEL_PROJECT_ID: "projet_fictif_demo" })
    expect(fake.calls.find((call) => call.argv[1] === "promote").argv).toEqual(["vercel", "promote", NEW_DEPLOYMENT, "--scope", "portee-fictive", "--yes"])
    expect(result.record).toMatchObject({
      version: VERSION,
      deployment: NEW_DEPLOYMENT,
      previous: { deployment: OLD_DEPLOYMENT, version: OLD_VERSION },
      sourceFingerprint: "f".repeat(64),
      sourceFiles: 42,
      publicCheck: [],
    })
    expect(result.record.stages).toEqual(["agreement", "fetch", "published", "freeze", "served", "deploy", "ready", "private-check", "confirm-promote", "promote", "public-check"])
  })

  test("un commit absent d'origin/main arrête tout avant le gel", async () => {
    const fake = fakeDeps({ published: ANTSIA.commit })
    const result = await executeRelease(plan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "published", reason: "le commit de DIASPORA_GA n'est pas sur origin/main" })
    expect(fake.calls.some((call) => call.argv[0] === "vercel")).toBe(false)
  })

  test("un gel impossible arrête tout avant l'hébergeur", async () => {
    const fake = fakeDeps({ freezeError: "Contexte figé impossible" })
    expect(await executeRelease(plan(), fake.deps)).toMatchObject({ ok: false, stage: "freeze" })
    expect(fake.calls.some((call) => call.argv[0] === "vercel")).toBe(false)
  })

  test("une publication sans adresse de déploiement s'arrête", async () => {
    const fake = fakeDeps({ deploy: "Error: build failed\n" })
    expect(await executeRelease(plan(), fake.deps)).toMatchObject({ ok: false, stage: "deploy" })
    expect(fake.commands()).not.toContain("vercel promote")
  })

  test("un déploiement qui n'est pas prêt ne se contrôle ni ne bascule", async () => {
    const fake = fakeDeps({ ready: "ERROR" })
    expect(await executeRelease(plan(), fake.deps)).toMatchObject({ ok: false, stage: "ready" })
    expect(fake.commands()).not.toContain("vercel curl")
    expect(fake.commands()).not.toContain("vercel promote")
  })

  test("un contrôle privé en écart (version, source, moteur) empêche la bascule", async () => {
    for (const privateReport of [report(OLD_VERSION), { ...report(VERSION), dataSource: "demo" }, { ...report(VERSION), status: "degraded", engine: "unreachable" }, "<html>"]) {
      const fake = fakeDeps({ privateReport })
      const result = await executeRelease(plan(), fake.deps)
      expect(result).toMatchObject({ ok: false, stage: "private-check" })
      expect(result.reason).toContain("aucune bascule")
      expect(fake.commands()).not.toContain("vercel promote")
    }
  })

  test("sans la seconde confirmation, le déploiement reste publié sans domaine", async () => {
    const fake = fakeDeps({ answers: [true, false] })
    expect(await executeRelease(plan(), fake.deps)).toMatchObject({ ok: false, stage: "confirm-promote" })
    expect(fake.commands()).not.toContain("vercel promote")
  })

  test("un contrôle public en écart propose le retour arrière, sans le jouer", async () => {
    const fake = fakeDeps({ publicVersion: OLD_VERSION })
    const result = await executeRelease(plan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "public-check" })
    expect(result.reason).toContain(`node scripts/rollback.mjs --target demo --to ${OLD_DEPLOYMENT} --version ${OLD_VERSION}`)
    expect(fake.commands().filter((command) => command === "vercel promote").length).toBe(1)
    expect(fake.records.at(-1)).toMatchObject({ stoppedAt: "public-check" })
  })

  test("une première publication le dit : aucun retour arrière possible", async () => {
    const fake = fakeDeps({ servedFails: true, publicVersion: OLD_VERSION })
    const result = await executeRelease(plan(), fake.deps)
    expect(fake.logs.some((line) => line.includes("première publication"))).toBe(true)
    expect(result.reason).toContain("aucun déploiement précédent relevé")
  })

  test("le journal d'exécution ne recopie aucune valeur de la machine", async () => {
    const fake = fakeDeps({ privateReport: report(OLD_VERSION) })
    await executeRelease(plan(), fake.deps)
    const journal = fake.logs.join("\n")
    for (const value of Object.values(DEMO_ENV)) expect(journal).not.toContain(value)
  })
})

// ═══════════════════════════════════════════════════════════════
// --app (CH-815, lot A8) : admin.diaspora.ga seule, puis les deux dans la même séance
// ═══════════════════════════════════════════════════════════════

const ADMIN = "admin_diaspora_ga"
/** Valeurs FICTIVES (RFC 2606) : les deux applications de démonstration, sur un même moteur. */
const BOTH_ENV = Object.freeze({
  ...DEMO_ENV,
  ADMIN_DIASPORA_GA_DEMO_SITE_URL: "https://admin-demo.example.org",
  ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_admin_demo",
})
const ADMIN_VERSION = "admin-diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-demo"
const ADMIN_OLD_VERSION = "admin-diaspora-ga-111111111111-antsia-222222222222-demo"
const ADMIN_NEW = "https://nouveau-admin.example.org"
const ADMIN_OLD = "https://ancien-admin.example.org"
const adminPlan = () => buildReleasePlan({ app: ADMIN, target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA })
const bothPlan = () => buildReleasePlan({ app: "all", target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA })
const adminReport = (version, engine = "reachable") => ({
  status: engine === "reachable" ? "ok" : "degraded",
  application: "admin-diaspora-ga",
  version,
  backend: "configured",
  engine: { state: engine, version: null, serverTime: null, latencyMs: 40 },
})

describe("ligne de commande --app", () => {
  test("absente, diaspora.ga ; admin_diaspora_ga ; all ; une application inconnue est refusée", () => {
    const base = ["--target", "demo", "--antsia", "x", "--diaspora-ga", "y"]
    expect(parseReleaseArgs(base).app).toBeUndefined()
    expect(parseReleaseArgs(["--app", ADMIN, ...base])).toEqual({ app: ADMIN, target: "demo", antsia: "x", diasporaGa: "y", execute: false, problems: [] })
    expect(parseReleaseArgs(["--app", "all", ...base]).app).toBe("all")
    expect(parseReleaseArgs(["--app", "les-deux", ...base]).problems).toEqual([
      "--app inconnue (« les-deux ») : valeurs admises diaspora_ga (par défaut), admin_diaspora_ga, all (les deux, dans la même séance)",
    ])
    expect(parseReleaseArgs(["--app", ...base]).problems).toContain("--app attend une valeur")
  })

  test("une application inconnue ne fait aucun plan", () => {
    expect(() => buildReleasePlan({ app: "console", target: "demo", antsia: ANTSIA, diasporaGa: DIASPORA_GA })).toThrow("Application inconnue : console")
  })
})

describe("plan d'admin.diaspora.ga", () => {
  test("les mêmes onze étapes, son étiquette, ses deux portes", () => {
    expect(adminPlan().steps.map((step) => step.id)).toEqual(plan().steps.map((step) => step.id))
    expect(adminPlan().version).toBe(ADMIN_VERSION)
    expect(adminPlan().confirmations).toEqual({ publish: `PUBLIER demo ${ADMIN_VERSION}`, promote: `BASCULER demo ${ADMIN_VERSION}` })
  })

  test("publie dans SON projet, avec SA liste publique : jamais la source de données fictive", () => {
    const deploy = adminPlan().steps.find((step) => step.id === "deploy")
    const [argv] = deploy.commands
    const passed = argv.filter((_, index) => argv[index - 1] === "--build-env").map((arg) => arg[0].slice(0, -1))
    expect(passed).toEqual(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_SITE_URL", "NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_MEMBERS_SITE_URL"])
    expect(passed.every((name) => releaseApp(ADMIN).publicVariables.includes(name))).toBe(true)
    const text = renderCommand(argv)
    expect(text).toContain("--build-env NEXT_PUBLIC_SITE_URL=<ADMIN_DIASPORA_GA_DEMO_SITE_URL>")
    expect(text).toContain("--build-env NEXT_PUBLIC_MEMBERS_SITE_URL=<DIASPORA_GA_DEMO_SITE_URL>")
    expect(text).toContain("--build-env NEXT_PUBLIC_CONVEX_URL=<DIASPORA_GA_DEMO_CONVEX_URL>")
    expect(text).toContain(`--build-env NEXT_PUBLIC_BUILD_SHA=${ADMIN_VERSION}`)
    expect(text).not.toContain("DATA_SOURCE")
    expect(deploy.env).toEqual({ VERCEL_ORG_ID: { env: "DIASPORA_GA_VERCEL_ORG_ID" }, VERCEL_PROJECT_ID: { env: "ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID" } })
  })

  test("le relevé, la sonde et le contrôle public visent SON site", () => {
    const commands = adminPlan().steps.flatMap((step) => (step.commands ?? []).map(renderCommand))
    expect(commands).toContain("vercel inspect <ADMIN_DIASPORA_GA_DEMO_SITE_URL> --scope <DIASPORA_GA_VERCEL_SCOPE> --format=json")
    expect(commands).toContain("vercel curl /api/sante-fonctionnelle --deployment '<adresse du déploiement>' --scope <DIASPORA_GA_VERCEL_SCOPE>")
    expect(commands.at(-1)).toBe(`node scripts/release-check.mjs --app admin_diaspora_ga --target demo --version ${ADMIN_VERSION}`)
    expect(adminPlan().steps.find((step) => step.id === "private-check").title).not.toContain("source")
  })

  test("le plan rendu nomme l'application et ses variables, jamais leur valeur", () => {
    const rendered = renderReleasePlan(adminPlan(), { published: { antsia: true, diasporaGa: true }, problems: ["ADMIN_DIASPORA_GA_DEMO_SITE_URL manque"] })
    expect(rendered.split("\n")[0]).toBe("Plan de publication de admin.diaspora.ga — cible demo")
    expect(rendered).toContain(`version : ${ADMIN_VERSION}`)
    expect(rendered).toContain("variables publiques : NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_CONVEX_URL, CONVEX_SITE_URL, NEXT_PUBLIC_BUILD_SHA, NEXT_PUBLIC_MEMBERS_SITE_URL")
    expect(rendered).toContain("VERCEL_PROJECT_ID=<ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    expect(rendered).not.toContain("<DIASPORA_GA_DEMO_VERCEL_PROJECT_ID>")
    for (const value of Object.values(BOTH_ENV)) expect(rendered).not.toContain(value)
  })

  test("l'accord nomme ses variables et SA commande de retour arrière", () => {
    const points = releaseAgreementPoints(adminPlan())
    expect(points.map((point) => point.split(" : ")[0])).toEqual(["commits", "cible", "ordre", "retour arrière"])
    expect(points[1]).toBe("cible : demo (variables ADMIN_DIASPORA_GA_DEMO_SITE_URL et suivantes)")
    expect(points[3]).toContain("(node scripts/rollback.mjs --app admin_diaspora_ga)")
  })

  test("des préalables relevés aux commits publiés se disent à part, avant les variables", () => {
    const rendered = renderReleasePlan(adminPlan(), { prerequisites: ["l'entrée admin_diaspora_ga manque au catalogue du moteur"], problems: ["X manque"] })
    const lines = rendered.split("\n")
    expect(lines.indexOf("Préalables à corriger avant toute exécution (relevés aux commits publiés) :")).toBeLessThan(lines.indexOf("Variables de la machine à corriger avant toute exécution :"))
    expect(renderReleasePlan(plan())).not.toContain("Préalables")
  })
})

describe("plan des deux applications dans la même séance (--app all)", () => {
  test("le moteur est un préalable ; admin.diaspora.ga puis diaspora.ga ; les deux contrôles privés avant toute bascule", () => {
    expect(bothPlan().steps.map((step) => step.id)).toEqual([
      "agreement",
      "fetch",
      "published",
      "freeze",
      "served:admin_diaspora_ga",
      "deploy:admin_diaspora_ga",
      "ready:admin_diaspora_ga",
      "private-check:admin_diaspora_ga",
      "served:diaspora_ga",
      "deploy:diaspora_ga",
      "ready:diaspora_ga",
      "private-check:diaspora_ga",
      "confirm-promote",
      "promote:admin_diaspora_ga",
      "promote:diaspora_ga",
      "public-check:admin_diaspora_ga",
      "public-check:diaspora_ga",
    ])
    expect(bothPlan().apps.map((entry) => entry.version)).toEqual([ADMIN_VERSION, VERSION])
    expect(bothPlan().version).toBeUndefined()
  })

  test("un seul contexte figé, une seule relecture, aucune commande de backend ; deux portes qui nomment les deux étiquettes", () => {
    const steps = bothPlan().steps
    expect(steps.filter((step) => step.id === "freeze").length).toBe(1)
    expect(steps.filter((step) => step.gate).map((step) => step.gate)).toEqual([`PUBLIER demo ${ADMIN_VERSION} ${VERSION}`, `BASCULER demo ${ADMIN_VERSION} ${VERSION}`])
    const commands = steps.flatMap((step) => (step.commands ?? []).map(renderCommand))
    expect(commands.some((command) => /convex (deploy|run|env)/.test(command))).toBe(false)
    const gateAt = steps.findIndex((step) => step.id === "confirm-promote")
    expect(steps.slice(0, gateAt).flatMap((step) => step.commands ?? []).some((argv) => argv[1] === "promote")).toBe(false)
  })

  test("chaque application garde SON projet, SA liste, SA sonde, SON contrôle public", () => {
    const steps = bothPlan().steps
    const byId = (id) => steps.find((step) => step.id === id)
    expect(byId("deploy:admin_diaspora_ga").env.VERCEL_PROJECT_ID).toEqual({ env: "ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID" })
    expect(byId("deploy:diaspora_ga").env.VERCEL_PROJECT_ID).toEqual({ env: "DIASPORA_GA_DEMO_VERCEL_PROJECT_ID" })
    expect(renderCommand(byId("deploy:admin_diaspora_ga").commands[0])).not.toContain("DATA_SOURCE")
    expect(renderCommand(byId("deploy:diaspora_ga").commands[0])).toContain("NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE=engine")
    expect(renderCommand(byId("promote:admin_diaspora_ga").commands[0])).toBe("vercel promote '<adresse du déploiement de admin.diaspora.ga>' --scope <DIASPORA_GA_VERCEL_SCOPE> --yes")
    expect(renderCommand(byId("public-check:admin_diaspora_ga").commands[0])).toBe(`node scripts/release-check.mjs --app admin_diaspora_ga --target demo --version ${ADMIN_VERSION}`)
    expect(renderCommand(byId("public-check:diaspora_ga").commands[0])).toBe(`node scripts/release-check.mjs --target demo --version ${VERSION}`)
    expect(byId("served:diaspora_ga").title).toStartWith("diaspora.ga — ")
    expect(byId("served:admin_diaspora_ga").title).toStartWith("admin.diaspora.ga — ")
  })

  test("le plan rendu nomme les deux applications, leurs étiquettes et leurs variables, jamais une valeur", () => {
    const rendered = renderReleasePlan(bothPlan(), { published: { antsia: true, diasporaGa: true }, problems: ["DIASPORA_GA_VERCEL_SCOPE manque"] })
    const lines = rendered.split("\n")
    expect(lines[0]).toBe("Plan de publication de admin.diaspora.ga et diaspora.ga — cible demo")
    expect(lines[1]).toBe("  ordre : moteur déjà publié, puis admin.diaspora.ga, puis diaspora.ga ; les contrôles privés des deux avant toute bascule")
    expect(rendered).toContain(`  admin.diaspora.ga : version ${ADMIN_VERSION} ; variables publiques : NEXT_PUBLIC_SITE_URL,`)
    expect(rendered).toContain(`  diaspora.ga : version ${VERSION} ; variables publiques : NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE,`)
    expect(rendered).toContain("17. diaspora.ga — Contrôle public")
    for (const value of Object.values(BOTH_ENV)) expect(rendered).not.toContain(value)
  })

  test("l'accord nomme l'ordre des deux et le retour arrière de chacune", () => {
    const points = releaseAgreementPoints(bothPlan())
    expect(points.map((point) => point.split(" : ")[0])).toEqual(["commits", "cible", "ordre", "retour arrière"])
    expect(points[1]).toBe("cible : demo (variables ADMIN_DIASPORA_GA_DEMO_SITE_URL, DIASPORA_GA_DEMO_SITE_URL et suivantes)")
    expect(points[2]).toContain("puis admin.diaspora.ga, puis diaspora.ga, dans la même séance")
    expect(points[3]).toContain("--app <application>")
  })
})

/**
 * Une machine et un hébergeur simulés pour les deux applications : chaque projet sert
 * son site, chaque commande est relevée, rien ne sort. `fail` force un écart par étape
 * et par application (`{ "private-check:diaspora_ga": … }`).
 */
function fakeBothDeps({ answers = [true, true], adminServed = true, fail = {} } = {}) {
  const calls = []
  const logs = []
  const records = []
  const promoted = new Set()
  const confirmations = [...answers]
  const appOf = (env) => (env.VERCEL_PROJECT_ID === BOTH_ENV.ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID ? ADMIN : "diaspora_ga")
  const run = (argv, options) => {
    const env = options?.env ?? {}
    calls.push({ argv, env })
    const [tool, verb] = argv
    if (tool === "git") return { status: 0, stdout: "" }
    const app = appOf(env)
    const site = app === ADMIN ? BOTH_ENV.ADMIN_DIASPORA_GA_DEMO_SITE_URL : BOTH_ENV.DIASPORA_GA_DEMO_SITE_URL
    const fresh = app === ADMIN ? ADMIN_NEW : NEW_DEPLOYMENT
    if (verb === "inspect" && argv[2] === site) {
      if (app === ADMIN && !adminServed) return { status: 1, stdout: "" }
      return { status: 0, stdout: JSON.stringify({ id: "ancien", url: (app === ADMIN ? ADMIN_OLD : OLD_DEPLOYMENT).replace("https://", ""), readyState: "READY" }) }
    }
    if (verb === "deploy") return { status: 0, stdout: `${fresh}\n` }
    if (verb === "inspect") return { status: 0, stdout: JSON.stringify({ id: "nouveau", url: fresh, readyState: "READY" }) }
    if (verb === "curl") {
      const forced = fail[`private-check:${app}`]
      const body = forced ?? (app === ADMIN ? adminReport(ADMIN_VERSION) : report(VERSION))
      return { status: 0, stdout: JSON.stringify(body) }
    }
    if (verb === "promote") {
      if (fail[`promote:${app}`]) return { status: 1, stdout: "" }
      promoted.add(app)
      return { status: 0, stdout: "" }
    }
    throw new Error(`commande inattendue : ${argv.join(" ")}`)
  }
  const fetch = async (url) => {
    const admin = String(url).startsWith(BOTH_ENV.ADMIN_DIASPORA_GA_DEMO_SITE_URL)
    const app = admin ? ADMIN : "diaspora_ga"
    const publicFail = fail[`public-check:${app}`]
    const version = promoted.has(app) && !publicFail ? (admin ? ADMIN_VERSION : VERSION) : admin ? ADMIN_OLD_VERSION : OLD_VERSION
    return new Response(JSON.stringify(admin ? adminReport(version) : report(version)), { status: 200, headers: { "content-security-policy": CSP } })
  }
  const deps = {
    run,
    fetch,
    confirm: async () => confirmations.shift() ?? false,
    log: (line) => logs.push(line),
    env: BOTH_ENV,
    repos: { ANTSIA: "/depots/ANTSIA", DIASPORA_GA: "/depots/DIASPORA_GA" },
    makeWorkdir: () => mkdtempSync(join(tmpdir(), "diaspora-ga-essai-publication-")),
    freeze: ({ workdir }) => ({ context: join(workdir, "ECOSYSTEMES"), fingerprint: "f".repeat(64), files: 42 }),
    record: (_workdir, record) => records.push(structuredClone(record)),
    sleep: async () => {},
  }
  const commands = () => calls.map((call) => `${call.argv.slice(0, 2).join(" ")}${call.argv[0] === "vercel" ? ` [${appOf(call.env)}]` : ""}`)
  return { deps, calls, logs, records, commands }
}

describe("exécution d'admin.diaspora.ga seule", () => {
  test("le chemin complet, dans SON projet ; le relevé à plat, comme avant", async () => {
    const fake = fakeBothDeps()
    const result = await executeRelease(adminPlan(), fake.deps)
    expect(result.ok).toBe(true)
    expect(fake.commands().filter((command) => command.startsWith("vercel"))).toEqual([
      "vercel inspect [admin_diaspora_ga]",
      "vercel deploy [admin_diaspora_ga]",
      "vercel inspect [admin_diaspora_ga]",
      "vercel curl [admin_diaspora_ga]",
      "vercel promote [admin_diaspora_ga]",
    ])
    const deploy = fake.calls.find((call) => call.argv[1] === "deploy")
    expect(deploy.argv).toContain(`NEXT_PUBLIC_SITE_URL=${BOTH_ENV.ADMIN_DIASPORA_GA_DEMO_SITE_URL}`)
    expect(deploy.argv).toContain(`NEXT_PUBLIC_MEMBERS_SITE_URL=${BOTH_ENV.DIASPORA_GA_DEMO_SITE_URL}`)
    expect(result.record).toMatchObject({ version: ADMIN_VERSION, deployment: ADMIN_NEW, previous: { deployment: ADMIN_OLD, version: ADMIN_OLD_VERSION }, publicCheck: [] })
  })

  test("un rapport de diaspora.ga au contrôle privé du site d'administration empêche la bascule", async () => {
    const fake = fakeBothDeps({ fail: { "private-check:admin_diaspora_ga": report(ADMIN_VERSION) } })
    const result = await executeRelease(adminPlan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "private-check" })
    expect(result.reason).toContain("la sonde n'est pas celle de admin-diaspora-ga")
    expect(fake.commands().some((command) => command.startsWith("vercel promote"))).toBe(false)
  })

  test("un contrôle public en écart propose SA commande de retour arrière", async () => {
    const fake = fakeBothDeps({ fail: { "public-check:admin_diaspora_ga": true } })
    const result = await executeRelease(adminPlan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "public-check" })
    expect(result.reason).toContain(`node scripts/rollback.mjs --app admin_diaspora_ga --target demo --to ${ADMIN_OLD} --version ${ADMIN_OLD_VERSION}`)
  })
})

describe("exécution des deux applications dans la même séance", () => {
  test("le chemin complet : un gel, deux publications contrôlées, une porte, deux bascules, deux contrôles", async () => {
    const fake = fakeBothDeps()
    const result = await executeRelease(bothPlan(), fake.deps)
    expect(result).toMatchObject({ ok: true, stage: "public-check:diaspora_ga" })
    expect(fake.commands()).toEqual([
      "git -C",
      "git -C",
      "git -C",
      "git -C",
      "vercel inspect [admin_diaspora_ga]",
      "vercel deploy [admin_diaspora_ga]",
      "vercel inspect [admin_diaspora_ga]",
      "vercel curl [admin_diaspora_ga]",
      "vercel inspect [diaspora_ga]",
      "vercel deploy [diaspora_ga]",
      "vercel inspect [diaspora_ga]",
      "vercel curl [diaspora_ga]",
      "vercel promote [admin_diaspora_ga]",
      "vercel promote [diaspora_ga]",
    ])
    expect(fake.calls.find((call) => call.argv[1] === "promote").argv).toEqual(["vercel", "promote", ADMIN_NEW, "--scope", "portee-fictive", "--yes"])
    expect(result.record).toMatchObject({
      target: "demo",
      applications: [ADMIN, "diaspora_ga"],
      sourceFingerprint: "f".repeat(64),
      apps: {
        admin_diaspora_ga: { version: ADMIN_VERSION, deployment: ADMIN_NEW, previous: { deployment: ADMIN_OLD, version: ADMIN_OLD_VERSION }, publicCheck: [] },
        diaspora_ga: { version: VERSION, deployment: NEW_DEPLOYMENT, previous: { deployment: OLD_DEPLOYMENT, version: OLD_VERSION }, publicCheck: [] },
      },
    })
    expect(result.record.stages).toEqual(bothPlan().steps.map((step) => step.id))
    expect(fake.logs.some((line) => line.startsWith("  admin.diaspora.ga : retour arrière possible vers la version"))).toBe(true)
  })

  test("sans la première confirmation, aucune commande ne part", async () => {
    const fake = fakeBothDeps({ answers: [false] })
    expect(await executeRelease(bothPlan(), fake.deps)).toMatchObject({ ok: false, stage: "agreement" })
    expect(fake.calls).toEqual([])
  })

  test("un contrôle privé en écart sur la seconde application : AUCUNE bascule, pas même celle de la première", async () => {
    const fake = fakeBothDeps({ fail: { "private-check:diaspora_ga": { ...report(VERSION), dataSource: "demo" } } })
    const result = await executeRelease(bothPlan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "private-check:diaspora_ga" })
    expect(result.reason).toContain("aucune bascule : aucun domaine ne change")
    expect(fake.commands().some((command) => command.startsWith("vercel promote"))).toBe(false)
  })

  test("sans la seconde confirmation, les deux déploiements restent publiés sans domaine", async () => {
    const fake = fakeBothDeps({ answers: [true, false] })
    expect(await executeRelease(bothPlan(), fake.deps)).toMatchObject({ ok: false, stage: "confirm-promote", reason: "bascule non confirmée : les déploiements restent publiés sans domaine" })
    expect(fake.commands().some((command) => command.startsWith("vercel promote"))).toBe(false)
  })

  test("une bascule qui échoue sur la seconde dit que la première a déjà basculé", async () => {
    const fake = fakeBothDeps({ fail: { "promote:diaspora_ga": true } })
    const result = await executeRelease(bothPlan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "promote:diaspora_ga" })
    expect(result.reason).toBe("la bascule a échoué : vérifier la version servie avec release-check ; déjà basculé : admin.diaspora.ga")
  })

  test("un contrôle public en écart propose le retour arrière des deux, sans le jouer ; une première publication le dit", async () => {
    const fake = fakeBothDeps({ adminServed: false, fail: { "public-check:diaspora_ga": true } })
    const result = await executeRelease(bothPlan(), fake.deps)
    expect(result).toMatchObject({ ok: false, stage: "public-check:diaspora_ga" })
    expect(result.reason).toContain(`diaspora.ga : version servie « ${OLD_VERSION} », attendue « ${VERSION} »`)
    expect(result.reason).toContain("— retour arrière des deux, sur accord : admin.diaspora.ga : aucun déploiement précédent relevé ; ")
    expect(result.reason).toContain(`node scripts/rollback.mjs --target demo --to ${OLD_DEPLOYMENT} --version ${OLD_VERSION}`)
    expect(fake.commands().filter((command) => command.startsWith("vercel promote")).length).toBe(2)
    expect(result.record.stages).toContain("public-check:admin_diaspora_ga")
    expect(fake.logs.some((line) => line === "  admin.diaspora.ga : aucun déploiement servi relevé : première publication, aucun retour arrière possible")).toBe(true)
  })

  test("le journal d'exécution ne recopie aucune valeur de la machine", async () => {
    const fake = fakeBothDeps({ fail: { "private-check:admin_diaspora_ga": adminReport(ADMIN_VERSION, "slow") } })
    const result = await executeRelease(bothPlan(), fake.deps)
    expect(result.reason).toContain("moteur lent")
    const journal = fake.logs.join("\n")
    for (const value of Object.values(BOTH_ENV)) expect(journal).not.toContain(value)
  })
})
