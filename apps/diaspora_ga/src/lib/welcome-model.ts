/**
 * `/bienvenue` en un seul écran (décision du 25/11/2026, lot A1) — module PUR.
 *
 * L'écran a un seul geste, « Créer mon profil et entrer ». Ce module dit, d'après ce qu'il reçoit,
 * ce que l'écran MONTRE en ligne de rappel (avec « Modifier ») et ce qu'il DEMANDE en champ, et ce
 * que le clic envoie :
 *
 *  · l'identité : un profil commun déjà là (EA-04, publié ou retiré) est gardé tel quel ; sinon,
 *    quand IDN donne un nom affichable ET un identifiant libre, une ligne de rappel ; sinon les
 *    champs, déjà remplis de ce qu'IDN donne. Le premier identifiant libre est présélectionné ;
 *    un identifiant pris ou hors charte n'est jamais proposé ;
 *  · la résidence : la facette d'avant le départ, puis IDN, puis la saisie. Une ligne de rappel
 *    seulement pour un pays connu hors du Gabon ; un pays fermé reste une ligne de rappel, que
 *    l'écran marque de l'avis `countryNotOpen` (on entre quand même) ;
 *  · le clic : le profil social accordé, l'annuaire masqué, les notifications coupées — ils se
 *    proposent après l'entrée. Aucune année d'arrivée n'est demandée à l'entrée ; celle d'avant
 *    un départ est gardée si la personne revient dans le même pays.
 *
 * Rien n'est écrit avant le clic : ce module ne fait que lire et composer.
 */
import { CITY_MAX_LENGTH, isResidenceCountry, type CountryCode } from "@diaspora-ga/domain"
import { handleRefusal, normalizeHandle } from "@diaspora-ga/features"
import type { EntryPrefillView, JoinInput, OwnProfileView } from "@diaspora-ga/features/data"

/** Les bornes du nom affiché, celles du formulaire et du fournisseur de démonstration. */
export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 60

/**
 * L'identité commune déjà là (EA-04) : aucune (compte neuf), publiée (membre d'ANTSIA, retour
 * après un départ) ou retirée. Seul un compte neuf reçoit un nom et un identifiant ; les autres
 * gardent les leurs, accroche comprise.
 */
export type ExistingIdentity =
  | { readonly kind: "none" }
  | {
      readonly kind: "published" | "withdrawn"
      readonly personId: string
      readonly handle: string
      readonly displayName: string
      readonly headline: string | null
    }

export type KeptIdentity = Exclude<ExistingIdentity, { readonly kind: "none" }>

export const NO_IDENTITY: ExistingIdentity = { kind: "none" }

/** Le profil commun lu avant l'accueil ; sans identifiant ni nom, ce n'est pas encore une identité. */
export function existingIdentityOf(profile: OwnProfileView | null): ExistingIdentity {
  const handle = profile?.handle ?? ""
  const displayName = profile?.displayName ?? ""
  if (profile === null || !handle.trim() || !displayName.trim()) return NO_IDENTITY
  return { kind: profile.published ? "published" : "withdrawn", personId: profile.personId, handle, displayName, headline: profile.headline }
}

/** La facette d'une adhésion partie, reprise au retour. */
export interface ReturningFacet {
  readonly countryOfResidence: CountryCode
  readonly city?: string
  readonly arrivedAt?: number
}

export interface WelcomeModelInput {
  /** Ce que le moteur propose d'après IDN (lot A4) ; `null` : rien. */
  readonly prefill: EntryPrefillView | null
  /** Les pays ouverts ; `null` tant qu'ils ne sont pas lus (rien n'est alors affirmé). */
  readonly openCountries: readonly CountryCode[] | null
  readonly identity: ExistingIdentity
  /** La facette d'avant le départ, si la personne revient. */
  readonly returning: ReturningFacet | null
}

export type WelcomeIdentityPlan =
  | { readonly mode: "kept"; readonly identity: KeptIdentity }
  | { readonly mode: "summary"; readonly displayName: string; readonly handle: string }
  | { readonly mode: "fields" }

export type WelcomeResidencePlan =
  | {
      readonly mode: "summary"
      readonly source: "departed" | "idn"
      readonly country: CountryCode
      readonly city: string
      /** Le pays est-il ouvert ? `null` : pas encore lu. */
      readonly open: boolean | null
    }
  | { readonly mode: "fields" }

/** Les valeurs de départ du formulaire (chaînes de saisie). */
export interface WelcomeDefaults {
  readonly displayName: string
  readonly handleChoice: string
  readonly country: string
  readonly city: string
}

export interface WelcomeModel {
  readonly identity: WelcomeIdentityPlan
  readonly residence: WelcomeResidencePlan
  /** Les identifiants proposés d'après IDN, libres et conformes, dans l'ordre de préférence. */
  readonly handleCandidates: readonly string[]
  readonly defaults: WelcomeDefaults
  readonly returning: ReturningFacet | null
}

/** Les identifiants d'IDN qu'on peut proposer : libres, conformes à la règle, sans doublon. */
function freeCandidates(prefill: EntryPrefillView | null): string[] {
  if (prefill === null) return []
  const candidates = prefill.handles.filter((item) => item.available && handleRefusal(item.handle) === null).map((item) => normalizeHandle(item.handle))
  return [...new Set(candidates)]
}

function isDisplayableName(name: string): boolean {
  return name.length >= DISPLAY_NAME_MIN && name.length <= DISPLAY_NAME_MAX
}

/** La résidence connue : la facette d'avant le départ d'abord, puis IDN. `null` : rien à reprendre. */
function knownResidence(input: WelcomeModelInput): { source: "departed" | "idn"; country: string; city: string } | null {
  if (input.returning) return { source: "departed", country: input.returning.countryOfResidence, city: input.returning.city ?? "" }
  const residence = input.prefill?.residence ?? null
  if (residence === null) return null
  return { source: "idn", country: residence.country, city: residence.city ?? "" }
}

export function welcomeModel(input: WelcomeModelInput): WelcomeModel {
  const kept = input.identity.kind === "none" ? null : input.identity
  // Un profil déjà là n'est ni redemandé ni renommé : le nom d'IDN ne lui est pas proposé.
  const handleCandidates = kept ? [] : freeCandidates(input.prefill)
  const prefilledName = kept ? "" : (input.prefill?.displayName ?? "").trim()
  const firstHandle = handleCandidates[0] ?? ""
  const identity: WelcomeIdentityPlan = kept
    ? { mode: "kept", identity: kept }
    : isDisplayableName(prefilledName) && firstHandle !== ""
      ? { mode: "summary", displayName: prefilledName, handle: firstHandle }
      : { mode: "fields" }

  const known = knownResidence(input)
  const knownCountry = known !== null && isResidenceCountry(known.country) ? known.country : null
  const residence: WelcomeResidencePlan =
    known !== null && knownCountry !== null && known.city.trim().length <= CITY_MAX_LENGTH
      ? { mode: "summary", source: known.source, country: knownCountry, city: known.city.trim(), open: input.openCountries === null ? null : input.openCountries.includes(knownCountry) }
      : { mode: "fields" }

  return {
    identity,
    residence,
    handleCandidates,
    defaults: {
      displayName: prefilledName,
      handleChoice: firstHandle,
      // Le Gabon ou un pays inconnu ne se reprennent pas : le champ reste vide.
      country: knownCountry ?? "",
      city: knownCountry !== null && known !== null ? known.city.trim() : "",
    },
    returning: input.returning,
  }
}

/** Ce que la personne a sous les yeux au moment du clic. */
export interface WelcomeValues {
  readonly displayName: string
  readonly handle: string
  readonly country: CountryCode
  readonly city: string
}

/**
 * L'entrée que le clic envoie. Le profil social est accordé par le geste même ; l'annuaire et les
 * notifications partent à « non » (l'invite de première visite les propose ensuite).
 */
export function welcomeJoinInput(model: WelcomeModel, values: WelcomeValues): JoinInput {
  const keptArrival = model.returning !== null && model.returning.countryOfResidence === values.country ? model.returning.arrivedAt : undefined
  return {
    facet: { countryOfResidence: values.country, city: values.city, ...(keptArrival !== undefined ? { arrivedAt: keptArrival } : {}) },
    // Un profil déjà là n'envoie rien : le fournisseur le garde tel quel (EA-04).
    ...(model.identity.mode === "kept" ? {} : { handle: values.handle, displayName: values.displayName }),
    consents: { social_profile: true, directory: false, notifications: false },
    directoryVisibility: "hidden",
  }
}
