/**
 * La cohorte fondatrice telle que la section « Fondateurs » la lit (fiche CH-815 § 4.2, lot A3 du
 * moteur : `diaspora/founders`) — module PUR : la cohorte pleine, la façon de citer une personne
 * (nom PUBLIÉ, sinon identifiant public, sinon un nom neutre que l'écran dit), et les refus métier
 * du domaine de DIASPORA.GA, ensemble fermé, chacun avec sa phrase.
 */
import { engineErrorAppRule } from "@antsia/social-contracts/errors"
import type { api } from "@convex/_generated/api"
import type { FunctionReturnType } from "convex/server"

/** La cohorte rendue par `diaspora/founders.cohort` : plafond, nombre en vigueur, admissions. */
export type CohortView = FunctionReturnType<typeof api.modules.diaspora.founders.cohort>
export type Admission = CohortView["active"][number]

/** La cohorte a atteint son plafond : aucune admission de plus tant qu'aucune n'est retirée. */
export function cohortFull(view: Pick<CohortView, "activeCount" | "cohortMax">): boolean {
  return view.activeCount >= view.cohortMax
}

/** Une personne telle que le moteur la cite : identifiant et nom publiés, vides sinon. */
export interface PersonLabel {
  readonly handle: string
  readonly displayName: string
}

/** Le nom à citer : le nom publié, sinon l'identifiant public, sinon `null` (l'écran dit un nom neutre). */
export function personName(person: PersonLabel): string | null {
  if (person.displayName) return person.displayName
  if (person.handle) return `@${person.handle}`
  return null
}

/** Les refus métier de la cohorte, rendus par le moteur (`appRule`), et leur phrase dans l'espace `admin`. */
export const FOUNDER_REFUSAL_KEYS = {
  founding_target_not_member: "founders.refusal.notMember",
  founding_already_admitted: "founders.refusal.alreadyAdmitted",
  founding_cohort_full: "founders.refusal.cohortFull",
  founding_not_admitted: "founders.refusal.notAdmitted",
} as const

export type FounderRefusal = keyof typeof FOUNDER_REFUSAL_KEYS

/** Le refus métier d'une décision sur la cohorte, s'il appartient à l'ensemble fermé ; ses paramètres numériques (le plafond). */
export function founderRefusalOf(error: unknown): { readonly key: (typeof FOUNDER_REFUSAL_KEYS)[FounderRefusal]; readonly params: Readonly<Record<string, number>> } | null {
  const refusal = engineErrorAppRule(error)
  if (refusal === null || !Object.hasOwn(FOUNDER_REFUSAL_KEYS, refusal.appRule)) return null
  return { key: FOUNDER_REFUSAL_KEYS[refusal.appRule as FounderRefusal], params: refusal.appParams }
}
