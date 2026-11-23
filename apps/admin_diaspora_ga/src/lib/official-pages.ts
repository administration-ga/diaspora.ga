/**
 * Les pages officielles du réseau telles que la section « Institutions et pages officielles » les
 * lit et les crée (fiche CH-815 § 4.2, lot A2 du moteur : `pages/networkAdmin`) — module PUR :
 * l'adresse proposée d'une page (repliée par LA règle du domaine du moteur, jamais réécrite ici),
 * les bornes du nom, les états et la façon de citer le signataire.
 */
import { assertPageHandle, PAGE_HANDLE_MAX_LENGTH, PAGE_HANDLE_MIN_LENGTH, PAGE_NAME_MAX_LENGTH, PAGE_SLEEP_DAYS } from "@antsia/social-domain/pages"
import { DomainViolation } from "@antsia/social-domain/violation"
import type { api } from "@convex/_generated/api"
import type { FunctionArgs, FunctionReturnType } from "convex/server"

/** Une page officielle du réseau, telle que `pages/networkAdmin.officialPages` la rend. */
export type OfficialPageRow = FunctionReturnType<typeof api.modules.pages.networkAdmin.officialPages>["page"][number]

/** Le signataire d'une page (le premier administrateur accepté, sinon la première invitation en attente). */
export type OfficialPageSignatory = NonNullable<OfficialPageRow["signatory"]>

/** L'état d'une page officielle : active, en sommeil, sommeil échu, retirée par la plateforme ou le juge. */
export type OfficialPageState = OfficialPageRow["state"]

/** Le filtre de la liste : les pages actives, ou les autres (sommeil, sommeil échu, retrait). */
export type OfficialPagesStatus = NonNullable<FunctionArgs<typeof api.modules.pages.networkAdmin.officialPages>["status"]>
export const OFFICIAL_PAGES_STATUSES = ["active", "inactive"] as const satisfies readonly OfficialPagesStatus[]

/** Pages demandées par fenêtre (le moteur en rend cinquante au plus). */
export const OFFICIAL_PAGES_PAGE = 20

/** La clé du module qui garde les pages (ADR-0041 du moteur). */
export const PAGES_FEATURE = "pages"

/** La durée d'un sommeil, celle du domaine du moteur. */
export const SLEEP_DAYS = PAGE_SLEEP_DAYS

export const PAGE_NAME_BOUNDS = { max: PAGE_NAME_MAX_LENGTH } as const
export const PAGE_HANDLE_BOUNDS = { min: PAGE_HANDLE_MIN_LENGTH, max: PAGE_HANDLE_MAX_LENGTH } as const

/** Pourquoi une adresse ne convient pas : sa longueur, ou ses caractères. */
export type PageHandleProblem = "length" | "charset"

/**
 * L'adresse que le moteur donnera à la page : celle saisie, sinon celle tirée du nom, repliée par
 * la règle du domaine (`assertPageHandle`). `value` est `null` quand elle ne convient pas ;
 * `fromName` dit qu'aucune adresse n'a été saisie.
 */
export function proposedPageHandle(name: string, handle: string): { readonly value: string | null; readonly fromName: boolean; readonly problem: PageHandleProblem | null } {
  const fromName = handle.trim().length === 0
  const raw = fromName ? name : handle
  try {
    return { value: assertPageHandle(raw), fromName, problem: null }
  } catch (error) {
    if (error instanceof DomainViolation) return { value: null, fromName, problem: error.code === "PAGE_HANDLE_CHARSET" ? "charset" : "length" }
    throw error
  }
}

/** Le nom à citer pour un signataire : son nom publié, sinon son identifiant public, sinon `null` (nom neutre). */
export function signatoryName(signatory: Pick<OfficialPageSignatory, "displayName" | "handle">): string | null {
  if (signatory.displayName) return signatory.displayName
  if (signatory.handle) return `@${signatory.handle}`
  return null
}
