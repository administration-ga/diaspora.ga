/**
 * Bibliothèque commune des scripts de publication de diaspora.ga (LX-02) et
 * d'admin.diaspora.ga (CH-815, lot A8) : `release.mjs` (publier), `release-check.mjs`
 * (contrôler), `rollback.mjs` (revenir en arrière). Procédure :
 * `docs/37_PUBLICATION_ET_RETOUR_ARRIERE.md`.
 *
 * Ce qui distingue une application d'une autre tient dans une seule table
 * (`RELEASE_APPS`) : noms des variables de la machine, liste publique, variables
 * passées au site, sonde, forme de l'étiquette de version, dossier de l'application.
 * Sans `--app`, tout se comporte comme avant la dimension `--app` (diaspora.ga).
 *
 * Elle reprend, dans le dépôt, la méthode employée hors dépôt du 22/10 au 3/11/2026
 * pour le site de démonstration : contexte figé à partir de deux commits (`git
 * archive`), variables PUBLIQUES seulement, étiquette de version tirée des deux
 * commits, publication sans bascule, contrôle, puis bascule.
 *
 * Le dépôt est public : aucun identifiant de projet, d'équipe ou de déploiement, aucune
 * adresse n'y est écrite. Tout vient de variables de la machine qui publie, lues au
 * moment de l'exécution ; les messages et le plan affiché les NOMMENT, ils ne
 * recopient jamais leur valeur (un plan se colle tel quel dans une demande d'accord).
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"

export const DIASPORA_GA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const ECOSYSTEMS_ROOT = resolve(DIASPORA_GA_ROOT, "..")
export const ANTSIA_ROOT = join(ECOSYSTEMS_ROOT, "ANTSIA")

/** Les dépôts du contexte figé, sous leur nom de dossier dans ECOSYSTEMES. */
export const RELEASE_REPOSITORIES = Object.freeze({ ANTSIA: ANTSIA_ROOT, DIASPORA_GA: DIASPORA_GA_ROOT })

/** Les cibles : la démonstration déclarée (ADR-0038 du moteur), puis la production. */
export const RELEASE_TARGETS = Object.freeze(["demo", "production"])

/** La cible lue d'un argument, ou `null` si elle n'est pas l'une des deux. */
export function parseTarget(raw) {
  return RELEASE_TARGETS.includes(raw) ? raw : null
}

/** L'autre cible : une variable de l'une ne doit jamais désigner la ressource de l'autre. */
export function otherTarget(target) {
  return target === "demo" ? "production" : "demo"
}

// ═══════════════════════════════════════════════════════════════
// Les applications publiées : une ligne chacune
// ═══════════════════════════════════════════════════════════════

/** Le chemin de la sonde de santé du site (LX-01). */
export const HEALTH_PATH = "/api/sante-fonctionnelle"

/** Le nom de l'application dans le rapport de la sonde (catalogue de publication du moteur). */
export const HEALTH_APPLICATION = "diaspora-ga"

/** L'application publiée quand `--app` est absent : le comportement d'avant la dimension `--app`. */
export const DEFAULT_RELEASE_APP = "diaspora_ga"

/** `--app all` : les deux applications, dans la même séance (publication seulement). */
export const ALL_RELEASE_APPS = "all"

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/**
 * Les applications que ces scripts publient, sous leur clé du catalogue de publication
 * du moteur (`../ANTSIA/deploy/catalog.json`). Tout ce qui les distingue est ici :
 *
 * - `title` : le nom affiché dans les plans et les journaux ;
 * - `directory` : le dossier de l'application dans DIASPORA_GA (dossier racine du projet
 *   d'hébergement : `DIASPORA_GA/<directory>` dans le contexte figé) ;
 * - `administersNetwork` : le réseau que l'application administre, tel que le catalogue le
 *   déclare (`administers_network`, seule source de l'autorité d'administration du
 *   réseau dans le moteur) ; `null` pour l'application des membres ;
 * - `versionPrefix` : l'étiquette de version est `<préfixe>-<12>-antsia-<12>-<cible>` ;
 * - `machineVariables` : les NOMS des variables de la machine, `{CIBLE}` valant `DEMO` ou
 *   `PRODUCTION`. Le moteur est celui de la cible, le même pour les deux applications :
 *   admin.diaspora.ga lit donc les variables du moteur de diaspora.ga, et l'adresse du
 *   site des membres dans celle de diaspora.ga, plutôt que des copies qui pourraient
 *   diverger. Le site et le projet d'hébergement, eux, sont propres à chaque application ;
 * - `releaseKeys` : ce que la publication exige (le contrôle et le retour arrière exigent
 *   `CHECK_KEYS` et `ROLLBACK_KEYS`, les mêmes pour toutes) ; `optionalUrlKeys` : les
 *   liens facultatifs ; `optionalMediaKeys` : les origines facultatives d'un serveur média
 *   (`wss://`, lues à la construction pour la politique de sécurité du site).
 *   `optionalFlagKeys` contient les options de construction valant exactement `0` ou `1` ;
 * - `publicVariables` : la liste publique, celle du catalogue (`build_args` et
 *   `runtime_env`), écrite à part pour que la garde `assertPublicOnly` ait un sens ;
 * - `siteVariables` : ce que la publication passe au site, dans l'ordre : une valeur
 *   fixe, l'étiquette de version, ou une variable de la machine (facultative ou non) ;
 * - `health` : la sonde (chemin, nom de l'application dans le rapport, source de données
 *   exigée, `required`, ou facultative, `optional` : absente ou « engine », forme de
 *   l'état du moteur : chaîne pour diaspora.ga, objet `state` de la sonde commune du
 *   moteur pour admin.diaspora.ga, comme la console).
 *
 * Le retour arrière d'une application repromeut un déploiement du projet de SON
 * `projectId`, et se contrôle sur SON site : il ne touche jamais l'autre application.
 */
export const RELEASE_APPS = deepFreeze({
  diaspora_ga: {
    title: "diaspora.ga",
    directory: "apps/diaspora_ga",
    administersNetwork: null,
    versionPrefix: "diaspora-ga",
    machineVariables: {
      siteUrl: "DIASPORA_GA_{CIBLE}_SITE_URL",
      convexUrl: "DIASPORA_GA_{CIBLE}_CONVEX_URL",
      convexSiteUrl: "DIASPORA_GA_{CIBLE}_CONVEX_SITE_URL",
      projectId: "DIASPORA_GA_{CIBLE}_VERCEL_PROJECT_ID",
      idnPortalUrl: "DIASPORA_GA_{CIBLE}_IDN_PORTAL_URL",
      consulateUrl: "DIASPORA_GA_{CIBLE}_CONSULATE_URL",
      smsEnabled: "DIASPORA_GA_{CIBLE}_SMS_ENABLED",
      livekitWsUrl: "DIASPORA_GA_{CIBLE}_LIVEKIT_WS_URL",
    },
    releaseKeys: ["siteUrl", "convexUrl", "convexSiteUrl", "projectId", "orgId", "scope"],
    optionalUrlKeys: ["idnPortalUrl", "consulateUrl"],
    optionalMediaKeys: ["livekitWsUrl"],
    optionalFlagKeys: ["smsEnabled"],
    publicVariables: [
      "NEXT_PUBLIC_CONVEX_URL",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_BUILD_SHA",
      "NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE",
      "NEXT_PUBLIC_DIASPORA_SMS_ENABLED",
      "NEXT_PUBLIC_IDN_PORTAL_URL",
      "NEXT_PUBLIC_CONSULATE_URL",
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "LIVEKIT_WS_URL",
      "CONVEX_SITE_URL",
    ],
    siteVariables: [
      ["NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE", { value: "engine" }],
      ["NEXT_PUBLIC_SITE_URL", { machine: "siteUrl" }],
      ["NEXT_PUBLIC_CONVEX_URL", { machine: "convexUrl" }],
      ["CONVEX_SITE_URL", { machine: "convexSiteUrl" }],
      // CH-817 : la même origine des actions HTTP, lue par le NAVIGATEUR (la porte des comptes de démonstration).
      ["NEXT_PUBLIC_CONVEX_SITE_URL", { machine: "convexSiteUrl" }],
      ["NEXT_PUBLIC_BUILD_SHA", { version: true }],
      ["NEXT_PUBLIC_DIASPORA_SMS_ENABLED", { machine: "smsEnabled", optional: true }],
      ["NEXT_PUBLIC_IDN_PORTAL_URL", { machine: "idnPortalUrl", optional: true }],
      ["NEXT_PUBLIC_CONSULATE_URL", { machine: "consulateUrl", optional: true }],
      // Le serveur média des appels et du direct : sa seule trace côté site est la politique de sécurité,
      // que la configuration commune du moteur construit à la construction (`connect-src`).
      ["LIVEKIT_WS_URL", { machine: "livekitWsUrl", optional: true }],
    ],
    health: { path: HEALTH_PATH, application: HEALTH_APPLICATION, dataSource: "required", engine: "text" },
  },
  admin_diaspora_ga: {
    title: "admin.diaspora.ga",
    directory: "apps/admin_diaspora_ga",
    administersNetwork: "diaspora-ga",
    versionPrefix: "admin-diaspora-ga",
    machineVariables: {
      siteUrl: "ADMIN_DIASPORA_GA_{CIBLE}_SITE_URL",
      convexUrl: "DIASPORA_GA_{CIBLE}_CONVEX_URL",
      convexSiteUrl: "DIASPORA_GA_{CIBLE}_CONVEX_SITE_URL",
      projectId: "ADMIN_DIASPORA_GA_{CIBLE}_VERCEL_PROJECT_ID",
      membersSiteUrl: "DIASPORA_GA_{CIBLE}_SITE_URL",
    },
    releaseKeys: ["siteUrl", "convexUrl", "convexSiteUrl", "projectId", "orgId", "scope", "membersSiteUrl"],
    optionalUrlKeys: [],
    optionalMediaKeys: [],
    optionalFlagKeys: [],
    publicVariables: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_MEMBERS_SITE_URL", "CONVEX_SITE_URL"],
    siteVariables: [
      ["NEXT_PUBLIC_SITE_URL", { machine: "siteUrl" }],
      ["NEXT_PUBLIC_CONVEX_URL", { machine: "convexUrl" }],
      ["CONVEX_SITE_URL", { machine: "convexSiteUrl" }],
      ["NEXT_PUBLIC_BUILD_SHA", { version: true }],
      ["NEXT_PUBLIC_MEMBERS_SITE_URL", { machine: "membersSiteUrl" }],
    ],
    health: { path: HEALTH_PATH, application: "admin-diaspora-ga", dataSource: "optional", engine: "probe" },
  },
})

/**
 * L'ordre de `--app all` : le moteur est publié AVANT, par sa session ; puis
 * admin.diaspora.ga, qui rend joignables les réglages que le moteur vient de retirer au
 * bureau des membres (fenêtre de déménagement, lot A6), puis diaspora.ga.
 */
export const ALL_APPS_ORDER = Object.freeze(["admin_diaspora_ga", "diaspora_ga"])

/** La ligne d'une application ; une clé inconnue est une erreur de programmation. */
export function releaseApp(app = DEFAULT_RELEASE_APP) {
  if (!Object.hasOwn(RELEASE_APPS, app)) throw new Error(`Application inconnue : ${app}`)
  return RELEASE_APPS[app]
}

/** Les applications d'une valeur de `--app` (absente : diaspora.ga seule). */
export function appsOf(app = DEFAULT_RELEASE_APP) {
  if (app === ALL_RELEASE_APPS) return ALL_APPS_ORDER
  releaseApp(app)
  return Object.freeze([app])
}

/**
 * Lit `--app`. Absente : `app` reste `undefined`, qui vaut diaspora.ga partout (les
 * fonctions prennent `diaspora_ga` par défaut). `all` n'est admis que pour publier :
 * chaque application se contrôle et se remet en arrière par sa propre commande.
 * @returns {{ app: string | undefined, problem: string | null }}
 */
export function parseApp(raw, { allowAll = false } = {}) {
  if (raw === undefined) return { app: undefined, problem: null }
  if (Object.hasOwn(RELEASE_APPS, raw)) return { app: raw, problem: null }
  if (raw === ALL_RELEASE_APPS && allowAll) return { app: raw, problem: null }
  if (raw === ALL_RELEASE_APPS) {
    return { app: undefined, problem: "--app all ne vaut que pour la publication : chaque application se contrôle et se remet en arrière par sa propre commande" }
  }
  const accepted = ["diaspora_ga (par défaut)", "admin_diaspora_ga", ...(allowAll ? ["all (les deux, dans la même séance)"] : [])]
  return { app: undefined, problem: `--app inconnue (« ${raw} ») : valeurs admises ${accepted.join(", ")}` }
}

/**
 * Les NOMS des variables de la machine d'une application pour une cible, jamais leur
 * valeur. Une variable par cible : les réglages de la démonstration ne servent jamais la
 * production, par construction.
 */
export function appVariableNames(app, target) {
  const suffix = target.toUpperCase()
  return Object.freeze(Object.fromEntries(Object.entries(releaseApp(app).machineVariables).map(([key, name]) => [key, name.replace("{CIBLE}", suffix)])))
}

/** Les noms des variables de diaspora.ga pour une cible (forme d'avant `--app`). */
export function targetVariableNames(target) {
  return appVariableNames(DEFAULT_RELEASE_APP, target)
}

/** Variables de la machine communes aux deux cibles et aux deux applications. */
export const SHARED_VARIABLE_NAMES = Object.freeze({
  orgId: "DIASPORA_GA_VERCEL_ORG_ID",
  scope: "DIASPORA_GA_VERCEL_SCOPE",
  workdir: "DIASPORA_GA_RELEASE_WORKDIR",
})

/** Ce que chaque script exige de l'environnement (publication : selon l'application, `appReleaseKeys`). */
export const RELEASE_KEYS = RELEASE_APPS.diaspora_ga.releaseKeys
export const CHECK_KEYS = Object.freeze(["siteUrl", "convexUrl"])
export const ROLLBACK_KEYS = Object.freeze(["siteUrl", "convexUrl", "projectId", "orgId", "scope"])

/** Ce que la publication d'une application exige de l'environnement. */
export function appReleaseKeys(app = DEFAULT_RELEASE_APP) {
  return releaseApp(app).releaseKeys
}

const ORIGIN_KEYS = new Set(["siteUrl", "convexUrl", "convexSiteUrl", "membersSiteUrl"])
const PUBLIC_SITE_KEYS = new Set(["siteUrl", "membersSiteUrl"])
const TOKEN_KEYS = new Set(["projectId", "orgId", "scope"])
/** Ressources qui ne se partagent jamais entre la démonstration et la production. */
const EXCLUSIVE_KEYS = ["siteUrl", "convexUrl", "convexSiteUrl", "projectId", "membersSiteUrl"]
/** Ressources propres à chaque application : publier l'une ne doit jamais écraser l'autre. */
const APP_EXCLUSIVE_KEYS = ["siteUrl", "projectId"]

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])
const LOCAL_SUFFIXES = [".localhost", ".test"]

function isHttpsOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.origin === value
  } catch {
    return false
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/** Une origine `wss://` exacte (sans chemin, requête ni barre finale) : celle d'un serveur média publié. */
function isWssOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === "wss:" && !url.username && !url.password && `${url.protocol}//${url.host}` === value
  } catch {
    return false
  }
}

/** Même règle que la garde de construction (LX-01) : tout sauf un poste de développement est public. */
function isPublicHost(origin) {
  const hostname = new URL(origin).hostname.toLowerCase()
  return !LOCAL_HOSTNAMES.has(hostname) && !LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

const isToken = (value) => /^[A-Za-z0-9_.-]+$/.test(value)

function variableName(app, target, key) {
  return key in SHARED_VARIABLE_NAMES ? SHARED_VARIABLE_NAMES[key] : appVariableNames(app, target)[key]
}

/**
 * Lit l'environnement de la machine pour une cible et une application. Rend les
 * valeurs (pour l'exécution, jamais pour l'affichage) et les défauts, qui ne nomment
 * que des variables.
 * @param {"demo" | "production"} target
 * @param {Record<string, string | undefined>} env
 * @param {readonly string[]} keys les clés exigées (`appReleaseKeys(app)`, CHECK_KEYS, ROLLBACK_KEYS)
 * @param {string} [app] l'application (absente : diaspora.ga)
 */
export function readTargetEnv(target, env = process.env, keys = RELEASE_KEYS, app = DEFAULT_RELEASE_APP) {
  const { optionalUrlKeys, optionalMediaKeys, optionalFlagKeys } = releaseApp(app)
  const name = (key, forTarget = target, forApp = app) => variableName(forApp, forTarget, key)
  const values = {}
  const problems = []
  const read = (variable) => env[variable]?.trim() || undefined
  for (const key of keys) {
    const variable = name(key)
    const value = read(variable)
    if (!value) {
      problems.push(`${variable} manque`)
      continue
    }
    if (ORIGIN_KEYS.has(key) && !isHttpsOrigin(value)) problems.push(`${variable} doit être une origine https, sans chemin ni barre finale`)
    else if (PUBLIC_SITE_KEYS.has(key) && !isPublicHost(value)) problems.push(`${variable} doit désigner un domaine public : un poste de développement ne se publie pas`)
    else if (TOKEN_KEYS.has(key) && !isToken(value)) problems.push(`${variable} n'a pas la forme d'un identifiant (lettres, chiffres, « _ », « - », « . »)`)
    values[key] = value
  }
  for (const key of optionalUrlKeys) {
    const variable = name(key)
    const value = read(variable)
    if (value === undefined) continue
    if (!isHttpsUrl(value)) problems.push(`${variable} doit être une adresse https`)
    values[key] = value
  }
  for (const key of optionalMediaKeys) {
    const variable = name(key)
    const value = read(variable)
    if (value === undefined) continue
    if (!isWssOrigin(value)) problems.push(`${variable} doit être une origine wss, sans chemin ni barre finale`)
    values[key] = value
  }
  // La sonde et le retour arrière réutilisent un site déjà construit.
  const buildFlags = keys === CHECK_KEYS || keys === ROLLBACK_KEYS ? [] : optionalFlagKeys
  for (const key of buildFlags) {
    const variable = name(key)
    const value = env[variable]
    if (value === undefined || value === "") continue
    if (value !== "0" && value !== "1") problems.push(`${variable} doit valoir 0 ou 1`)
    else values[key] = value
  }
  const other = otherTarget(target)
  for (const key of EXCLUSIVE_KEYS) {
    if (!keys.includes(key) || values[key] === undefined) continue
    const otherName = name(key, other)
    if (read(otherName) === values[key]) {
      problems.push(`${name(key)} et ${otherName} désignent la même ressource : une cible ne se publie jamais sur l'autre`)
    }
  }
  // Le site et le projet d'hébergement d'une application ne sont jamais ceux de l'autre.
  for (const key of APP_EXCLUSIVE_KEYS) {
    if (!keys.includes(key) || values[key] === undefined) continue
    for (const otherApp of Object.keys(RELEASE_APPS).filter((candidate) => candidate !== app)) {
      const otherName = name(key, target, otherApp)
      if (otherName !== name(key) && read(otherName) === values[key]) {
        problems.push(`${name(key)} et ${otherName} désignent la même ressource : une application ne se publie jamais sur l'autre`)
      }
    }
  }
  return { values, problems }
}

/**
 * Les variables qu'une publication de diaspora.ga passe au site : la liste du catalogue
 * de publication du moteur (`build_args` et `runtime_env` de `diaspora_ga`), rien
 * d'autre. Aucune n'est un secret ; un nom hors de cette liste fait échouer le plan.
 * Celle de chaque application : `releaseApp(app).publicVariables`.
 */
export const PUBLIC_RELEASE_VARIABLES = RELEASE_APPS.diaspora_ga.publicVariables

/** Refuse toute variable qui ne serait pas dans la liste publique de l'application. */
export function assertPublicOnly(entries, app = DEFAULT_RELEASE_APP) {
  const { publicVariables } = releaseApp(app)
  const rejected = entries.map(([name]) => name).filter((name) => !publicVariables.includes(name))
  if (rejected.length > 0) throw new Error(`Variable refusée, hors de la liste publique : ${rejected.join(", ")}`)
  return entries
}

const FULL_COMMIT = /^[0-9a-f]{40}$/
const VERSION_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(RELEASE_APPS).map(([app, { versionPrefix }]) => [app, new RegExp(`^${versionPrefix.replaceAll(".", "\\.")}-([0-9a-f]{12})-antsia-([0-9a-f]{12})-(demo|production)$`)]),
  ),
)

/** L'étiquette de version, tirée des deux commits : celle que la sonde doit dire après publication. */
export function releaseVersion({ diasporaGaCommit, antsiaCommit, target, app = DEFAULT_RELEASE_APP }) {
  if (!FULL_COMMIT.test(diasporaGaCommit) || !FULL_COMMIT.test(antsiaCommit)) throw new Error("Commit complet attendu (40 caractères hexadécimaux)")
  if (parseTarget(target) === null) throw new Error("Cible inconnue")
  return `${releaseApp(app).versionPrefix}-${diasporaGaCommit.slice(0, 12)}-antsia-${antsiaCommit.slice(0, 12)}-${target}`
}

/** Une étiquette de version de l'application lue (contrôle, retour arrière), ou `null` si elle n'a pas la forme attendue. */
export function parseVersionLabel(raw, app = DEFAULT_RELEASE_APP) {
  releaseApp(app)
  const match = VERSION_LABELS[app].exec(raw ?? "")
  return match ? { diasporaGa: match[1], antsia: match[2], target: match[3] } : null
}

/** L'application dont une étiquette a la forme, ou `null`. */
export function versionLabelApp(raw) {
  return Object.keys(RELEASE_APPS).find((app) => parseVersionLabel(raw, app) !== null) ?? null
}

/** Le gabarit de l'étiquette d'une application, pour les messages d'usage. */
export function versionLabelPattern(app = DEFAULT_RELEASE_APP) {
  return `${releaseApp(app).versionPrefix}-<12>-antsia-<12>-<cible>`
}

/**
 * Lit `--version` pour une application et une cible : les défauts dits comme avant
 * `--app` pour diaspora.ga, et une étiquette de l'autre application nommée comme telle.
 */
export function versionProblems(raw, { app = DEFAULT_RELEASE_APP, target }) {
  const label = parseVersionLabel(raw, app)
  if (!label) {
    const owner = versionLabelApp(raw)
    return [owner ? `--version désigne une autre application que --app : ${owner}, pas ${app}` : `--version doit être une étiquette ${versionLabelPattern(app)}`]
  }
  return target !== null && label.target !== target ? ["--version désigne une autre cible que --target"] : []
}

/**
 * Les variables publiques d'une publication, dans l'ordre de la table. Les valeurs tirées
 * de la machine restent des RÉFÉRENCES (`envRef`) jusqu'à l'exécution ; une variable
 * facultative (liens vers IDN et consulat.ga, serveur média) ne passe que si elle est posée.
 */
export function releaseVariables(target, version, values, app = DEFAULT_RELEASE_APP) {
  const names = appVariableNames(app, target)
  const entries = releaseApp(app).siteVariables.flatMap(([name, source]) => {
    if ("value" in source) return [[name, source.value]]
    if (source.version) return [[name, version]]
    if (source.optional && !values[source.machine]) return []
    return [[name, envRef(names[source.machine])]]
  })
  return assertPublicOnly(entries, app)
}

// ═══════════════════════════════════════════════════════════════
// Préalables relus aux commits publiés : le catalogue et l'application, en couple
// ═══════════════════════════════════════════════════════════════

/**
 * Les écarts entre le catalogue de publication du moteur et la ligne d'une application :
 * l'entrée existe, au même dossier, avec la même liste publique. Le catalogue et le
 * dossier de l'application se fusionnent en couple ; c'est le catalogue qui ouvre
 * l'origine de confiance du site dans le moteur et, pour l'application d'administration,
 * l'autorité sur son réseau.
 * @param {unknown} catalog le catalogue lu au commit d'ANTSIA publié, ou `null`
 */
export function catalogProblems(catalog, app = DEFAULT_RELEASE_APP) {
  const { directory, publicVariables, administersNetwork } = releaseApp(app)
  if (!catalog || typeof catalog !== "object") return ["catalogue de publication du moteur illisible au commit d'ANTSIA publié (deploy/catalog.json)"]
  const entry = catalog.applications?.[app]
  if (!entry) return [`l'entrée ${app} manque au catalogue du moteur au commit d'ANTSIA publié : publier un moteur qui la porte`]
  const problems = []
  if (entry.path !== `../DIASPORA_GA/${directory}`) problems.push(`le catalogue du moteur place ${app} ailleurs que DIASPORA_GA/${directory}`)
  const administered = entry.administers_network ?? null
  if (administered !== administersNetwork) {
    problems.push(
      administersNetwork === null
        ? `le catalogue du moteur fait administrer un réseau par ${app} (administers_network), que les scripts publient comme l'application des membres`
        : `le catalogue du moteur ne dit pas que ${app} administre le réseau ${administersNetwork} (administers_network) : aucune session d'administration n'y serait admise`,
    )
  }
  const declared = [...(entry.build_args ?? []), ...(entry.runtime_env ?? [])]
  const missing = publicVariables.filter((name) => !declared.includes(name))
  const extra = declared.filter((name) => !publicVariables.includes(name))
  if (missing.length > 0 || extra.length > 0) {
    problems.push(`la liste publique de ${app} diffère du catalogue du moteur (${[...missing.map((name) => `absente du catalogue : ${name}`), ...extra.map((name) => `absente des scripts : ${name}`)].join(", ")})`)
  }
  return problems
}

/**
 * Relève, par les dépôts locaux seulement (aucun réseau), que chaque application existe
 * au commit de DIASPORA_GA publié et que le catalogue du commit d'ANTSIA publié la
 * déclare. Rend les défauts, sans doublon.
 */
export function releasePrerequisites({ apps, antsiaCommit, diasporaGaCommit, repos = RELEASE_REPOSITORIES, run = runCommand }) {
  const shown = run(["git", "-C", repos.ANTSIA, "show", `${antsiaCommit}:deploy/catalog.json`])
  const catalog = shown.status === 0 ? parseJson(shown.stdout) : null
  const problems = []
  for (const app of apps) {
    const { directory } = releaseApp(app)
    // `ls-tree` ne dit rien d'un chemin absent (aucun « fatal » au journal) : la sortie vide suffit.
    const listed = run(["git", "-C", repos.DIASPORA_GA, "ls-tree", "--name-only", diasporaGaCommit, "--", `${directory}/package.json`])
    if (listed.status !== 0 || listed.stdout.trim() !== `${directory}/package.json`) {
      problems.push(`${directory} absent du commit de DIASPORA_GA publié`)
    }
    problems.push(...catalogProblems(catalog, app))
  }
  return [...new Set(problems)]
}

// ═══════════════════════════════════════════════════════════════
// Commandes : références affichées par leur nom, résolues à l'exécution
// ═══════════════════════════════════════════════════════════════

/** Une valeur lue dans l'environnement de la machine : affichée `<NOM>`. */
export const envRef = (name) => Object.freeze({ env: name })
/** Une valeur connue seulement en cours d'exécution (adresse du déploiement…) : affichée `<libellé>`. */
export const runtimeRef = (key, label) => Object.freeze({ runtime: key, label })
/** Un dépôt du contexte : affiché par son nom, résolu en chemin. */
export const repoRef = (name) => Object.freeze({ repo: name })

function renderPart(part) {
  if (typeof part === "string") return part
  if ("env" in part) return `<${part.env}>`
  if ("runtime" in part) return `<${part.label}>`
  return part.repo
}

/** Un argument : une chaîne, une référence, ou une suite de morceaux (`NOM=<référence>`). */
export function renderArg(arg) {
  const text = Array.isArray(arg) ? arg.map(renderPart).join("") : renderPart(arg)
  return /^[\w@%+=:,./<>-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`
}

/** La commande telle que le plan l'affiche : aucune valeur de la machine n'y paraît. */
export function renderCommand(argv) {
  return argv.map(renderArg).join(" ")
}

function resolvePart(part, context) {
  if (typeof part === "string") return part
  if ("env" in part) {
    const value = context.env[part.env]?.trim()
    if (!value) throw new Error(`${part.env} manque`)
    return value
  }
  if ("runtime" in part) {
    const value = context.runtime[part.runtime]
    if (!value) throw new Error(`Valeur d'exécution absente : ${part.label}`)
    return value
  }
  const path = context.repos[part.repo]
  if (!path) throw new Error(`Dépôt inconnu : ${part.repo}`)
  return path
}

/** La commande prête à lancer. */
export function resolveCommand(argv, context) {
  return argv.map((arg) => (Array.isArray(arg) ? arg.map((part) => resolvePart(part, context)).join("") : resolvePart(arg, context)))
}

/** Les variables d'environnement d'une étape (noms → références), résolues. */
export function resolveStepEnv(stepEnv, context) {
  return Object.fromEntries(Object.entries(stepEnv ?? {}).map(([name, ref]) => [name, resolvePart(ref, context)]))
}

/**
 * Lance une commande sans shell. La sortie standard est capturée (adresse du
 * déploiement, JSON) ; le journal d'erreur s'affiche en direct ; l'entrée est fermée,
 * aucun outil ne peut donc attendre une réponse cachée.
 */
export function runCommand(argv, { env, cwd } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

// ═══════════════════════════════════════════════════════════════
// Commits et contexte figé
// ═══════════════════════════════════════════════════════════════

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

/**
 * Résout une référence en commit et en arbre, par le dépôt local seulement (aucun
 * réseau). Refuse une référence qui pourrait passer pour une option.
 */
export function resolveCommit(repoPath, ref, run = runCommand) {
  if (typeof ref !== "string" || !SAFE_REF.test(ref)) throw new Error("Référence de commit illisible")
  const commit = run(["git", "-C", repoPath, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).stdout.trim()
  if (!FULL_COMMIT.test(commit)) throw new Error(`Commit introuvable : ${ref}`)
  const tree = run(["git", "-C", repoPath, "rev-parse", "--verify", "--quiet", `${commit}^{tree}`]).stdout.trim()
  if (!FULL_COMMIT.test(tree)) throw new Error(`Arbre introuvable pour ${ref}`)
  return { commit, tree }
}

/** Le commit est-il sur `origin/main` (relevé du dépôt local) ? */
export function isPublishedCommit(repoPath, commit, run = runCommand) {
  return run(["git", "-C", repoPath, "merge-base", "--is-ancestor", commit, "origin/main"]).status === 0
}

/** Ce qui ne part jamais dans le contexte figé (même liste que la méthode du 22/10). */
export const CONTEXT_EXCLUDED_DIRECTORIES = Object.freeze(["node_modules", ".next", ".git", "docs", "coverage", ".convex", ".turbo", ".vercel"])
const CONTEXT_EXCLUDED_FILES = new Set(["CLAUDE.md", "AGENTS.md"])

/** Le `.vercelignore` posé à la racine du contexte : la même liste, pour l'hébergeur. */
export const VERCELIGNORE = [
  ...CONTEXT_EXCLUDED_DIRECTORIES.map((directory) => `**/${directory}/**`),
  "**/.env*",
  "**/CLAUDE.md",
  "**/AGENTS.md",
  "**/*.tsbuildinfo",
].join("\n") + "\n"

/** Un chemin relatif du contexte est-il exclu de l'empreinte et de l'envoi ? */
export function isExcludedFromContext(relativePath) {
  const parts = relativePath.split("/")
  const name = parts.at(-1) ?? ""
  return (
    parts.some((part) => CONTEXT_EXCLUDED_DIRECTORIES.includes(part)) ||
    name.startsWith(".env") ||
    CONTEXT_EXCLUDED_FILES.has(name) ||
    name.endsWith(".tsbuildinfo")
  )
}

/**
 * L'empreinte des sources d'un contexte : SHA-256 de chaque fichier retenu, puis
 * SHA-256 de la liste triée « chemin NUL empreinte ». Un lien symbolique compte par sa cible.
 */
export function contextFingerprint(contextDir) {
  const files = {}
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const path = relative(contextDir, absolute).split("\\").join("/")
      if (isExcludedFromContext(path)) continue
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isSymbolicLink()) files[path] = createHash("sha256").update(`lien:${readlinkSync(absolute)}`).digest("hex")
      else if (entry.isFile()) files[path] = createHash("sha256").update(readFileSync(absolute)).digest("hex")
    }
  }
  walk(contextDir)
  const lines = Object.keys(files)
    .sort()
    .map((path) => `${path}\0${files[path]}\n`)
    .join("")
  return { fingerprint: createHash("sha256").update(lines).digest("hex"), files: Object.keys(files).length }
}

/** `child` est-il `parent` ou sous lui ? */
export function isInside(child, parent) {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

/**
 * Crée un dossier de travail VIDE, hors des dépôts : sous `DIASPORA_GA_RELEASE_WORKDIR`
 * s'il est posé, sinon sous le dossier temporaire du système. Rien n'est effacé.
 */
export function createWorkdir(env = process.env, base = tmpdir()) {
  const parent = resolve(env[SHARED_VARIABLE_NAMES.workdir]?.trim() || base)
  if (isInside(parent, ECOSYSTEMS_ROOT)) throw new Error(`${SHARED_VARIABLE_NAMES.workdir} doit être hors des dépôts`)
  mkdirSync(parent, { recursive: true })
  return mkdtempSync(join(parent, "diaspora-ga-publication-"))
}

/** Les commandes qui figent un dépôt : `git archive` du commit, puis extraction. */
export function freezeCommands(name, commit) {
  return [
    ["git", "-C", repoRef(name), "archive", "--format=tar", "-o", [runtimeRef("workdir", "dossier de travail"), `/${name}.tar`], commit],
    ["tar", "-xf", [runtimeRef("workdir", "dossier de travail"), `/${name}.tar`], "-C", [runtimeRef("context", "contexte figé"), `/${name}`]],
  ]
}

/**
 * Fige le contexte de publication dans `workdir/ECOSYSTEMES` : les fichiers SUIVIS des
 * deux commits (aucun `.env.local`, aucun fichier de travail), le `.vercelignore`, puis
 * l'empreinte des sources.
 */
export function freezeContext({ workdir, commits, repos = RELEASE_REPOSITORIES, run = runCommand }) {
  const context = join(workdir, "ECOSYSTEMES")
  const runtime = { workdir, context }
  for (const [name, commit] of Object.entries(commits)) {
    mkdirSync(join(context, name), { recursive: true })
    for (const argv of freezeCommands(name, commit)) {
      if (run(resolveCommand(argv, { env: {}, runtime, repos })).status !== 0) throw new Error(`Contexte figé impossible : ${renderCommand(argv)}`)
    }
  }
  writeFileSync(join(context, ".vercelignore"), VERCELIGNORE)
  return { context, ...contextFingerprint(context) }
}

/** Écrit le relevé d'une publication dans le dossier de travail (hors des dépôts : il contient des identifiants). */
export function writeRecord(workdir, record) {
  writeFileSync(join(workdir, "release.json"), `${JSON.stringify(record, null, 2)}\n`)
}

// ═══════════════════════════════════════════════════════════════
// Hébergeur : lecture de ses réponses
// ═══════════════════════════════════════════════════════════════

/** Un JSON lu, ou `null`. */
export function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** La réponse de `vercel inspect --format=json`, réduite à ce qui sert ; `null` si illisible. */
export function parseInspect(text) {
  const value = parseJson(text)
  if (!value || typeof value !== "object" || typeof value.id !== "string") return null
  const url = typeof value.url === "string" && value.url ? (value.url.startsWith("https://") ? value.url : `https://${value.url}`) : null
  return {
    id: value.id,
    url,
    readyState: typeof value.readyState === "string" ? value.readyState : null,
    target: typeof value.target === "string" ? value.target : null,
    projectId: typeof value.projectId === "string" ? value.projectId : null,
  }
}

/** L'adresse du déploiement : la dernière ligne de la sortie standard de `vercel deploy`. */
export function deploymentUrlFrom(stdout) {
  const line = stdout.trim().split("\n").at(-1)?.trim() ?? ""
  return isHttpsOrigin(line) ? line : null
}

// ═══════════════════════════════════════════════════════════════
// La porte : accord écrit du propriétaire, puis confirmation tapée
// ═══════════════════════════════════════════════════════════════

/** La phrase exacte à taper pour franchir une porte. */
export function confirmationPhrase(action, target, version) {
  return `${action} ${target} ${version}`
}

/**
 * Le rappel de la porte, affiché avant chaque confirmation. Aucune option ne la
 * contourne : sans accord écrit et détaillé du propriétaire, l'opérateur répond autre
 * chose et rien ne part.
 */
export function agreementNotice(points) {
  return [
    "",
    "PORTE — accord écrit et détaillé du propriétaire, avant toute commande vers l'hébergeur :",
    ...points.map((point) => `  • ${point}`),
    "Sans cet accord, tapez autre chose que la phrase demandée : rien ne partira.",
  ].join("\n")
}

/**
 * Demande la phrase exacte dans un TERMINAL. Toute autre réponse, une entrée qui n'est
 * pas un terminal (tube, script, agent) ou une fin de flux refusent.
 */
export async function confirmPhrase(phrase, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) {
    output.write("Confirmation refusée : elle se tape dans un terminal, par une personne.\n")
    return false
  }
  const reader = createInterface({ input, output, terminal: false })
  try {
    const answer = await new Promise((resolveAnswer) => {
      reader.once("close", () => resolveAnswer(null))
      reader.question(`\nPour confirmer, tapez exactement :\n  ${phrase}\n> `).then(resolveAnswer, () => resolveAnswer(null))
    })
    return typeof answer === "string" && answer.trim() === phrase
  } finally {
    reader.close()
  }
}

/** Lit `--nom valeur` et les drapeaux d'une ligne de commande ; tout le reste est un défaut. */
export function parseOptions(argv, { values: valueNames, flags: flagNames }) {
  const options = {}
  const problems = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const name = arg.startsWith("--") ? arg.slice(2) : null
    if (name !== null && flagNames.includes(name)) options[name] = true
    else if (name !== null && valueNames.includes(name)) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) problems.push(`--${name} attend une valeur`)
      else {
        options[name] = value
        index += 1
      }
    } else problems.push(`argument inconnu : ${arg}`)
  }
  return { options, problems }
}
