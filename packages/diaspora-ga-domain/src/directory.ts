/**
 * Annuaire des membres, opt-in par niveau (EXF-DG-46).
 *
 * `hidden` par défaut ; `country` (les membres de mon pays) ; `network` (tout
 * DIASPORA.GA). Réservé aux membres actifs, sans export, sans coordonnées : le
 * contact passe par la messagerie (invariant 6).
 *
 * L'annuaire se CHERCHE par un nom et se PARCOURT par pays et par ville
 * (CH-816, lot P3) : les deux chemins jugent chaque membre par la même règle
 * (`isListedInDirectoryFor`), puis les filtres du parcours ne lisent que ce que
 * le lecteur a le droit de voir (`matchesDirectoryBrowse`).
 */
import { isResidenceCountry, normalizeCountryCode, type CountryCode } from "./countries"
import { hasCapability, type MembershipStatus } from "./eligibility"
import { CITY_MAX_LENGTH, type FacetProjection } from "./facet"
import { ok, refuse, type Result } from "./result"
import { cityKeyOf } from "./services"

export const DIRECTORY_VISIBILITY_LEVELS = ["hidden", "country", "network"] as const
export type DirectoryVisibility = (typeof DIRECTORY_VISIBILITY_LEVELS)[number]
export const DEFAULT_DIRECTORY_VISIBILITY: DirectoryVisibility = "hidden"

/** Pagination stricte de l'annuaire : anti-extraction (EXF-DG-35, EXF-DG-46). */
export const DIRECTORY_PAGE_SIZE_MAX = 20

export interface DirectoryTarget {
  readonly status: MembershipStatus
  readonly visibility: DirectoryVisibility
  /** Consentement `directory` en vigueur (registre des consentements). */
  readonly consentActive: boolean
  readonly country: CountryCode
}

export interface DirectoryViewer {
  readonly status: MembershipStatus
  readonly country: CountryCode
  readonly isSelf: boolean
  /** Blocage dans un sens ou dans l'autre : il ferme aussi l'annuaire (EXF-DG-43). */
  readonly blockedWithTarget: boolean
}

/**
 * Le membre paraît-il dans l'annuaire pour ce lecteur ? Il faut QUATRE accords
 * à la fois : le choix d'un niveau, le consentement en vigueur, un statut qui
 * permet d'y figurer, et un lecteur qui a le droit de consulter.
 */
export function isListedInDirectoryFor(target: DirectoryTarget, viewer: DirectoryViewer): boolean {
  if (viewer.isSelf) return target.visibility !== "hidden" && target.consentActive
  if (viewer.blockedWithTarget) return false
  if (!hasCapability(viewer.status, "view_directory")) return false
  if (!hasCapability(target.status, "appear_in_directory")) return false
  if (!target.consentActive) return false
  switch (target.visibility) {
    case "hidden":
      return false
    case "country":
      return viewer.country === target.country
    case "network":
      return true
  }
}

/** Taille de page demandée, bornée — jamais plus que la borne, jamais moins d'une ligne. */
export function clampDirectoryPageSize(requested: number): number {
  if (!Number.isFinite(requested)) return DIRECTORY_PAGE_SIZE_MAX
  return Math.min(DIRECTORY_PAGE_SIZE_MAX, Math.max(1, Math.trunc(requested)))
}

// ═══════════════════════════════════════════════════════════════
// Parcourir l'annuaire par pays et par ville (CH-816, lot P3)
// ═══════════════════════════════════════════════════════════════

/** Ce que le lecteur demande en parcourant : un pays ouvert, une ville saisie (facultative), les vérifiés seulement. */
export interface DirectoryBrowseInput {
  readonly country: string
  readonly city?: string | null
  readonly verifiedOnly?: boolean
}

/** Le parcours normalisé, tel que le serveur et la démonstration l'appliquent. */
export interface DirectoryBrowseFilters {
  readonly country: CountryCode
  /** La ville repliée (`directoryCityKey`) ; `null` : tout le pays. */
  readonly cityKey: string | null
  readonly verifiedOnly: boolean
}

export const DIRECTORY_BROWSE_REFUSALS = ["directory_country_closed", "directory_city_invalid"] as const
export type DirectoryBrowseRefusal = (typeof DIRECTORY_BROWSE_REFUSALS)[number]

// Caractères de contrôle (dont retours à la ligne) : une ville tient sur une ligne, comme dans la facette.
const CITY_CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]")

/**
 * La clé d'une ville de facette : repliée comme les villes saisies du catalogue
 * (`cityKeyOf` — sans accents, tirets ni apostrophes, en minuscules) ; `null`
 * sans ville ou sans lettre. Sert l'index du parcours et sa comparaison.
 */
export function directoryCityKey(city: string | null | undefined): string | null {
  if (city === null || city === undefined) return null
  const key = cityKeyOf(city)
  return key.length > 0 ? key : null
}

/**
 * Valide un parcours : le pays doit être un pays de résidence OUVERT dans le
 * réseau (`openCountries`, donnée du réseau) ; la ville, une ligne de
 * `CITY_MAX_LENGTH` caractères au plus, repliée en clé. Un filtre restreint,
 * il n'ouvre jamais rien.
 */
export function parseDirectoryBrowse(
  input: DirectoryBrowseInput,
  openCountries: readonly string[],
): Result<DirectoryBrowseFilters, DirectoryBrowseRefusal> {
  const country = normalizeCountryCode(input.country)
  if (!isResidenceCountry(country) || !openCountries.includes(country)) return refuse("directory_country_closed")
  const raw = input.city ?? ""
  const city = raw.trim().replace(/\s+/g, " ")
  if (city.length === 0) return ok({ country, cityKey: null, verifiedOnly: input.verifiedOnly === true })
  if (city.length > CITY_MAX_LENGTH || CITY_CONTROL_CHARS.test(raw)) return refuse("directory_city_invalid")
  const cityKey = directoryCityKey(city)
  if (cityKey === null) return refuse("directory_city_invalid")
  return ok({ country, cityKey, verifiedOnly: input.verifiedOnly === true })
}

/**
 * Le filtre de pays de l'annuaire, pour la RECHERCHE comme pour le PARCOURS :
 * il se juge sur la facette projetée pour le lecteur. Un membre qui ne montre
 * pas son pays à ce lecteur n'y répond jamais : filtrer ne révèle rien.
 */
export function matchesDirectoryCountry(projection: FacetProjection, country: CountryCode): boolean {
  return projection.countryOfResidence === country
}

/**
 * Un membre DÉJÀ admis par la règle de l'annuaire répond-il au parcours ? Le
 * pays et la ville se lisent sur la facette PROJETÉE pour le lecteur : un pays
 * ou une ville que le membre ne lui montre pas ne répondent jamais (parcourir
 * ne révèle rien de plus que la fiche).
 */
export function matchesDirectoryBrowse(
  member: { readonly projection: FacetProjection; readonly verified: boolean },
  filters: DirectoryBrowseFilters,
): boolean {
  if (!matchesDirectoryCountry(member.projection, filters.country)) return false
  if (filters.cityKey !== null && directoryCityKey(member.projection.city) !== filters.cityKey) return false
  return !filters.verifiedOnly || member.verified
}

/**
 * Vérifié, au sens du badge (cahier §6.3) : le badge calculé par le moteur à la
 * lecture (identité forte, attestation consulaire) ou le statut « vérifiée » du
 * réseau (fondateurs, `personBadges`). Jamais un drapeau stocké.
 */
export function isVerifiedMember(status: MembershipStatus, badges: readonly string[]): boolean {
  return status === "verifiee" || badges.includes("verified")
}

/**
 * Les badges d'un membre de l'annuaire : ceux du moteur, plus « Vérifié » quand
 * le statut du réseau l'est (la règle de `personBadges`) ; « Communauté »
 * n'apparaissant que seul, il cède alors la place.
 */
export function withMembershipTrust<Badge extends string>(badges: readonly Badge[], status: MembershipStatus): (Badge | "verified")[] {
  if (status !== "verifiee" || badges.includes("verified" as Badge)) return [...badges]
  return ["verified", ...badges.filter((badge) => badge !== "community")]
}
