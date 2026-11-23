/**
 * L'inscription d'une organisation (AS-05) : les étapes du parcours guidé, les champs
 * que chacune valide, la recherche des pages au nom proche et les premiers gestes
 * proposés une fois la page inscrite. PROPRIÉTAIRE : chantier « gestion des pages ».
 *
 * Règles pures, sans React : l'écran ne fait que les rendre, comme le contrôleur de
 * création du réseau de l'administration (`creation-controller`). Les clés de texte
 * sont écrites en toutes lettres : le cliquet i18n les relève ici.
 */
import type { MemberPageKind } from "@diaspora-ga/features/data"

import { offeredManageTabs } from "./page-manage-tabs"
import { routes } from "./routes"

// ═══════════════════════════════════════════════════════════════
// Qui voit l'inscription
// ═══════════════════════════════════════════════════════════════

/**
 * Les adhésions qui voient « Inscrire une association / une entreprise » dans l'annuaire des
 * pages : tout membre en règle (dans le fil, la carte d'identité ne paraît qu'à qui publie). Le serveur exige ensuite `verifiee`, et l'écran d'inscription dit à
 * un membre non vérifié comment le devenir. Une adhésion suspendue ou quittée n'inscrit rien.
 * La règle vit dans le menu des membres partagé (« Créer » la lit aussi, et l'aperçu
 * d'admin.diaspora.ga avec lui) : une seule source.
 */
export { canSeeRegistration, REGISTERING_STATUSES } from "@diaspora-ga/features/navigation"

// ═══════════════════════════════════════════════════════════════
// Les étapes
// ═══════════════════════════════════════════════════════════════

export const REGISTRATION_STEPS = ["nature", "identity", "review"] as const
export type RegistrationStep = (typeof REGISTRATION_STEPS)[number]

export const REGISTRATION_STEP_LABELS: Readonly<Record<RegistrationStep, string>> = {
  nature: "pageAdmin.register.step.nature",
  identity: "pageAdmin.register.step.identity",
  review: "pageAdmin.register.step.review",
}

/** Les champs du formulaire d'inscription. */
export type RegistrationField = "ownerKind" | "name" | "shortName" | "handle" | "description" | "country" | "city" | "associationType" | "sector"

/** Ce que chaque étape valide avant d'avancer ; le récapitulatif valide tout à l'envoi. */
export const REGISTRATION_STEP_FIELDS: Readonly<Record<RegistrationStep, readonly RegistrationField[]>> = {
  nature: ["ownerKind"],
  identity: ["name", "shortName", "handle", "description", "country", "city", "associationType", "sector"],
  review: [],
}

/** Une nature déjà choisie (adresse `?type=`) ouvre l'identité ; sinon, on commence par la nature. */
export function firstRegistrationStep(kind: MemberPageKind | null): RegistrationStep {
  return kind === null ? "nature" : "identity"
}

export function registrationStepIndex(step: RegistrationStep): number {
  return REGISTRATION_STEPS.indexOf(step)
}

export function nextRegistrationStep(step: RegistrationStep): RegistrationStep | null {
  return REGISTRATION_STEPS[registrationStepIndex(step) + 1] ?? null
}

export function previousRegistrationStep(step: RegistrationStep): RegistrationStep | null {
  const index = registrationStepIndex(step)
  return index > 0 ? REGISTRATION_STEPS[index - 1]! : null
}

/** L'étape qui porte un champ : un refus à l'envoi y ramène. */
export function registrationStepOf(field: RegistrationField): RegistrationStep {
  return REGISTRATION_STEPS.find((step) => REGISTRATION_STEP_FIELDS[step].includes(field)) ?? "identity"
}

/** Les familles de codes de refus du serveur, par champ (le plus long préfixe d'abord). */
const REFUSAL_FIELDS: readonly (readonly [prefix: string, field: RegistrationField])[] = [
  ["page_short_name_", "shortName"],
  ["page_association_type_", "associationType"],
  ["page_description_", "description"],
  ["page_handle_", "handle"],
  ["page_country_", "country"],
  ["page_sector_", "sector"],
  ["page_city_", "city"],
  ["page_name_", "name"],
  ["page_kind_", "ownerKind"],
]

/**
 * Le champ qu'un refus du serveur désigne (adresse prise, nom refusé…) : l'écran le
 * pose sur ce champ et ramène à son étape. `null` : un refus sans champ (adhésion,
 * débit, panne), dit au récapitulatif.
 */
export function registrationFieldOfRefusal(code: string): RegistrationField | null {
  return REFUSAL_FIELDS.find(([prefix]) => code.startsWith(prefix))?.[1] ?? null
}

// ═══════════════════════════════════════════════════════════════
// Ce que chaque nature ouvre
// ═══════════════════════════════════════════════════════════════

/** Une ligne par nature inscriptible : ce que la page permet, dit avant de choisir. */
export const REGISTRATION_NATURE_OFFERS: Readonly<Partial<Record<MemberPageKind, string>>> = {
  association: "pageAdmin.register.natureOffer.association",
  company: "pageAdmin.register.natureOffer.company",
}

// ═══════════════════════════════════════════════════════════════
// Les pages au nom proche
// ═══════════════════════════════════════════════════════════════

/** En deçà, un nom ne dit pas encore assez pour chercher un doublon. */
export const NEARBY_NAME_MIN_LENGTH = 3

/** Les pages proposées au plus : assez pour reconnaître la sienne, jamais un annuaire. */
export const NEARBY_PAGES_MAX = 3

/** Le délai de saisie avant la recherche, en millisecondes. */
export const NEARBY_SEARCH_DELAY_MS = 400

const NEARBY_QUERY_MAX_LENGTH = 120

/** La recherche des pages au nom proche ; `null` tant que le nom compte trop peu de signes (espaces exclues). */
export function nearbyNameQuery(name: string): string | null {
  const compact = name.trim().replace(/\s+/g, " ")
  return compact.replace(/ /g, "").length >= NEARBY_NAME_MIN_LENGTH ? compact.slice(0, NEARBY_QUERY_MAX_LENGTH) : null
}

/**
 * Une page au nom proche se propose à la revendication quand elle n'a pas encore de
 * badge et n'est pas une institution ; l'écran de revendication rejuge tout le reste.
 */
export function nearbyPageClaimable(page: { readonly badge: string; readonly ownerKind: string }): boolean {
  return page.badge === "community" && page.ownerKind !== "institution"
}

// ═══════════════════════════════════════════════════════════════
// Une fois inscrite : les premiers gestes
// ═══════════════════════════════════════════════════════════════

export type RegistrationNextStepId = "identity" | "verification" | "team" | "jobs" | "services" | "members" | "publication"

export interface RegistrationNextStep {
  readonly id: RegistrationNextStepId
  readonly href: string
  readonly titleKey: string
  readonly hintKey: string
}

/** Ce que le fournisseur de données sert : un geste ne mène jamais à un onglet « indisponible ». */
export interface RegistrationCapabilities {
  readonly jobs: boolean
  readonly services: boolean
  readonly members: boolean
}

const NEXT_STEP_KEYS: Readonly<Record<RegistrationNextStepId, Pick<RegistrationNextStep, "titleKey" | "hintKey">>> = {
  identity: { titleKey: "pageAdmin.register.done.identity.title", hintKey: "pageAdmin.register.done.identity.hint" },
  verification: { titleKey: "pageAdmin.register.done.verification.title", hintKey: "pageAdmin.register.done.verification.hint" },
  team: { titleKey: "pageAdmin.register.done.team.title", hintKey: "pageAdmin.register.done.team.hint" },
  jobs: { titleKey: "pageAdmin.register.done.jobs.title", hintKey: "pageAdmin.register.done.jobs.hint" },
  services: { titleKey: "pageAdmin.register.done.services.title", hintKey: "pageAdmin.register.done.services.hint" },
  members: { titleKey: "pageAdmin.register.done.members.title", hintKey: "pageAdmin.register.done.members.hint" },
  publication: { titleKey: "pageAdmin.register.done.publication.title", hintKey: "pageAdmin.register.done.publication.hint" },
}

/**
 * Les premiers gestes d'une page tout juste inscrite, dans l'ordre où ils la font vivre :
 * se rendre reconnaissable, demander le badge « Vérifié », réunir l'équipe, puis ce que
 * sa nature ouvre (accueillir ses adhérents pour une association ; recruter et proposer
 * des services pour l'une et l'autre), et publier. Jamais un geste que la nature n'ouvre
 * pas, ni qui mène à une capacité que le fournisseur ne sert pas.
 */
export function registrationNextSteps(page: { readonly handle: string; readonly ownerKind: MemberPageKind }, capabilities: RegistrationCapabilities): readonly RegistrationNextStep[] {
  const { handle, ownerKind } = page
  const steps: { readonly id: RegistrationNextStepId; readonly href: string }[] = [
    { id: "identity", href: routes.pageManage(handle, "identite") },
    { id: "verification", href: routes.pageClaim(handle) },
    { id: "team", href: routes.pageManage(handle, "equipe") },
  ]
  if (capabilities.members && ownerKind === "association") steps.push({ id: "members", href: routes.associationMembers(handle) })
  // CH-816 (P0) : la règle des onglets de gestion, partagée (`offeredManageTabs`) — jamais un lien vers un onglet non offert.
  const offered = offeredManageTabs(ownerKind, { jobs: capabilities.jobs, servicesOpen: capabilities.services })
  if (offered.includes("emplois")) steps.push({ id: "jobs", href: routes.pageManage(handle, "emplois") })
  if (offered.includes("services")) steps.push({ id: "services", href: routes.pageManage(handle, "services") })
  steps.push({ id: "publication", href: routes.pageManage(handle, "publications") })
  return steps.map((step) => ({ ...step, ...NEXT_STEP_KEYS[step.id] }))
}
