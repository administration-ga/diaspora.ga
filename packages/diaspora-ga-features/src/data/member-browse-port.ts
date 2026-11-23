/**
 * Capacité « parcourir l'annuaire » (CH-816, lot P3) — PORT de données.
 * PROPRIÉTAIRE : ce chantier.
 *
 * L'annuaire se cherche par un nom (`useMemberSearch` du port principal) et se
 * PARCOURT ici : les membres d'un pays ouvert, d'une ville, des seuls vérifiés,
 * par fenêtres de vingt sur un curseur opaque. Parmi les seuls membres qui ont
 * choisi d'être trouvés, au niveau qu'ils ont choisi : chaque membre est jugé par
 * la même règle que la recherche (`isListedInDirectoryFor`), puis les filtres ne
 * lisent que ce que le lecteur a le droit de voir (`matchesDirectoryBrowse`).
 * Aucune coordonnée : le contact passe par la messagerie.
 *
 * Facultative : un fournisseur qui ne la sert pas la laisse absente, et l'écran
 * garde la recherche seule au lieu d'inventer une liste.
 */
import { DIRECTORY_PAGE_SIZE_MAX, type CountryCode } from "@diaspora-ga/domain"

import type { Loadable, MemberHitView } from "./types"

/** Membres par fenêtre du parcours : la borne de l'annuaire (anti-extraction). */
export const MEMBER_BROWSE_PAGE_SIZE = DIRECTORY_PAGE_SIZE_MAX

export interface MemberBrowseRequest {
  /** Un pays OUVERT du réseau ; un autre pays rend une liste vide, jamais une erreur qui le dirait. */
  readonly country: CountryCode
  /** La ville saisie, repliée par le fournisseur (sans accents ni tirets) ; absente : tout le pays. */
  readonly city?: string
  /** Les seuls membres « Vérifié », selon la confiance calculée à la lecture. */
  readonly verifiedOnly?: boolean
  /** Curseur opaque du fournisseur ; `null` pour la première fenêtre. */
  readonly cursor: string | null
}

export interface MemberBrowsePage {
  readonly items: readonly MemberHitView[]
  /** `null` à la fin ; une fenêtre filtrée peut être vide et annoncer une suite. */
  readonly continueCursor: string | null
  readonly isDone: boolean
}

export type MemberBrowseQuery = Loadable<MemberBrowsePage>

export interface MemberBrowseCapability {
  /** Une fenêtre du parcours, réservée aux membres actifs (le refus de la recherche sinon). */
  useBrowse(args: MemberBrowseRequest): MemberBrowseQuery
}
