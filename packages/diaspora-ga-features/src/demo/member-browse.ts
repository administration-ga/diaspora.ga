/**
 * Démonstration du parcours de l'annuaire (CH-816, lot P3).
 * PROPRIÉTAIRE : ce chantier.
 *
 * Les membres FICTIFS du jeu de démonstration (Mireille IVINDO, Prisca ABANGA,
 * Steeve NGOUNIÉ…, chacun avec son pays, sa ville et son statut), dans ce seul
 * navigateur. Aucun membre n'est ajouté pour le parcours : il lit le même jeu que
 * la recherche, les suggestions et les compteurs des pays, et juge chaque membre
 * comme la tranche du moteur — LA règle de l'annuaire (`listedMemberView`), puis
 * les filtres sur la facette projetée pour le lecteur (`matchesDirectoryBrowse`),
 * la confiance lue à la lecture (`isVerifiedMember`). Des plus récents aux plus
 * anciens, par fenêtres sur un curseur (une position dans la liste).
 */
import {
  clampDirectoryPageSize,
  hasCapability,
  isVerifiedMember,
  matchesDirectoryBrowse,
  parseDirectoryBrowse,
} from "@diaspora-ga/domain"
import { useMemo, useSyncExternalStore } from "react"

import { MEMBER_BROWSE_PAGE_SIZE, type MemberBrowseCapability, type MemberBrowsePage, type MemberBrowseQuery, type MemberBrowseRequest } from "../data/member-browse-port"
import type { MemberHitView } from "../data/types"
import { listedMemberView, statusOf } from "./selectors"
import type { DemoState } from "./state"
import type { DemoStore } from "./store"

const LOADING = { status: "loading" } as const

const NOTHING: MemberBrowsePage = { items: [], continueCursor: null, isDone: true }

/** La position d'une fenêtre : un entier positif ou nul ; `null` pour la première. */
function startOf(cursor: string | null): number | null {
  if (cursor === null) return 0
  const start = Number(cursor)
  return Number.isInteger(start) && start >= 0 ? start : null
}

/**
 * Une fenêtre du parcours pour ce lecteur. Un code pays invalide, une ville illisible ou
 * un curseur étranger rendent une liste vide et close, comme au moteur.
 */
export function memberBrowseView(state: DemoState, viewerId: string, request: MemberBrowseRequest, now: number, pageSize: number = MEMBER_BROWSE_PAGE_SIZE): MemberBrowsePage {
  const filters = parseDirectoryBrowse({ country: request.country, city: request.city ?? null, verifiedOnly: request.verifiedOnly === true }, state.openCountries)
  const start = startOf(request.cursor)
  if (!filters.ok || start === null) return NOTHING
  const size = clampDirectoryPageSize(pageSize)
  const candidates = Object.values(state.memberships).sort((a, b) => b.joinedAt - a.joinedAt || a.personId.localeCompare(b.personId))
  const items: MemberHitView[] = []
  let index = start
  for (; index < candidates.length && items.length < size; index += 1) {
    const personId = candidates[index]!.personId
    const hit = listedMemberView(state, viewerId, personId, now)
    if (!hit) continue
    const verified = isVerifiedMember(statusOf(state, personId, now) ?? "en_attente", hit.badges)
    if (matchesDirectoryBrowse({ projection: hit.facet, verified }, filters.value)) items.push(hit)
  }
  const isDone = index >= candidates.length
  return { items, continueCursor: isDone ? null : String(index), isDone }
}

/** La capacité de démonstration ; `pageSize` (tests seulement) réduit la fenêtre, jamais au-delà de la borne. */
export function createDemoMemberBrowse(store: DemoStore, options: { readonly pageSize?: number } = {}): MemberBrowseCapability {
  const useVersion = () => useSyncExternalStore(store.subscribe, store.getVersion, () => -1)
  const pageSize = options.pageSize ?? MEMBER_BROWSE_PAGE_SIZE
  return {
    useBrowse(args) {
      const version = useVersion()
      const { country, city, verifiedOnly, cursor } = args
      return useMemo((): MemberBrowseQuery => {
        if (version < 0) return LOADING
        const state = store.getState()
        const viewerId = state.session.personId
        if (!viewerId) return { status: "error", code: "not_signed_in" }
        // L’annuaire est lisible dès l’inscription. La visibilité de chaque personne est jugée séparément.
        const status = statusOf(state, viewerId, store.now())
        if (!status || !hasCapability(status, "view_directory")) return { status: "error", code: "status_insufficient" }
        const request: MemberBrowseRequest = { country, cursor, ...(city !== undefined ? { city } : {}), ...(verifiedOnly !== undefined ? { verifiedOnly } : {}) }
        return { status: "ready", data: memberBrowseView(state, viewerId, request, store.now(), pageSize) }
      }, [version, country, city, verifiedOnly, cursor])
    },
  }
}
