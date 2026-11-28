import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"

import {
  agreementNotice,
  ALL_APPS_ORDER,
  ANTSIA_ROOT,
  appReleaseKeys,
  appsOf,
  appVariableNames,
  assertPublicOnly,
  catalogProblems,
  CHECK_KEYS,
  ROLLBACK_KEYS,
  DEFAULT_RELEASE_APP,
  confirmationPhrase,
  confirmPhrase,
  contextFingerprint,
  createWorkdir,
  deploymentUrlFrom,
  DIASPORA_GA_ROOT,
  ECOSYSTEMS_ROOT,
  envRef,
  freezeCommands,
  freezeContext,
  isExcludedFromContext,
  isInside,
  isPublishedCommit,
  otherTarget,
  parseApp,
  parseInspect,
  parseOptions,
  parseTarget,
  parseVersionLabel,
  PUBLIC_RELEASE_VARIABLES,
  readTargetEnv,
  RELEASE_APPS,
  releaseApp,
  releasePrerequisites,
  releaseVariables,
  releaseVersion,
  renderArg,
  renderCommand,
  repoRef,
  resolveCommand,
  resolveCommit,
  resolveStepEnv,
  runCommand,
  runtimeRef,
  targetVariableNames,
  VERCELIGNORE,
  versionLabelApp,
  versionProblems,
  writeRecord,
} from "./release-lib.mjs"

/** Valeurs FICTIVES (domaines réservés à la documentation, RFC 2606) : aucune ressource réelle. */
const DEMO_ENV = Object.freeze({
  DIASPORA_GA_DEMO_SITE_URL: "https://site-demo.example.org",
  DIASPORA_GA_DEMO_CONVEX_URL: "https://moteur-demo.example.net",
  DIASPORA_GA_DEMO_CONVEX_SITE_URL: "https://actions-demo.example.net",
  DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_demo",
  DIASPORA_GA_VERCEL_ORG_ID: "equipe_fictive",
  DIASPORA_GA_VERCEL_SCOPE: "portee-fictive",
})

const ANTSIA_COMMIT = "a".repeat(40)
const DIASPORA_GA_COMMIT = "d".repeat(40)

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.name=Essai", "-c", "user.email=essai@exemple.test", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8" })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe("cibles et variables de la machine", () => {
  test("deux cibles seulement, chacune avec ses propres noms de variables", () => {
    expect(parseTarget("demo")).toBe("demo")
    expect(parseTarget("production")).toBe("production")
    expect(parseTarget("preview")).toBeNull()
    expect(parseTarget(undefined)).toBeNull()
    expect(otherTarget("demo")).toBe("production")
    expect(otherTarget("production")).toBe("demo")
    expect(targetVariableNames("demo")).toEqual({
      siteUrl: "DIASPORA_GA_DEMO_SITE_URL",
      convexUrl: "DIASPORA_GA_DEMO_CONVEX_URL",
      convexSiteUrl: "DIASPORA_GA_DEMO_CONVEX_SITE_URL",
      projectId: "DIASPORA_GA_DEMO_VERCEL_PROJECT_ID",
      idnPortalUrl: "DIASPORA_GA_DEMO_IDN_PORTAL_URL",
      consulateUrl: "DIASPORA_GA_DEMO_CONSULATE_URL",
      smsEnabled: "DIASPORA_GA_DEMO_SMS_ENABLED",
      livekitWsUrl: "DIASPORA_GA_DEMO_LIVEKIT_WS_URL",
    })
    expect(Object.values(targetVariableNames("production")).every((name) => name.startsWith("DIASPORA_GA_PRODUCTION_"))).toBe(true)
  })

  test("le réglage SMS de la cible reste facultatif et accepte uniquement 0 ou 1", () => {
    const name = "DIASPORA_GA_DEMO_SMS_ENABLED"
    for (const value of [undefined, "", "0", "1", "true", " 1", "2"]) {
      const { values, problems } = readTargetEnv("demo", { ...DEMO_ENV, [name]: value })
      const entry = releaseVariables("demo", "version", values).find(([key]) => key === "NEXT_PUBLIC_DIASPORA_SMS_ENABLED")
      if (value === "0" || value === "1") {
        expect(problems).toEqual([])
        expect(values.smsEnabled).toBe(value)
        expect(entry).toEqual(["NEXT_PUBLIC_DIASPORA_SMS_ENABLED", envRef(name)])
      } else {
        expect(problems).toEqual(value ? [`${name} doit valoir 0 ou 1`] : [])
        expect(entry).toBeUndefined()
      }
    }
    for (const operationKeys of [CHECK_KEYS, ROLLBACK_KEYS]) {
      expect(readTargetEnv("demo", { ...DEMO_ENV, [name]: "périmé" }, operationKeys).problems).toEqual([])
    }
  })

  test("un environnement complet se lit sans défaut", () => {
    const { values, problems } = readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_SITE_URL: "  https://site-demo.example.org  " })
    expect(problems).toEqual([])
    expect(values).toEqual({
      siteUrl: "https://site-demo.example.org",
      convexUrl: DEMO_ENV.DIASPORA_GA_DEMO_CONVEX_URL,
      convexSiteUrl: DEMO_ENV.DIASPORA_GA_DEMO_CONVEX_SITE_URL,
      projectId: DEMO_ENV.DIASPORA_GA_DEMO_VERCEL_PROJECT_ID,
      orgId: DEMO_ENV.DIASPORA_GA_VERCEL_ORG_ID,
      scope: DEMO_ENV.DIASPORA_GA_VERCEL_SCOPE,
    })
  })

  test("les défauts nomment les variables, jamais leur valeur", () => {
    const { problems } = readTargetEnv("demo", {
      ...DEMO_ENV,
      DIASPORA_GA_DEMO_SITE_URL: "http://site-demo.example.org",
      DIASPORA_GA_DEMO_CONVEX_URL: "https://moteur-demo.example.net/chemin",
      DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet fictif",
      DIASPORA_GA_VERCEL_SCOPE: undefined,
    })
    expect(problems).toEqual([
      "DIASPORA_GA_DEMO_SITE_URL doit être une origine https, sans chemin ni barre finale",
      "DIASPORA_GA_DEMO_CONVEX_URL doit être une origine https, sans chemin ni barre finale",
      "DIASPORA_GA_DEMO_VERCEL_PROJECT_ID n'a pas la forme d'un identifiant (lettres, chiffres, « _ », « - », « . »)",
      "DIASPORA_GA_VERCEL_SCOPE manque",
    ])
    expect(problems.join(" ")).not.toContain("example")
  })

  test("un poste de développement ne se publie pas", () => {
    for (const site of ["https://localhost:3031", "https://diaspora-ga.localhost", "https://essai.test", "https://127.0.0.1"]) {
      expect(readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_SITE_URL: site }).problems).toEqual([
        "DIASPORA_GA_DEMO_SITE_URL doit désigner un domaine public : un poste de développement ne se publie pas",
      ])
    }
  })

  test("une cible ne se publie jamais sur la ressource de l'autre", () => {
    const { problems } = readTargetEnv("demo", {
      ...DEMO_ENV,
      DIASPORA_GA_PRODUCTION_CONVEX_URL: DEMO_ENV.DIASPORA_GA_DEMO_CONVEX_URL,
      DIASPORA_GA_PRODUCTION_VERCEL_PROJECT_ID: DEMO_ENV.DIASPORA_GA_DEMO_VERCEL_PROJECT_ID,
      DIASPORA_GA_PRODUCTION_SITE_URL: "https://autre-site.example.org",
    })
    expect(problems).toEqual([
      "DIASPORA_GA_DEMO_CONVEX_URL et DIASPORA_GA_PRODUCTION_CONVEX_URL désignent la même ressource : une cible ne se publie jamais sur l'autre",
      "DIASPORA_GA_DEMO_VERCEL_PROJECT_ID et DIASPORA_GA_PRODUCTION_VERCEL_PROJECT_ID désignent la même ressource : une cible ne se publie jamais sur l'autre",
    ])
  })

  test("les liens d'élévation sont facultatifs, en https quand ils sont posés", () => {
    expect(readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_IDN_PORTAL_URL: "https://idn.example.org/entrer" }).values.idnPortalUrl).toBe("https://idn.example.org/entrer")
    expect(readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_CONSULATE_URL: "ftp://consulat.example.org" }).problems).toEqual(["DIASPORA_GA_DEMO_CONSULATE_URL doit être une adresse https"])
  })

  test("le serveur média est facultatif ; posé, c'est une origine wss exacte (CH-817)", () => {
    expect(readTargetEnv("demo", DEMO_ENV).values.livekitWsUrl).toBeUndefined()
    expect(readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_LIVEKIT_WS_URL: " wss://media-demo.example.net " }).values.livekitWsUrl).toBe("wss://media-demo.example.net")
    expect(readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_LIVEKIT_WS_URL: "wss://media-demo.example.net" }).problems).toEqual([])
    for (const value of ["https://media-demo.example.net", "ws://media-demo.example.net", "wss://media-demo.example.net/", "wss://media-demo.example.net/rtc", "wss://media-demo.example.net?jeton=1", "media-demo.example.net"]) {
      const { problems } = readTargetEnv("demo", { ...DEMO_ENV, DIASPORA_GA_DEMO_LIVEKIT_WS_URL: value })
      expect(problems, value).toEqual(["DIASPORA_GA_DEMO_LIVEKIT_WS_URL doit être une origine wss, sans chemin ni barre finale"])
      expect(problems.join(" ")).not.toContain("example")
    }
    // Le site d'administration n'ouvre aucun serveur média : la variable ne s'y lit pas.
    expect(readTargetEnv("demo", { ...DEMO_ENV, ADMIN_DIASPORA_GA_DEMO_SITE_URL: "https://admin-demo.example.org", ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_admin_demo", DIASPORA_GA_DEMO_LIVEKIT_WS_URL: "wss://media-demo.example.net" }, undefined, "admin_diaspora_ga").values.livekitWsUrl).toBeUndefined()
  })

  test("le contrôle n'exige que le site et le moteur", () => {
    expect(readTargetEnv("production", {}, CHECK_KEYS).problems).toEqual(["DIASPORA_GA_PRODUCTION_SITE_URL manque", "DIASPORA_GA_PRODUCTION_CONVEX_URL manque"])
  })
})

describe("variables publiques seulement", () => {
  test("la liste est celle du catalogue de publication du moteur pour diaspora_ga", () => {
    const catalog = JSON.parse(readFileSync(join(ANTSIA_ROOT, "deploy", "catalog.json"), "utf8"))
    const app = catalog.applications.diaspora_ga
    expect([...PUBLIC_RELEASE_VARIABLES].sort()).toEqual([...app.build_args, ...app.runtime_env].sort())
  })

  test("un secret, ou toute variable hors liste, fait échouer le plan", () => {
    expect(() => assertPublicOnly([["BETTER_AUTH_SECRET", "x"]])).toThrow("BETTER_AUTH_SECRET")
    expect(() => assertPublicOnly([["NEXT_PUBLIC_SITE_URL", "x"], ["CONVEX_DEPLOY_KEY", "y"]])).toThrow("CONVEX_DEPLOY_KEY")
    expect(assertPublicOnly([["CONVEX_SITE_URL", "x"]])).toEqual([["CONVEX_SITE_URL", "x"]])
  })

  test("la source est toujours le moteur, la version tirée des commits, les adresses des références", () => {
    const version = releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "demo" })
    expect(releaseVariables("demo", version, {})).toEqual([
      ["NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE", "engine"],
      ["NEXT_PUBLIC_SITE_URL", envRef("DIASPORA_GA_DEMO_SITE_URL")],
      ["NEXT_PUBLIC_CONVEX_URL", envRef("DIASPORA_GA_DEMO_CONVEX_URL")],
      ["CONVEX_SITE_URL", envRef("DIASPORA_GA_DEMO_CONVEX_SITE_URL")],
      ["NEXT_PUBLIC_CONVEX_SITE_URL", envRef("DIASPORA_GA_DEMO_CONVEX_SITE_URL")],
      ["NEXT_PUBLIC_BUILD_SHA", version],
    ])
    const withLinks = releaseVariables("demo", version, { idnPortalUrl: "x", consulateUrl: "y" }).map(([name]) => name)
    expect(withLinks.slice(-2)).toEqual(["NEXT_PUBLIC_IDN_PORTAL_URL", "NEXT_PUBLIC_CONSULATE_URL"])
  })

  test("CH-817 : le navigateur lit l'origine des actions HTTP du moteur ; le serveur média ne passe que s'il est posé", () => {
    const version = releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "production" })
    const names = (values) => releaseVariables("production", version, values).map(([name]) => name)
    // La même variable de la machine que `CONVEX_SITE_URL` : une seule origine, deux lecteurs.
    expect(releaseVariables("production", version, {}).find(([name]) => name === "NEXT_PUBLIC_CONVEX_SITE_URL")).toEqual(["NEXT_PUBLIC_CONVEX_SITE_URL", envRef("DIASPORA_GA_PRODUCTION_CONVEX_SITE_URL")])
    expect(names({})).not.toContain("LIVEKIT_WS_URL")
    expect(releaseVariables("production", version, { livekitWsUrl: "x" }).at(-1)).toEqual(["LIVEKIT_WS_URL", envRef("DIASPORA_GA_PRODUCTION_LIVEKIT_WS_URL")])
    // Aucune des deux n'est un secret : toutes deux sont dans la liste publique, celle du catalogue.
    for (const name of ["NEXT_PUBLIC_CONVEX_SITE_URL", "LIVEKIT_WS_URL"]) expect(PUBLIC_RELEASE_VARIABLES).toContain(name)
  })
})

describe("étiquette de version", () => {
  test("tirée des deux commits et de la cible, comme la méthode du 22/10", () => {
    expect(releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "production" })).toBe(
      "diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-production",
    )
    expect(() => releaseVersion({ diasporaGaCommit: "abc123", antsiaCommit: ANTSIA_COMMIT, target: "demo" })).toThrow("Commit complet")
    expect(() => releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "preview" })).toThrow("Cible inconnue")
  })

  test("se relit, ou rien", () => {
    expect(parseVersionLabel("diaspora-ga-0123456789ab-antsia-ba9876543210-demo")).toEqual({ diasporaGa: "0123456789ab", antsia: "ba9876543210", target: "demo" })
    expect(parseVersionLabel("main-0123456789ab-demo")).toBeNull()
    expect(parseVersionLabel(undefined)).toBeNull()
  })
})

describe("commandes affichées et résolues", () => {
  const argv = ["vercel", "deploy", runtimeRef("context", "contexte figé"), "--scope", envRef("DIASPORA_GA_VERCEL_SCOPE"), "--build-env", ["NEXT_PUBLIC_SITE_URL=", envRef("DIASPORA_GA_DEMO_SITE_URL")]]

  test("le plan nomme les variables et ne recopie aucune valeur", () => {
    expect(renderCommand(argv)).toBe("vercel deploy '<contexte figé>' --scope <DIASPORA_GA_VERCEL_SCOPE> --build-env NEXT_PUBLIC_SITE_URL=<DIASPORA_GA_DEMO_SITE_URL>")
    expect(renderArg(repoRef("ANTSIA"))).toBe("ANTSIA")
    expect(renderArg("l'arbre")).toBe("'l'\\''arbre'")
  })

  test("l'exécution résout chaque référence, et refuse une valeur absente en la nommant", () => {
    const context = { env: DEMO_ENV, runtime: { context: "/tmp/contexte" }, repos: { ANTSIA: "/depots/ANTSIA" } }
    expect(resolveCommand(argv, context)).toEqual([
      "vercel",
      "deploy",
      "/tmp/contexte",
      "--scope",
      "portee-fictive",
      "--build-env",
      "NEXT_PUBLIC_SITE_URL=https://site-demo.example.org",
    ])
    expect(resolveCommand(["git", "-C", repoRef("ANTSIA")], context)).toEqual(["git", "-C", "/depots/ANTSIA"])
    expect(() => resolveCommand(argv, { ...context, env: {} })).toThrow("DIASPORA_GA_VERCEL_SCOPE manque")
    expect(() => resolveCommand(argv, { ...context, runtime: {} })).toThrow("Valeur d'exécution absente : contexte figé")
    expect(() => resolveCommand([repoRef("AUTRE")], context)).toThrow("Dépôt inconnu : AUTRE")
    expect(resolveStepEnv({ VERCEL_ORG_ID: envRef("DIASPORA_GA_VERCEL_ORG_ID") }, context)).toEqual({ VERCEL_ORG_ID: "equipe_fictive" })
    expect(resolveStepEnv(undefined, context)).toEqual({})
  })

  test("une commande se lance sans shell, sortie capturée", () => {
    expect(runCommand(["git", "--version"])).toMatchObject({ status: 0 })
    expect(runCommand(["git", "--version"]).stdout).toStartWith("git version")
    expect(runCommand(["commande-inexistante-diaspora-ga"]).status).toBe(1)
  })
})

describe("commits", () => {
  const fakeRun = (answers) => (argv) => ({ status: 0, stdout: answers[argv.at(-1)] ?? "" })

  test("une référence se résout en commit et arbre complets", () => {
    const run = fakeRun({ "origin/main^{commit}": `${DIASPORA_GA_COMMIT}\n`, [`${DIASPORA_GA_COMMIT}^{tree}`]: `${"e".repeat(40)}\n` })
    expect(resolveCommit("/depot", "origin/main", run)).toEqual({ commit: DIASPORA_GA_COMMIT, tree: "e".repeat(40) })
  })

  test("une référence illisible, introuvable ou qui passerait pour une option est refusée", () => {
    expect(() => resolveCommit("/depot", "--upload-pack=x", fakeRun({}))).toThrow("illisible")
    expect(() => resolveCommit("/depot", "main;rm", fakeRun({}))).toThrow("illisible")
    expect(() => resolveCommit("/depot", "inconnu", fakeRun({}))).toThrow("Commit introuvable")
    expect(() => resolveCommit("/depot", "main", fakeRun({ "main^{commit}": DIASPORA_GA_COMMIT }))).toThrow("Arbre introuvable")
  })

  test("« publié » veut dire ancêtre d'origin/main", () => {
    const calls = []
    const run = (argv) => {
      calls.push(argv)
      return { status: argv.includes(ANTSIA_COMMIT) ? 0 : 1, stdout: "" }
    }
    expect(isPublishedCommit("/depot", ANTSIA_COMMIT, run)).toBe(true)
    expect(isPublishedCommit("/depot", DIASPORA_GA_COMMIT, run)).toBe(false)
    expect(calls[0]).toEqual(["git", "-C", "/depot", "merge-base", "--is-ancestor", ANTSIA_COMMIT, "origin/main"])
  })
})

describe("contexte figé", () => {
  test("exclut ce que la méthode du 22/10 excluait", () => {
    for (const path of ["ANTSIA/node_modules/x.js", "DIASPORA_GA/docs/a.md", "ANTSIA/.env.local", "DIASPORA_GA/CLAUDE.md", "x/tsconfig.tsbuildinfo", "ANTSIA/.convex/y", "a/.vercel/project.json"]) {
      expect(isExcludedFromContext(path)).toBe(true)
    }
    for (const path of ["ANTSIA/package.json", "DIASPORA_GA/apps/diaspora_ga/Dockerfile", ".vercelignore"]) {
      expect(isExcludedFromContext(path)).toBe(false)
    }
    expect(VERCELIGNORE.split("\n")).toContain("**/.env*")
    expect(VERCELIGNORE.split("\n")).toContain("**/docs/**")
  })

  test("l'empreinte ne dépend que des fichiers retenus, et change avec eux", () => {
    const dir = mkdtempSync(join(tmpdir(), "diaspora-ga-empreinte-"))
    mkdirSync(join(dir, "ANTSIA", "node_modules"), { recursive: true })
    writeFileSync(join(dir, "ANTSIA", "a.ts"), "export const a = 1\n")
    writeFileSync(join(dir, "ANTSIA", ".env.local"), "SECRET=fictif\n")
    writeFileSync(join(dir, "ANTSIA", "node_modules", "b.js"), "x")
    symlinkSync("a.ts", join(dir, "ANTSIA", "lien.ts"))
    const first = contextFingerprint(dir)
    expect(first.files).toBe(2)
    writeFileSync(join(dir, "ANTSIA", ".env.local"), "SECRET=autre\n")
    expect(contextFingerprint(dir)).toEqual(first)
    writeFileSync(join(dir, "ANTSIA", "a.ts"), "export const a = 2\n")
    expect(contextFingerprint(dir).fingerprint).not.toBe(first.fingerprint)
  })

  test("les commandes de gel : git archive du commit, puis extraction dans le contexte", () => {
    expect(freezeCommands("ANTSIA", ANTSIA_COMMIT).map(renderCommand)).toEqual([
      `git -C ANTSIA archive --format=tar -o '<dossier de travail>/ANTSIA.tar' ${ANTSIA_COMMIT}`,
      "tar -xf '<dossier de travail>/ANTSIA.tar' -C '<contexte figé>/ANTSIA'",
    ])
  })

  test("de vrais dépôts : seuls les fichiers SUIVIS du commit partent, jamais un .env.local", () => {
    const root = mkdtempSync(join(tmpdir(), "diaspora-ga-depots-"))
    const commits = {}
    for (const name of ["ANTSIA", "DIASPORA_GA"]) {
      const repo = join(root, name)
      mkdirSync(join(repo, "docs"), { recursive: true })
      git(repo, "init", "-q")
      writeFileSync(join(repo, "package.json"), `{"name":"${name.toLowerCase()}"}\n`)
      writeFileSync(join(repo, "docs", "note.md"), "document de travail\n")
      git(repo, "add", "package.json", "docs/note.md")
      git(repo, "commit", "-q", "-m", "essai")
      commits[name] = git(repo, "rev-parse", "HEAD")
      writeFileSync(join(repo, ".env.local"), "SECRET=fictif\n")
      writeFileSync(join(repo, "brouillon.ts"), "non suivi\n")
    }
    const workdir = mkdtempSync(join(tmpdir(), "diaspora-ga-travail-"))
    const frozen = freezeContext({ workdir, commits, repos: { ANTSIA: join(root, "ANTSIA"), DIASPORA_GA: join(root, "DIASPORA_GA") } })
    expect(frozen.context).toBe(join(workdir, "ECOSYSTEMES"))
    expect(readdirSync(join(frozen.context, "ANTSIA")).sort()).toEqual(["docs", "package.json"])
    expect(existsSync(join(frozen.context, "DIASPORA_GA", ".env.local"))).toBe(false)
    expect(existsSync(join(frozen.context, "DIASPORA_GA", "brouillon.ts"))).toBe(false)
    expect(readFileSync(join(frozen.context, ".vercelignore"), "utf8")).toBe(VERCELIGNORE)
    expect(frozen.files).toBe(3)
    expect(frozen.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  test("un gel qui échoue s'arrête en nommant la commande", () => {
    const workdir = mkdtempSync(join(tmpdir(), "diaspora-ga-travail-"))
    expect(() => freezeContext({ workdir, commits: { ANTSIA: ANTSIA_COMMIT }, run: () => ({ status: 128, stdout: "" }) })).toThrow("git -C ANTSIA archive")
  })

  test("le dossier de travail est neuf, vide, hors des dépôts", () => {
    const base = mkdtempSync(join(tmpdir(), "diaspora-ga-base-"))
    const workdir = createWorkdir({}, base)
    expect(isInside(workdir, base)).toBe(true)
    expect(readdirSync(workdir)).toEqual([])
    expect(createWorkdir({}, base)).not.toBe(workdir)
    expect(isInside(createWorkdir({ DIASPORA_GA_RELEASE_WORKDIR: base }), base)).toBe(true)
    expect(() => createWorkdir({ DIASPORA_GA_RELEASE_WORKDIR: join(DIASPORA_GA_ROOT, "tmp") })).toThrow("hors des dépôts")
    expect(isInside(DIASPORA_GA_ROOT, ECOSYSTEMS_ROOT)).toBe(true)
    expect(isInside(ECOSYSTEMS_ROOT, DIASPORA_GA_ROOT)).toBe(false)
  })

  test("le relevé s'écrit dans le dossier de travail", () => {
    const workdir = mkdtempSync(join(tmpdir(), "diaspora-ga-travail-"))
    writeRecord(workdir, { version: "v" })
    expect(JSON.parse(readFileSync(join(workdir, "release.json"), "utf8"))).toEqual({ version: "v" })
  })
})

describe("réponses de l'hébergeur", () => {
  test("inspect : ce qui sert, adresse en https", () => {
    expect(parseInspect(JSON.stringify({ id: "d1", url: "deploiement.example.org", readyState: "READY", target: "production", projectId: "p1" }))).toEqual({
      id: "d1",
      url: "https://deploiement.example.org",
      readyState: "READY",
      target: "production",
      projectId: "p1",
    })
    expect(parseInspect(JSON.stringify({ id: "d2", url: "https://deploiement.example.org" }))).toEqual({
      id: "d2",
      url: "https://deploiement.example.org",
      readyState: null,
      target: null,
      projectId: null,
    })
    expect(parseInspect(JSON.stringify({ id: "d3" }))?.url).toBeNull()
    expect(parseInspect("pas du JSON")).toBeNull()
    expect(parseInspect(JSON.stringify({ url: "x" }))).toBeNull()
  })

  test("deploy : l'adresse est la dernière ligne de la sortie standard", () => {
    expect(deploymentUrlFrom("journal\nhttps://deploiement.example.org\n")).toBe("https://deploiement.example.org")
    expect(deploymentUrlFrom("Error: quota\n")).toBeNull()
    expect(deploymentUrlFrom("")).toBeNull()
  })
})

describe("la porte", () => {
  test("la phrase nomme l'action, la cible et la version", () => {
    expect(confirmationPhrase("PUBLIER", "demo", "v1")).toBe("PUBLIER demo v1")
    const notice = agreementNotice(["commits : …", "cible : demo"])
    expect(notice).toContain("accord écrit et détaillé du propriétaire")
    expect(notice).toContain("  • cible : demo")
    expect(notice).toContain("rien ne partira")
  })

  test("hors d'un terminal, la confirmation est refusée sans rien lire", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    input.write("PUBLIER demo v1\n")
    expect(await confirmPhrase("PUBLIER demo v1", { input, output })).toBe(false)
    expect(output.read().toString()).toContain("se tape dans un terminal")
  })

  test("dans un terminal, seule la phrase exacte confirme", async () => {
    const ask = async (answer) => {
      const input = Object.assign(new PassThrough(), { isTTY: true })
      const pending = confirmPhrase("PUBLIER demo v1", { input, output: new PassThrough() })
      if (answer === null) input.end()
      else input.write(`${answer}\n`)
      return pending
    }
    expect(await ask("PUBLIER demo v1")).toBe(true)
    expect(await ask("  PUBLIER demo v1  ")).toBe(true)
    expect(await ask("oui")).toBe(false)
    expect(await ask("PUBLIER production v1")).toBe(false)
    expect(await ask(null)).toBe(false)
  })
})

describe("ligne de commande", () => {
  test("valeurs, drapeaux, et tout le reste en défaut", () => {
    expect(parseOptions(["--target", "demo", "--execute"], { values: ["target"], flags: ["execute"] })).toEqual({ options: { target: "demo", execute: true }, problems: [] })
    expect(parseOptions(["--target", "--execute", "--yes", "seul"], { values: ["target"], flags: ["execute"] })).toEqual({
      options: { execute: true },
      problems: [
        "--target attend une valeur",
        "argument inconnu : --yes",
        "argument inconnu : seul",
      ],
    })
    expect(parseOptions(["--target"], { values: ["target"], flags: [] }).problems).toEqual(["--target attend une valeur"])
  })
})

// ═══════════════════════════════════════════════════════════════
// La dimension --app (CH-815, lot A8) : diaspora.ga et admin.diaspora.ga
// ═══════════════════════════════════════════════════════════════

const ADMIN = "admin_diaspora_ga"

/** Valeurs FICTIVES (RFC 2606) : la démonstration des deux applications, sur un même moteur. */
const BOTH_DEMO_ENV = Object.freeze({
  ...DEMO_ENV,
  ADMIN_DIASPORA_GA_DEMO_SITE_URL: "https://admin-demo.example.org",
  ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: "projet_fictif_admin_demo",
})

/** L'entrée du catalogue telle que le contrat du chantier la fixe (CH-815, entrée admin_diaspora_ga). */
const CONTRACT_CATALOG = Object.freeze({
  applications: {
    diaspora_ga: {
      path: "../DIASPORA_GA/apps/diaspora_ga",
      build_args: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE", "NEXT_PUBLIC_DIASPORA_SMS_ENABLED", "NEXT_PUBLIC_IDN_PORTAL_URL", "NEXT_PUBLIC_CONSULATE_URL", "NEXT_PUBLIC_CONVEX_SITE_URL"],
      // CH-817 : lue à la construction par la configuration commune du moteur, comme CONVEX_SITE_URL, et facultative.
      runtime_env: ["CONVEX_SITE_URL", "LIVEKIT_WS_URL"],
    },
    admin_diaspora_ga: {
      path: "../DIASPORA_GA/apps/admin_diaspora_ga",
      administers_network: "diaspora-ga",
      build_args: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_MEMBERS_SITE_URL"],
      runtime_env: ["CONVEX_SITE_URL"],
    },
  },
})

const diskCatalog = JSON.parse(readFileSync(join(ANTSIA_ROOT, "deploy", "catalog.json"), "utf8"))

describe("applications : une ligne chacune", () => {
  test("deux applications ; sans --app, diaspora.ga seule ; all = admin.diaspora.ga puis diaspora.ga", () => {
    expect(Object.keys(RELEASE_APPS)).toEqual(["diaspora_ga", ADMIN])
    expect(DEFAULT_RELEASE_APP).toBe("diaspora_ga")
    expect(appsOf()).toEqual(["diaspora_ga"])
    expect(appsOf(undefined)).toEqual(["diaspora_ga"])
    expect(appsOf(ADMIN)).toEqual([ADMIN])
    expect(appsOf("all")).toEqual(ALL_APPS_ORDER)
    expect(ALL_APPS_ORDER).toEqual([ADMIN, "diaspora_ga"])
    expect(() => releaseApp("autre_site")).toThrow("Application inconnue : autre_site")
    expect(() => appsOf("autre_site")).toThrow("Application inconnue")
    expect(Object.isFrozen(RELEASE_APPS.admin_diaspora_ga.siteVariables[0])).toBe(true)
  })

  test("--app : absente, connue, all seulement pour publier, inconnue refusée en français", () => {
    expect(parseApp(undefined)).toEqual({ app: undefined, problem: null })
    expect(parseApp("diaspora_ga")).toEqual({ app: "diaspora_ga", problem: null })
    expect(parseApp(ADMIN)).toEqual({ app: ADMIN, problem: null })
    expect(parseApp("all", { allowAll: true })).toEqual({ app: "all", problem: null })
    expect(parseApp("all")).toEqual({
      app: undefined,
      problem: "--app all ne vaut que pour la publication : chaque application se contrôle et se remet en arrière par sa propre commande",
    })
    expect(parseApp("admin", { allowAll: true })).toEqual({
      app: undefined,
      problem: "--app inconnue (« admin ») : valeurs admises diaspora_ga (par défaut), admin_diaspora_ga, all (les deux, dans la même séance)",
    })
    expect(parseApp("toString").problem).toContain("--app inconnue")
  })

  test("les variables d'admin.diaspora.ga : son site et son projet ; le moteur et le site des membres, ceux de la cible", () => {
    expect(appVariableNames(ADMIN, "demo")).toEqual({
      siteUrl: "ADMIN_DIASPORA_GA_DEMO_SITE_URL",
      convexUrl: "DIASPORA_GA_DEMO_CONVEX_URL",
      convexSiteUrl: "DIASPORA_GA_DEMO_CONVEX_SITE_URL",
      projectId: "ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID",
      membersSiteUrl: "DIASPORA_GA_DEMO_SITE_URL",
    })
    expect(Object.values(appVariableNames(ADMIN, "production")).every((name) => name.includes("_PRODUCTION_"))).toBe(true)
    expect(appVariableNames(ADMIN, "demo").membersSiteUrl).toBe(targetVariableNames("demo").siteUrl)
    expect(appReleaseKeys(ADMIN)).toEqual([...appReleaseKeys(), "membersSiteUrl"])
    expect(appReleaseKeys()).toEqual(RELEASE_APPS.diaspora_ga.releaseKeys)
  })

  test("un environnement complet d'admin.diaspora.ga se lit sans défaut", () => {
    const { values, problems } = readTargetEnv("demo", BOTH_DEMO_ENV, appReleaseKeys(ADMIN), ADMIN)
    expect(problems).toEqual([])
    expect(values).toEqual({
      siteUrl: "https://admin-demo.example.org",
      convexUrl: DEMO_ENV.DIASPORA_GA_DEMO_CONVEX_URL,
      convexSiteUrl: DEMO_ENV.DIASPORA_GA_DEMO_CONVEX_SITE_URL,
      projectId: "projet_fictif_admin_demo",
      orgId: DEMO_ENV.DIASPORA_GA_VERCEL_ORG_ID,
      scope: DEMO_ENV.DIASPORA_GA_VERCEL_SCOPE,
      membersSiteUrl: DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL,
    })
  })

  test("les défauts d'admin.diaspora.ga nomment ses variables, jamais leur valeur ; ni lien IDN ni consulat.ga", () => {
    const { problems } = readTargetEnv(
      "production",
      { ADMIN_DIASPORA_GA_PRODUCTION_SITE_URL: "https://admin.localhost", DIASPORA_GA_PRODUCTION_SITE_URL: "https://site.example.org/chemin", DIASPORA_GA_PRODUCTION_IDN_PORTAL_URL: "ftp://idn.example.org" },
      appReleaseKeys(ADMIN),
      ADMIN,
    )
    expect(problems).toEqual([
      "ADMIN_DIASPORA_GA_PRODUCTION_SITE_URL doit désigner un domaine public : un poste de développement ne se publie pas",
      "DIASPORA_GA_PRODUCTION_CONVEX_URL manque",
      "DIASPORA_GA_PRODUCTION_CONVEX_SITE_URL manque",
      "ADMIN_DIASPORA_GA_PRODUCTION_VERCEL_PROJECT_ID manque",
      "DIASPORA_GA_VERCEL_ORG_ID manque",
      "DIASPORA_GA_VERCEL_SCOPE manque",
      "DIASPORA_GA_PRODUCTION_SITE_URL doit être une origine https, sans chemin ni barre finale",
    ])
    expect(problems.join(" ")).not.toContain("example")
  })

  test("une application ne se publie jamais sur le site ni sur le projet de l'autre, dans les deux sens", () => {
    const same = { ...BOTH_DEMO_ENV, ADMIN_DIASPORA_GA_DEMO_SITE_URL: DEMO_ENV.DIASPORA_GA_DEMO_SITE_URL, ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID: DEMO_ENV.DIASPORA_GA_DEMO_VERCEL_PROJECT_ID }
    expect(readTargetEnv("demo", same, appReleaseKeys(ADMIN), ADMIN).problems).toEqual([
      "ADMIN_DIASPORA_GA_DEMO_SITE_URL et DIASPORA_GA_DEMO_SITE_URL désignent la même ressource : une application ne se publie jamais sur l'autre",
      "ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID et DIASPORA_GA_DEMO_VERCEL_PROJECT_ID désignent la même ressource : une application ne se publie jamais sur l'autre",
    ])
    expect(readTargetEnv("demo", same).problems).toEqual([
      "DIASPORA_GA_DEMO_SITE_URL et ADMIN_DIASPORA_GA_DEMO_SITE_URL désignent la même ressource : une application ne se publie jamais sur l'autre",
      "DIASPORA_GA_DEMO_VERCEL_PROJECT_ID et ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID désignent la même ressource : une application ne se publie jamais sur l'autre",
    ])
    expect(readTargetEnv("demo", BOTH_DEMO_ENV).problems).toEqual([])
  })

  test("admin.diaspora.ga ne se publie jamais sur la ressource de l'autre cible", () => {
    const { problems } = readTargetEnv("demo", { ...BOTH_DEMO_ENV, ADMIN_DIASPORA_GA_PRODUCTION_VERCEL_PROJECT_ID: "projet_fictif_admin_demo" }, appReleaseKeys(ADMIN), ADMIN)
    expect(problems).toEqual([
      "ADMIN_DIASPORA_GA_DEMO_VERCEL_PROJECT_ID et ADMIN_DIASPORA_GA_PRODUCTION_VERCEL_PROJECT_ID désignent la même ressource : une cible ne se publie jamais sur l'autre",
    ])
  })

  test("le contrôle et le retour arrière d'admin.diaspora.ga lisent SON site", () => {
    expect(readTargetEnv("demo", {}, CHECK_KEYS, ADMIN).problems).toEqual(["ADMIN_DIASPORA_GA_DEMO_SITE_URL manque", "DIASPORA_GA_DEMO_CONVEX_URL manque"])
  })
})

describe("variables publiques d'admin.diaspora.ga", () => {
  test("sa liste est celle du contrat du catalogue : jamais la source de données, jamais les liens d'élévation", () => {
    const entry = CONTRACT_CATALOG.applications.admin_diaspora_ga
    expect([...releaseApp(ADMIN).publicVariables].sort()).toEqual([...entry.build_args, ...entry.runtime_env].sort())
    expect(releaseApp(ADMIN).publicVariables).not.toContain("NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE")
  })

  test.if(Boolean(diskCatalog.applications.admin_diaspora_ga))("quand le catalogue du moteur porte l'entrée, elle est celle des scripts", () => {
    expect(catalogProblems(diskCatalog, ADMIN)).toEqual([])
  })

  test("le site d'administration reçoit son origine, le moteur de la cible, l'étiquette et l'adresse du site des membres", () => {
    const version = releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "demo", app: ADMIN })
    expect(releaseVariables("demo", version, { idnPortalUrl: "x", consulateUrl: "y" }, ADMIN)).toEqual([
      ["NEXT_PUBLIC_SITE_URL", envRef("ADMIN_DIASPORA_GA_DEMO_SITE_URL")],
      ["NEXT_PUBLIC_CONVEX_URL", envRef("DIASPORA_GA_DEMO_CONVEX_URL")],
      ["CONVEX_SITE_URL", envRef("DIASPORA_GA_DEMO_CONVEX_SITE_URL")],
      ["NEXT_PUBLIC_BUILD_SHA", version],
      ["NEXT_PUBLIC_MEMBERS_SITE_URL", envRef("DIASPORA_GA_DEMO_SITE_URL")],
    ])
  })

  test("chaque application a SA liste : une variable des membres est refusée au site d'administration, et l'inverse", () => {
    expect(() => assertPublicOnly([["NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE", "engine"]], ADMIN)).toThrow("NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE")
    expect(() => assertPublicOnly([["NEXT_PUBLIC_MEMBERS_SITE_URL", "x"]])).toThrow("NEXT_PUBLIC_MEMBERS_SITE_URL")
    expect(() => assertPublicOnly([["BETTER_AUTH_SECRET", "x"]], ADMIN)).toThrow("BETTER_AUTH_SECRET")
    expect(assertPublicOnly([["NEXT_PUBLIC_MEMBERS_SITE_URL", "x"]], ADMIN)).toEqual([["NEXT_PUBLIC_MEMBERS_SITE_URL", "x"]])
  })
})

describe("étiquettes de version par application", () => {
  const admin = releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "production", app: ADMIN })
  const members = releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "production" })

  test("même forme, préfixe de l'application ; une étiquette ne se lit que pour SON application", () => {
    expect(admin).toBe("admin-diaspora-ga-dddddddddddd-antsia-aaaaaaaaaaaa-production")
    expect(parseVersionLabel(admin, ADMIN)).toEqual({ diasporaGa: "dddddddddddd", antsia: "aaaaaaaaaaaa", target: "production" })
    expect(parseVersionLabel(admin)).toBeNull()
    expect(parseVersionLabel(members, ADMIN)).toBeNull()
    expect(versionLabelApp(admin)).toBe(ADMIN)
    expect(versionLabelApp(members)).toBe("diaspora_ga")
    expect(versionLabelApp("main-0123456789ab-demo")).toBeNull()
    expect(() => releaseVersion({ diasporaGaCommit: DIASPORA_GA_COMMIT, antsiaCommit: ANTSIA_COMMIT, target: "demo", app: "autre" })).toThrow("Application inconnue")
  })

  test("--version : la forme d'avant pour diaspora.ga, l'autre application nommée comme telle", () => {
    expect(versionProblems(members, { target: "production" })).toEqual([])
    expect(versionProblems("main-abc", { target: "demo" })).toEqual(["--version doit être une étiquette diaspora-ga-<12>-antsia-<12>-<cible>"])
    expect(versionProblems("main-abc", { app: ADMIN, target: "demo" })).toEqual(["--version doit être une étiquette admin-diaspora-ga-<12>-antsia-<12>-<cible>"])
    expect(versionProblems(admin, { target: "production" })).toEqual(["--version désigne une autre application que --app : admin_diaspora_ga, pas diaspora_ga"])
    expect(versionProblems(members, { app: ADMIN, target: "production" })).toEqual(["--version désigne une autre application que --app : diaspora_ga, pas admin_diaspora_ga"])
    expect(versionProblems(admin, { app: ADMIN, target: "demo" })).toEqual(["--version désigne une autre cible que --target"])
  })

  test("les motifs d'identifiants du dépôt ne prennent pas une étiquette d'administration pour un nom de déploiement", () => {
    expect(/(?<![\w./-])[a-z]{3,}-[a-z]{3,}-\d{3}(?![\w-]|\.\w)/.test(admin)).toBe(false)
  })
})

describe("préalables aux commits publiés : le catalogue et l'application, en couple", () => {
  test("le catalogue du contrat convient aux deux applications", () => {
    expect(catalogProblems(CONTRACT_CATALOG, "diaspora_ga")).toEqual([])
    expect(catalogProblems(CONTRACT_CATALOG, ADMIN)).toEqual([])
  })

  test("le catalogue du moteur sur le disque convient à diaspora.ga", () => {
    expect(catalogProblems(diskCatalog, "diaspora_ga")).toEqual([])
  })

  test("chaque écart du catalogue se dit, sans valeur de la machine", () => {
    const admin = CONTRACT_CATALOG.applications.admin_diaspora_ga
    const withAdmin = (entry) => ({ applications: { ...CONTRACT_CATALOG.applications, admin_diaspora_ga: entry } })
    expect(catalogProblems(null, ADMIN)).toEqual(["catalogue de publication du moteur illisible au commit d'ANTSIA publié (deploy/catalog.json)"])
    expect(catalogProblems({ applications: { diaspora_ga: CONTRACT_CATALOG.applications.diaspora_ga } }, ADMIN)).toEqual([
      "l'entrée admin_diaspora_ga manque au catalogue du moteur au commit d'ANTSIA publié : publier un moteur qui la porte",
    ])
    expect(catalogProblems(withAdmin({ ...admin, path: "apps/admin_diaspora_ga" }), ADMIN)).toEqual(["le catalogue du moteur place admin_diaspora_ga ailleurs que DIASPORA_GA/apps/admin_diaspora_ga"])
    expect(catalogProblems(withAdmin({ ...admin, administers_network: undefined }), ADMIN)).toEqual([
      "le catalogue du moteur ne dit pas que admin_diaspora_ga administre le réseau diaspora-ga (administers_network) : aucune session d'administration n'y serait admise",
    ])
    expect(catalogProblems(withAdmin({ ...admin, build_args: [...admin.build_args.slice(0, 3), "NEXT_PUBLIC_POSTHOG_KEY"] }), ADMIN)).toEqual([
      "la liste publique de admin_diaspora_ga diffère du catalogue du moteur (absente du catalogue : NEXT_PUBLIC_MEMBERS_SITE_URL, absente des scripts : NEXT_PUBLIC_POSTHOG_KEY)",
    ])
    const membersAdministering = { applications: { diaspora_ga: { ...CONTRACT_CATALOG.applications.diaspora_ga, administers_network: "diaspora-ga" } } }
    expect(catalogProblems(membersAdministering, "diaspora_ga")).toEqual([
      "le catalogue du moteur fait administrer un réseau par diaspora_ga (administers_network), que les scripts publient comme l'application des membres",
    ])
  })

  test("relevé par les dépôts locaux seulement : le catalogue du commit d'ANTSIA, le dossier du commit de DIASPORA_GA", () => {
    const calls = []
    const run = (argv) => {
      calls.push(argv)
      if (argv.includes("show")) return { status: 0, stdout: JSON.stringify(CONTRACT_CATALOG) }
      return { status: 0, stdout: argv.at(-1).includes("admin_diaspora_ga") ? "" : `${argv.at(-1)}\n` }
    }
    const repos = { ANTSIA: "/depots/ANTSIA", DIASPORA_GA: "/depots/DIASPORA_GA" }
    expect(releasePrerequisites({ apps: ALL_APPS_ORDER, antsiaCommit: ANTSIA_COMMIT, diasporaGaCommit: DIASPORA_GA_COMMIT, repos, run })).toEqual([
      "apps/admin_diaspora_ga absent du commit de DIASPORA_GA publié",
    ])
    expect(calls).toEqual([
      ["git", "-C", "/depots/ANTSIA", "show", `${ANTSIA_COMMIT}:deploy/catalog.json`],
      ["git", "-C", "/depots/DIASPORA_GA", "ls-tree", "--name-only", DIASPORA_GA_COMMIT, "--", "apps/admin_diaspora_ga/package.json"],
      ["git", "-C", "/depots/DIASPORA_GA", "ls-tree", "--name-only", DIASPORA_GA_COMMIT, "--", "apps/diaspora_ga/package.json"],
    ])
  })

  test("un catalogue illisible se dit une seule fois, pour les deux applications", () => {
    const run = (argv) => (argv.includes("show") ? { status: 128, stdout: "" } : { status: 0, stdout: `${argv.at(-1)}\n` })
    expect(releasePrerequisites({ apps: ALL_APPS_ORDER, antsiaCommit: ANTSIA_COMMIT, diasporaGaCommit: DIASPORA_GA_COMMIT, repos: { ANTSIA: "/a", DIASPORA_GA: "/d" }, run })).toEqual([
      "catalogue de publication du moteur illisible au commit d'ANTSIA publié (deploy/catalog.json)",
    ])
  })

  test("deux commits compatibles permettent la publication, un ancien catalogue sans SMS est refusé", () => {
    const root = mkdtempSync(join(tmpdir(), "diaspora-ga-contrat-"))
    const repos = { ANTSIA: join(root, "ANTSIA"), DIASPORA_GA: join(root, "DIASPORA_GA") }
    try {
      mkdirSync(join(repos.ANTSIA, "deploy"), { recursive: true })
      git(repos.ANTSIA, "init", "-q")
      const catalogPath = join(repos.ANTSIA, "deploy/catalog.json")
      const previous = structuredClone(diskCatalog)
      const entry = previous.applications.diaspora_ga
      entry.build_args = entry.build_args.filter((name) => name !== "NEXT_PUBLIC_DIASPORA_SMS_ENABLED")
      writeFileSync(catalogPath, JSON.stringify(previous))
      git(repos.ANTSIA, "add", "deploy/catalog.json")
      git(repos.ANTSIA, "commit", "-qm", "Catalogue sans SMS")
      copyFileSync(join(ANTSIA_ROOT, "deploy/catalog.json"), catalogPath)
      git(repos.ANTSIA, "commit", "-qam", "Catalogue courant")

      for (const app of ALL_APPS_ORDER) {
        const directory = releaseApp(app).directory
        mkdirSync(join(repos.DIASPORA_GA, directory), { recursive: true })
        copyFileSync(join(DIASPORA_GA_ROOT, directory, "package.json"), join(repos.DIASPORA_GA, directory, "package.json"))
      }
      git(repos.DIASPORA_GA, "init", "-q")
      git(repos.DIASPORA_GA, "add", "apps")
      git(repos.DIASPORA_GA, "commit", "-qm", "Applications courantes")

      const pair = { apps: ALL_APPS_ORDER, repos, diasporaGaCommit: "HEAD" }
      expect(releasePrerequisites({ ...pair, antsiaCommit: "HEAD" })).toEqual([])
      expect(releasePrerequisites({ ...pair, antsiaCommit: "HEAD~1" })).toEqual([
        "la liste publique de diaspora_ga diffère du catalogue du moteur (absente du catalogue : NEXT_PUBLIC_DIASPORA_SMS_ENABLED)",
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
