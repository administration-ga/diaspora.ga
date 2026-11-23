#!/usr/bin/env node
/**
 * Contrôle d'une version servie de diaspora.ga ou d'admin.diaspora.ga (LX-02, CH-815),
 * en lecture seule :
 *
 *   node scripts/release-check.mjs --target demo --version diaspora-ga-<12>-antsia-<12>-demo
 *   node scripts/release-check.mjs --app admin_diaspora_ga --target demo --version admin-diaspora-ga-<12>-antsia-<12>-demo
 *
 * Trois preuves, lues sur le site de l'application pour la cible (`DIASPORA_GA_<CIBLE>_SITE_URL`,
 * ou `ADMIN_DIASPORA_GA_<CIBLE>_SITE_URL` avec `--app admin_diaspora_ga`) :
 *  1. la sonde `/api/sante-fonctionnelle` (LX-01) dit « ok », le nom de l'application, le
 *     moteur configuré et joint ; pour diaspora.ga, la source « engine » ;
 *  2. la version servie est l'étiquette attendue (tirée des deux commits publiés) ;
 *  3. le moteur visé est celui de la cible : la politique de sécurité du contenu
 *     autorise l'origine de `DIASPORA_GA_<CIBLE>_CONVEX_URL`, et aucun autre moteur.
 *
 * Aucune écriture, aucun identifiant affiché : les messages nomment les variables,
 * jamais leur valeur, et une erreur du réseau n'est jamais recopiée (elle peut citer
 * une adresse). `release.mjs` et `rollback.mjs` s'en servent après la bascule.
 */
import { pathToFileURL } from "node:url"

import {
  appVariableNames,
  CHECK_KEYS,
  DEFAULT_RELEASE_APP,
  parseApp,
  parseJson,
  parseOptions,
  parseTarget,
  readTargetEnv,
  releaseApp,
  versionProblems,
} from "./release-lib.mjs"

export const USAGE =
  "Usage : node scripts/release-check.mjs [--app diaspora_ga|admin_diaspora_ga] --target demo|production --version <préfixe>-<12>-antsia-<12>-<cible>"

/**
 * Les options ; la version doit avoir la forme d'une étiquette de la même application et
 * de la même cible. `app` reste `undefined` sans `--app` (diaspora.ga).
 */
export function parseCheckArgs(argv) {
  const { options, problems } = parseOptions(argv, { values: ["app", "target", "version"], flags: [] })
  const { app, problem } = parseApp(options.app)
  if (problem) problems.push(problem)
  const target = parseTarget(options.target)
  if (target === null) problems.push("--target doit valoir demo ou production")
  problems.push(...versionProblems(options.version, { app, target }))
  return { app, target, version: options.version, problems }
}

/**
 * Les écarts de l'état du moteur. diaspora.ga le rend en chaîne (`engine`) ; une
 * application bâtie sur la sonde commune du moteur (`createHealthProbe`, comme la
 * console) le rend en objet (`engine.state`), où « slow » dit un moteur lent.
 */
function engineProblems(report, engineShape, application) {
  if (engineShape !== "probe") return report.engine === "reachable" ? [] : ["moteur injoignable depuis le site"]
  const state = typeof report.engine === "object" && report.engine !== null && typeof report.engine.state === "string" ? report.engine.state : null
  if (state === null) return [`état du moteur illisible : la sonde de ${application} rend engine.state (sonde commune du moteur)`]
  if (state === "slow") return ["moteur lent : il répond au-delà du seuil de la sonde"]
  return state === "reachable" ? [] : ["moteur injoignable depuis le site"]
}

/**
 * Les écarts d'un rapport de sonde. `version: null` : la version n'est pas comparée
 * (relevé de la version servie avant une publication).
 * @param {unknown} report
 * @param {{ version: string | null, app?: string }} expected
 */
export function evaluateHealth(report, { version, app = DEFAULT_RELEASE_APP }) {
  const { health } = releaseApp(app)
  if (!report || typeof report !== "object") return ["la sonde ne rend pas un rapport lisible"]
  const problems = []
  if (report.application !== health.application) problems.push(`la sonde n'est pas celle de ${health.application}`)
  if (report.status !== "ok") problems.push("état dégradé : le service ne peut pas servir ses données")
  if (version !== null && report.version !== version) problems.push(`version servie « ${String(report.version)} », attendue « ${version} »`)
  // Un site publié sert le moteur : diaspora.ga le dit, admin.diaspora.ga n'a pas de données fictives du tout.
  const wrongSource = health.dataSource === "required" ? report.dataSource !== "engine" : report.dataSource !== undefined && report.dataSource !== "engine"
  if (wrongSource) problems.push("source de données autre que « engine » : un site publié sert le moteur, jamais les données fictives")
  if (report.backend !== "configured") problems.push("adresse du moteur absente de la construction")
  problems.push(...engineProblems(report, health.engine, health.application))
  return problems
}

/** Les écarts d'une réponse de sonde reçue en texte (sortie de `vercel curl`). */
export function evaluateHealthText(text, expected) {
  const report = parseJson(text)
  return report === null ? ["réponse de la sonde illisible (pas du JSON)"] : evaluateHealth(report, expected)
}

/** Les sources d'une directive de la politique de sécurité du contenu (vide si absente). */
export function cspSources(csp, directive) {
  for (const part of (csp ?? "").split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name === directive) return sources
  }
  return []
}

/**
 * Le moteur visé : `connect-src` autorise l'origine du moteur de la cible (https et
 * wss), et aucune autre origine de moteur Convex. Les messages nomment la variable.
 */
export function evaluateEngineTarget(csp, convexUrl, variableName) {
  if (!csp) return ["en-tête Content-Security-Policy absent : le moteur visé ne se vérifie pas"]
  const sources = cspSources(csp, "connect-src")
  const expected = new URL(convexUrl)
  const problems = []
  if (!sources.includes(expected.origin) || !sources.includes(`wss://${expected.host}`)) {
    problems.push(`la politique de sécurité n'autorise pas le moteur de ${variableName}`)
  }
  const others = sources.filter((source) => {
    try {
      const url = new URL(source)
      return url.hostname.endsWith(".convex.cloud") && url.host !== expected.host
    } catch {
      return false
    }
  })
  if (others.length > 0) problems.push(`la politique de sécurité autorise ${others.length} origine(s) d'un autre moteur que celui de ${variableName}`)
  return problems
}

/**
 * Lit la sonde du site de l'application et contrôle version, état et moteur visé, en
 * `attempts` essais espacés (la bascule met quelques secondes à se propager).
 * @param {{ app?: string, target: "demo" | "production", siteUrl: string, convexUrl: string, version: string | null, fetch: typeof fetch, attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void> }} input
 * @returns {Promise<{ ok: boolean, problems: string[], report: object | null, attempts: number }>}
 */
export async function checkRelease({ app = DEFAULT_RELEASE_APP, target, siteUrl, convexUrl, version, fetch, attempts = 1, delayMs = 6_000, sleep = async () => {} }) {
  const names = appVariableNames(app, target)
  const { health } = releaseApp(app)
  let problems = []
  let report = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL(health.path, siteUrl), { cache: "no-store", redirect: "error", headers: { accept: "application/json" } })
      report = parseJson(await response.text())
      problems = [
        ...(report === null ? ["réponse de la sonde illisible (pas du JSON)"] : evaluateHealth(report, { version, app })),
        ...evaluateEngineTarget(response.headers.get("content-security-policy"), convexUrl, names.convexUrl),
      ]
    } catch {
      report = null
      problems = [`site de ${names.siteUrl} injoignable`]
    }
    if (problems.length === 0) return { ok: true, problems, report, attempts: attempt }
    if (attempt < attempts) await sleep(delayMs)
  }
  return { ok: false, problems, report, attempts }
}

/** La ligne de succès : ce que le contrôle a prouvé, variables nommées. */
export function checkSuccessLine({ app = DEFAULT_RELEASE_APP, target, version }) {
  const { title, health } = releaseApp(app)
  const source = health.dataSource === "required" ? ", source « engine »" : ""
  const subject = app === DEFAULT_RELEASE_APP ? target : `${title} (${target})`
  return `✓ ${subject} sert ${version} : sonde « ok »${source}, moteur joint et visé (${appVariableNames(app, target).convexUrl}).`
}

async function main() {
  const args = parseCheckArgs(process.argv.slice(2))
  if (args.problems.length > 0) {
    console.error([USAGE, ...args.problems.map((problem) => `  - ${problem}`)].join("\n"))
    process.exitCode = 1
    return
  }
  const app = args.app ?? DEFAULT_RELEASE_APP
  const { values, problems } = readTargetEnv(args.target, process.env, CHECK_KEYS, app)
  if (problems.length > 0) {
    console.error(["✗ contrôle impossible :", ...problems.map((problem) => `  - ${problem}`)].join("\n"))
    process.exitCode = 1
    return
  }
  const result = await checkRelease({ app, target: args.target, siteUrl: values.siteUrl, convexUrl: values.convexUrl, version: args.version, fetch: globalThis.fetch, attempts: 3 })
  if (result.ok) {
    console.log(checkSuccessLine({ app, target: args.target, version: args.version }))
    return
  }
  const subject = app === DEFAULT_RELEASE_APP ? args.target : `${releaseApp(app).title} (${args.target})`
  console.error([`✗ ${subject} ne sert pas ${args.version} comme attendu :`, ...result.problems.map((problem) => `  - ${problem}`)].join("\n"))
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
