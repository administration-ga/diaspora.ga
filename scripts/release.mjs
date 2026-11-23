#!/usr/bin/env node
/**
 * Publication de diaspora.ga et d'admin.diaspora.ga (LX-02, CH-815 lot A8) — procédure :
 * docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md.
 *
 *   node scripts/release.mjs --target demo --antsia <commit> --diaspora-ga <commit>
 *       affiche le plan de diaspora.ga (par défaut) : RIEN ne part, aucune commande réseau
 *   node scripts/release.mjs --app admin_diaspora_ga --target demo --antsia <commit> --diaspora-ga <commit>
 *       le plan d'admin.diaspora.ga, dans son propre projet d'hébergement
 *   node scripts/release.mjs --app all --target demo --antsia <commit> --diaspora-ga <commit>
 *       le plan des deux, dans la même séance : admin.diaspora.ga puis diaspora.ga, les deux
 *       contrôles privés avant toute bascule (fenêtre de déménagement, lot A6)
 *   … --execute
 *       exécute le plan, après deux confirmations tapées dans un terminal
 *
 * Le plan suit la méthode employée du 22/10 au 3/11/2026 pour la démonstration :
 * contexte figé à partir des deux commits, variables publiques seulement, étiquette
 * de version tirée des deux commits, publication SANS bascule, contrôle privé par la
 * sonde (LX-01), bascule, contrôle public (version servie et moteur visé). Avec
 * `--app all`, un seul contexte figé sert les deux applications.
 *
 * La porte : toute exécution exige l'accord écrit et détaillé du propriétaire (commit
 * de chaque dépôt, cible, ordre, retour arrière). Le script le rappelle et s'arrête
 * devant deux phrases à taper ; aucune option ne les contourne, et une entrée qui
 * n'est pas un terminal refuse. Le backend du moteur est publié AVANT, par la session
 * du moteur : ce script ne touche à aucun backend.
 */
import { pathToFileURL } from "node:url"

import { checkRelease, evaluateHealthText } from "./release-check.mjs"
import {
  agreementNotice,
  appReleaseKeys,
  appsOf,
  appVariableNames,
  confirmationPhrase,
  confirmPhrase,
  createWorkdir,
  DEFAULT_RELEASE_APP,
  deploymentUrlFrom,
  envRef,
  freezeCommands,
  freezeContext,
  isPublishedCommit,
  parseApp,
  parseInspect,
  parseOptions,
  parseTarget,
  readTargetEnv,
  releaseApp,
  releasePrerequisites,
  RELEASE_REPOSITORIES,
  releaseVariables,
  releaseVersion,
  renderCommand,
  repoRef,
  resolveCommand,
  resolveCommit,
  resolveStepEnv,
  runCommand,
  runtimeRef,
  SHARED_VARIABLE_NAMES,
  writeRecord,
} from "./release-lib.mjs"
import { appArgs, rollbackCommand } from "./rollback.mjs"

export const USAGE =
  "Usage : node scripts/release.mjs [--app diaspora_ga|admin_diaspora_ga|all] --target demo|production --antsia <commit> --diaspora-ga <commit> [--execute]"

/**
 * Les options de la ligne de commande ; `problems` non vide = usage refusé. `app` reste
 * `undefined` sans `--app` (diaspora.ga).
 */
export function parseReleaseArgs(argv) {
  const { options, problems } = parseOptions(argv, { values: ["app", "target", "antsia", "diaspora-ga"], flags: ["execute"] })
  const { app, problem } = parseApp(options.app, { allowAll: true })
  if (problem) problems.push(problem)
  const target = parseTarget(options.target)
  if (target === null) problems.push("--target doit valoir demo ou production")
  if (!options.antsia) problems.push("--antsia <commit> manque")
  if (!options["diaspora-ga"]) problems.push("--diaspora-ga <commit> manque")
  return { app, target, antsia: options.antsia, diasporaGa: options["diaspora-ga"], execute: options.execute === true, problems }
}

/**
 * Les six étapes propres à une application : relevé du servi, publication sans bascule,
 * état prêt, contrôle privé par SA sonde, bascule, contrôle public. Seules, elles gardent
 * les identifiants et les titres d'avant `--app` ; à plusieurs, chaque identifiant et
 * chaque titre nomment l'application.
 */
function appSteps(entry, { target, antsia, diasporaGa, combined }) {
  const names = appVariableNames(entry.app, target)
  const { health } = releaseApp(entry.app)
  const scope = envRef(SHARED_VARIABLE_NAMES.scope)
  const vercelEnv = { VERCEL_ORG_ID: envRef(SHARED_VARIABLE_NAMES.orgId), VERCEL_PROJECT_ID: envRef(names.projectId) }
  const deployment = runtimeRef(entry.runtimeKey, combined ? `adresse du déploiement de ${entry.title}` : "adresse du déploiement")
  const title = (text) => (combined ? `${entry.title} — ${text}` : text)
  const source = health.dataSource === "required" ? ", la source « engine »" : ""
  const ids = entry.steps
  return {
    served: {
      id: ids.served,
      title: title("Relever le déploiement servi et sa version : la cible du retour arrière"),
      commands: [["vercel", "inspect", envRef(names.siteUrl), "--scope", scope, "--format=json"]],
      env: vercelEnv,
    },
    deploy: {
      id: ids.deploy,
      title: title("Publier sans bascule (aucun domaine ne change)"),
      commands: [
        [
          "vercel",
          "deploy",
          runtimeRef("context", "contexte figé"),
          "--prod",
          "--skip-domain",
          "--archive=tgz",
          "--yes",
          "--scope",
          scope,
          ...entry.variables.flatMap(([name, value]) => ["--build-env", [`${name}=`, value], "--env", [`${name}=`, value]]),
          "--meta",
          `diasporaGaReleaseCommit=${diasporaGa.commit}`,
          "--meta",
          `antsiaReleaseCommit=${antsia.commit}`,
          "--meta",
          ["sourceFingerprint=", runtimeRef("fingerprint", "empreinte des sources")],
        ],
      ],
      env: vercelEnv,
    },
    ready: { id: ids.ready, title: title("Le déploiement est prêt (READY)"), commands: [["vercel", "inspect", deployment, "--scope", scope, "--format=json"]], env: vercelEnv },
    privateCheck: {
      id: ids.privateCheck,
      title: title(`Contrôle privé avant bascule : la sonde dit « ok », la version ${entry.version}${source}, le moteur joint`),
      commands: [["vercel", "curl", health.path, "--deployment", deployment, "--scope", scope]],
      env: vercelEnv,
    },
    promote: { id: ids.promote, title: title("Basculer le domaine sur le nouveau déploiement"), commands: [["vercel", "promote", deployment, "--scope", scope, "--yes"]], env: vercelEnv },
    publicCheck: {
      id: ids.publicCheck,
      title: title("Contrôle public : sonde, version servie, moteur visé (CSP limitée au moteur de la cible)"),
      commands: [["node", "scripts/release-check.mjs", ...appArgs(entry.app), "--target", target, "--version", entry.version]],
    },
  }
}

/**
 * Le plan de publication, sans rien exécuter ni lire du réseau. Les valeurs de la
 * machine y restent des références : le plan rendu se colle tel quel dans une demande
 * d'accord.
 *
 * Une application : les onze étapes d'avant `--app`. `app: "all"` : la porte, la relecture,
 * le gel (un seul contexte pour les deux), puis pour chaque application dans l'ordre
 * `ALL_APPS_ORDER` son relevé, sa publication sans bascule, son état et son contrôle
 * privé ; ENSUITE seulement la seconde porte, les bascules, puis les contrôles publics.
 * Aucune bascule ne part tant qu'un seul contrôle privé est en écart.
 * @param {{ app?: string, target: "demo" | "production", antsia: { commit: string, tree: string }, diasporaGa: { commit: string, tree: string }, values?: Record<string, string>, valuesByApp?: Record<string, Record<string, string>> }} input
 */
export function buildReleasePlan({ app = DEFAULT_RELEASE_APP, target, antsia, diasporaGa, values = {}, valuesByApp = {} }) {
  const keys = appsOf(app)
  const combined = keys.length > 1
  const apps = keys.map((key) => {
    const version = releaseVersion({ diasporaGaCommit: diasporaGa.commit, antsiaCommit: antsia.commit, target, app: key })
    const suffix = combined ? `:${key}` : ""
    return Object.freeze({
      app: key,
      title: releaseApp(key).title,
      version,
      variables: releaseVariables(target, version, combined ? (valuesByApp[key] ?? {}) : values, key),
      runtimeKey: `deploymentUrl${suffix}`,
      steps: Object.freeze({
        served: `served${suffix}`,
        deploy: `deploy${suffix}`,
        ready: `ready${suffix}`,
        privateCheck: `private-check${suffix}`,
        promote: `promote${suffix}`,
        publicCheck: `public-check${suffix}`,
      }),
    })
  })
  const versions = apps.map((entry) => entry.version).join(" ")
  const publishPhrase = confirmationPhrase("PUBLIER", target, versions)
  const promotePhrase = confirmationPhrase("BASCULER", target, versions)
  const own = apps.map((entry) => appSteps(entry, { target, antsia, diasporaGa, combined }))
  const steps = [
    { id: "agreement", title: "Accord écrit du propriétaire, puis confirmation tapée", gate: publishPhrase },
    { id: "fetch", title: "Relire origin/main des deux dépôts", commands: ["ANTSIA", "DIASPORA_GA"].map((name) => ["git", "-C", repoRef(name), "fetch", "origin", "main"]) },
    {
      id: "published",
      title: "Chaque commit est sur origin/main (jamais une branche ni un HEAD local)",
      commands: [
        ["git", "-C", repoRef("ANTSIA"), "merge-base", "--is-ancestor", antsia.commit, "origin/main"],
        ["git", "-C", repoRef("DIASPORA_GA"), "merge-base", "--is-ancestor", diasporaGa.commit, "origin/main"],
      ],
    },
    {
      id: "freeze",
      title: "Contexte figé : fichiers suivis des deux commits, dans un dossier vide hors des dépôts, avec .vercelignore et empreinte",
      commands: [...freezeCommands("ANTSIA", antsia.commit), ...freezeCommands("DIASPORA_GA", diasporaGa.commit)],
    },
    ...own.flatMap((steps) => [steps.served, steps.deploy, steps.ready, steps.privateCheck]),
    {
      id: "confirm-promote",
      title: combined ? "Bascule : seconde confirmation tapée, après lecture des deux contrôles privés" : "Bascule : seconde confirmation tapée, après lecture du contrôle",
      gate: promotePhrase,
    },
    ...own.map((steps) => steps.promote),
    ...own.map((steps) => steps.publicCheck),
  ]
  const single = combined ? {} : { version: apps[0].version, variables: apps[0].variables }
  return { app: combined ? app : keys[0], target, ...single, antsia, diasporaGa, apps, steps, confirmations: { publish: publishPhrase, promote: promotePhrase } }
}

/** Les quatre points de l'accord du propriétaire, pour ce plan. */
export function releaseAgreementPoints(plan) {
  const combined = plan.apps.length > 1
  const sites = plan.apps.map((entry) => appVariableNames(entry.app, plan.target).siteUrl).join(", ")
  const titles = plan.apps.map((entry) => entry.title).join(", puis ")
  return [
    `commits : ANTSIA ${plan.antsia.commit}, DIASPORA_GA ${plan.diasporaGa.commit}`,
    `cible : ${plan.target} (variables ${sites} et suivantes)`,
    combined
      ? `ordre : backend du moteur déjà publié depuis le même commit d'ANTSIA, puis ${titles}, dans la même séance (les contrôles privés des deux avant toute bascule) ; un seul publieur à la fois`
      : "ordre : backend du moteur déjà publié depuis le même commit d'ANTSIA, puis ce site ; un seul publieur à la fois",
    combined
      ? "retour arrière : pour chaque application, le déploiement servi avant la bascule, relevé à son étape « served:<application> » (node scripts/rollback.mjs --app <application>)"
      : `retour arrière : le déploiement servi avant la bascule, relevé à l'étape « served » (${["node scripts/rollback.mjs", ...appArgs(plan.app)].join(" ")})`,
  ]
}

/**
 * Le plan rendu en texte : étapes numérotées, commandes sans aucune valeur de la machine.
 * @param {{ published?: { antsia: boolean, diasporaGa: boolean }, problems?: string[], prerequisites?: string[] }} facts relevés locaux
 */
export function renderReleasePlan(plan, { published, problems = [], prerequisites = [] } = {}) {
  const combined = plan.apps.length > 1
  const titles = plan.apps.map((entry) => entry.title)
  const lines = combined
    ? [`Plan de publication de ${titles.join(" et ")} — cible ${plan.target}`, `  ordre : moteur déjà publié, puis ${titles.join(", puis ")} ; les contrôles privés des deux avant toute bascule`]
    : [`Plan de publication de ${titles[0]} — cible ${plan.target}`, `  version : ${plan.version}`]
  lines.push(`  ANTSIA ${plan.antsia.commit} (arbre ${plan.antsia.tree})`, `  DIASPORA_GA ${plan.diasporaGa.commit} (arbre ${plan.diasporaGa.tree})`)
  if (combined) {
    for (const entry of plan.apps) lines.push(`  ${entry.title} : version ${entry.version} ; variables publiques : ${entry.variables.map(([name]) => name).join(", ")}`)
  } else {
    lines.push(`  variables publiques : ${plan.variables.map(([name]) => name).join(", ")}`)
  }
  if (published) {
    lines.push(
      `  sur origin/main (relevé local, relu avant exécution) : ANTSIA ${published.antsia ? "oui" : "NON"}, DIASPORA_GA ${published.diasporaGa ? "oui" : "NON"}`,
    )
  }
  plan.steps.forEach((step, index) => {
    lines.push("", `${index + 1}. ${step.title}`)
    if (step.gate) lines.push(`   phrase à taper : ${step.gate}`)
    for (const argv of step.commands ?? []) lines.push(`   $ ${renderCommand(argv)}`)
    if (step.env) lines.push(`   avec ${Object.entries(step.env).map(([name, ref]) => `${name}=<${ref.env}>`).join(", ")}`)
  })
  if (prerequisites.length > 0) lines.push("", "Préalables à corriger avant toute exécution (relevés aux commits publiés) :", ...prerequisites.map((problem) => `  - ${problem}`))
  if (problems.length > 0) lines.push("", "Variables de la machine à corriger avant toute exécution :", ...problems.map((problem) => `  - ${problem}`))
  return lines.join("\n")
}

/**
 * Exécute un plan, étape par étape, et s'arrête au premier écart. Tout ce qui touche
 * la machine ou le réseau passe par `deps` (remplacé dans les tests) :
 * `run(argv, { env }) → { status, stdout }`, `confirm(phrase) → Promise<boolean>`,
 * `fetch`, `log`, `env`, `repos`, `makeWorkdir()`, `freeze({ workdir, commits })`,
 * `record(workdir, relevé)`, `sleep(ms)`.
 *
 * Seule, une application tient son relevé à plat, comme avant `--app` ; à plusieurs,
 * chacune a le sien sous `apps.<clé>`. Un contrôle public en écart PROPOSE les retours
 * arrière (un par application basculée qui avait un déploiement servi), sans les jouer.
 * @returns {Promise<{ ok: boolean, stage: string, reason?: string, record: object }>}
 */
export async function executeRelease(plan, deps) {
  const combined = plan.apps.length > 1
  const commits = { antsiaCommit: plan.antsia.commit, diasporaGaCommit: plan.diasporaGa.commit }
  const record = combined
    ? { target: plan.target, applications: plan.apps.map((entry) => entry.app), ...commits, stages: [], apps: Object.fromEntries(plan.apps.map((entry) => [entry.app, { version: entry.version }])) }
    : { target: plan.target, version: plan.version, ...commits, stages: [] }
  const own = (entry) => (combined ? record.apps[entry.app] : record)
  const said = (entry, text) => (combined ? `${entry.title} : ${text}` : text)
  const runtime = {}
  let workdir = null
  const context = () => ({ env: deps.env, runtime, repos: deps.repos })
  const save = () => {
    if (workdir) deps.record(workdir, record)
  }
  const stop = (stage, reason) => {
    record.stoppedAt = stage
    record.reason = reason
    save()
    deps.log(`✗ arrêt à l'étape « ${stage} » : ${reason}`)
    return { ok: false, stage, reason, record }
  }
  const step = (id) => plan.steps.find((candidate) => candidate.id === id)
  const runStep = (id, index = 0) => {
    const current = step(id)
    return deps.run(resolveCommand(current.commands[index], context()), { env: resolveStepEnv(current.env, context()) })
  }
  const done = (stage) => {
    record.stages.push(stage)
    save()
    deps.log(`✓ ${step(stage).title}`)
  }
  const siteOf = (entry) => {
    const names = appVariableNames(entry.app, plan.target)
    return { siteUrl: deps.env[names.siteUrl]?.trim(), convexUrl: deps.env[names.convexUrl]?.trim() }
  }

  deps.log(agreementNotice(releaseAgreementPoints(plan)))
  if (!(await deps.confirm(plan.confirmations.publish))) return stop("agreement", "confirmation absente : rien n'est parti")
  record.stages.push("agreement")

  for (const index of [0, 1]) {
    if (runStep("fetch", index).status !== 0) return stop("fetch", "origin/main n'a pas pu être relu")
  }
  done("fetch")
  for (const [index, name] of [[0, "ANTSIA"], [1, "DIASPORA_GA"]]) {
    if (runStep("published", index).status !== 0) return stop("published", `le commit de ${name} n'est pas sur origin/main`)
  }
  done("published")

  try {
    workdir = deps.makeWorkdir()
    runtime.workdir = workdir
    const frozen = deps.freeze({ workdir, commits: { ANTSIA: plan.antsia.commit, DIASPORA_GA: plan.diasporaGa.commit } })
    runtime.context = frozen.context
    runtime.fingerprint = frozen.fingerprint
    record.sourceFingerprint = frozen.fingerprint
    record.sourceFiles = frozen.files
  } catch (error) {
    return stop("freeze", error instanceof Error ? error.message : "contexte figé impossible")
  }
  done("freeze")

  for (const entry of plan.apps) {
    const ids = entry.steps
    const mine = own(entry)
    const { siteUrl, convexUrl } = siteOf(entry)
    const served = runStep(ids.served)
    const servedDeployment = served.status === 0 ? parseInspect(served.stdout) : null
    // Relevé seulement : la version servie avant la bascule, que le retour arrière devra retrouver.
    const servedHealth = await checkRelease({ app: entry.app, target: plan.target, siteUrl, convexUrl, version: null, fetch: deps.fetch })
    mine.previous = servedDeployment?.url ? { deployment: servedDeployment.url, version: servedHealth.report?.version ?? null } : null
    done(ids.served)
    deps.log(
      `  ${said(
        entry,
        mine.previous
          ? `retour arrière possible vers la version ${mine.previous.version ?? "inconnue"} (relevé : ${workdir}/release.json)`
          : "aucun déploiement servi relevé : première publication, aucun retour arrière possible",
      )}`,
    )

    const deployed = runStep(ids.deploy)
    const deploymentUrl = deployed.status === 0 ? deploymentUrlFrom(deployed.stdout) : null
    if (!deploymentUrl) return stop(ids.deploy, "la publication a échoué ou n'a pas rendu l'adresse du déploiement")
    runtime[entry.runtimeKey] = deploymentUrl
    mine.deployment = deploymentUrl
    done(ids.deploy)

    const inspected = runStep(ids.ready)
    const readyState = inspected.status === 0 ? parseInspect(inspected.stdout)?.readyState : null
    if (readyState !== "READY") return stop(ids.ready, `le déploiement n'est pas prêt (${readyState ?? "état illisible"}) ; aucune bascule`)
    done(ids.ready)

    const privateCheck = runStep(ids.privateCheck)
    const privateProblems = privateCheck.status === 0 ? evaluateHealthText(privateCheck.stdout, { version: entry.version, app: entry.app }) : ["la sonde n'a pas répondu"]
    if (privateProblems.length > 0) {
      const unchanged = combined ? "aucune bascule : aucun domaine ne change" : "aucune bascule, le domaine sert toujours l'ancienne version"
      return stop(ids.privateCheck, `${privateProblems.join(" ; ")} — ${unchanged}`)
    }
    done(ids.privateCheck)
  }

  if (!(await deps.confirm(plan.confirmations.promote))) {
    return stop("confirm-promote", combined ? "bascule non confirmée : les déploiements restent publiés sans domaine" : "bascule non confirmée : le déploiement reste publié sans domaine")
  }
  record.stages.push("confirm-promote")

  const promoted = []
  for (const entry of plan.apps) {
    if (runStep(entry.steps.promote).status !== 0) {
      const already = promoted.length > 0 ? ` ; déjà basculé : ${promoted.map((other) => other.title).join(", ")}` : ""
      return stop(entry.steps.promote, `la bascule a échoué : vérifier la version servie avec release-check${already}`)
    }
    own(entry).promotedAt = new Date().toISOString()
    promoted.push(entry)
    done(entry.steps.promote)
  }

  const failures = []
  for (const entry of plan.apps) {
    const { siteUrl, convexUrl } = siteOf(entry)
    const check = await checkRelease({ app: entry.app, target: plan.target, siteUrl, convexUrl, version: entry.version, fetch: deps.fetch, attempts: 5, sleep: deps.sleep })
    own(entry).publicCheck = check.problems
    if (check.ok) done(entry.steps.publicCheck)
    else failures.push({ entry, problems: check.problems })
  }
  if (failures.length > 0) {
    const back = (entry) => {
      const previous = own(entry).previous
      return previous ? rollbackCommand(plan.target, previous.deployment, previous.version, entry.app) : null
    }
    if (!combined) {
      const command = back(plan.apps[0])
      return stop(plan.apps[0].steps.publicCheck, `${failures[0].problems.join(" ; ")}${command ? ` — retour arrière, sur accord : ${command}` : " — aucun déploiement précédent relevé"}`)
    }
    const what = failures.map(({ entry, problems }) => said(entry, problems.join(" ; "))).join(" | ")
    const how = plan.apps.map((entry) => back(entry) ?? said(entry, "aucun déploiement précédent relevé")).join(" ; ")
    return stop(failures[0].entry.steps.publicCheck, `${what} — retour arrière des deux, sur accord : ${how}`)
  }
  return { ok: true, stage: plan.steps.at(-1).id, record }
}

async function main() {
  const args = parseReleaseArgs(process.argv.slice(2))
  if (args.problems.length > 0) {
    console.error([USAGE, ...args.problems.map((problem) => `  - ${problem}`)].join("\n"))
    process.exitCode = 1
    return
  }
  let antsia
  let diasporaGa
  try {
    antsia = resolveCommit(RELEASE_REPOSITORIES.ANTSIA, args.antsia)
    diasporaGa = resolveCommit(RELEASE_REPOSITORIES.DIASPORA_GA, args.diasporaGa)
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : "commit illisible"}`)
    process.exitCode = 1
    return
  }
  const apps = appsOf(args.app)
  const valuesByApp = {}
  const machineProblems = []
  for (const key of apps) {
    const read = readTargetEnv(args.target, process.env, appReleaseKeys(key), key)
    valuesByApp[key] = read.values
    machineProblems.push(...read.problems)
  }
  // Les variables du moteur et de l'hébergeur sont communes aux deux applications : chaque défaut se dit une fois.
  const problems = [...new Set(machineProblems)]
  const plan = buildReleasePlan({ app: args.app, target: args.target, antsia, diasporaGa, values: valuesByApp[apps[0]], valuesByApp })
  const published = {
    antsia: isPublishedCommit(RELEASE_REPOSITORIES.ANTSIA, antsia.commit),
    diasporaGa: isPublishedCommit(RELEASE_REPOSITORIES.DIASPORA_GA, diasporaGa.commit),
  }
  const prerequisites = releasePrerequisites({ apps, antsiaCommit: antsia.commit, diasporaGaCommit: diasporaGa.commit })
  console.log(renderReleasePlan(plan, { published, problems, prerequisites }))
  if (!args.execute) {
    console.log("\nRien n'est parti : ceci est le plan. L'exécution (--execute) exige l'accord écrit du propriétaire.")
    return
  }
  if (prerequisites.length > 0) {
    console.error("\n✗ exécution refusée : préalables à corriger aux commits publiés (voir ci-dessus).")
    process.exitCode = 1
    return
  }
  if (problems.length > 0) {
    console.error("\n✗ exécution refusée : variables de la machine à corriger (voir ci-dessus).")
    process.exitCode = 1
    return
  }
  const result = await executeRelease(plan, {
    run: runCommand,
    confirm: (phrase) => confirmPhrase(phrase),
    fetch: globalThis.fetch,
    log: (line) => console.log(line),
    env: process.env,
    repos: RELEASE_REPOSITORIES,
    makeWorkdir: () => createWorkdir(process.env),
    freeze: ({ workdir, commits }) => freezeContext({ workdir, commits }),
    record: writeRecord,
    sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  })
  const served = plan.apps.map((entry) => entry.version).join(" et ")
  console.log(result.ok ? `\n✓ ${served} ${plan.apps.length > 1 ? "servies" : "servie"} sur la cible ${plan.target}.` : "\nPublication interrompue.")
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
