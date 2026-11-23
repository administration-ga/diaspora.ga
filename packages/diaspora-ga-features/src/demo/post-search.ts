/**
 * Démonstration de la recherche dans les publications (DS-11, volet recherche).
 * PROPRIÉTAIRE : ce chantier (CH-817).
 *
 * Les publications FICTIVES du jeu de démonstration, dans ce seul navigateur, jugées comme le
 * moteur (`posts.search`) : chaque candidate passe la garde du fil (`canRead`) ; une publication
 * de groupe d'autrui ne remonte pas ; le blocage écarte, le masquage et la sourdine non (acte de
 * découverte). Les mots sont repliés comme l'index du moteur (accents, casse) ; chacun doit
 * paraître dans le texte ou les mots-dièse. Des plus récentes aux plus anciennes, bornées.
 */
import { extractHashtags } from "@antsia/social-domain/richText"
import { foldDiacritics, foldSearchQuery } from "@antsia/social-domain/searchText"
import { hasCapability } from "@diaspora-ga/domain"
import { useMemo, useSyncExternalStore } from "react"

import {
  EMPTY_POST_SEARCH,
  POST_SEARCH_MIN_LENGTH,
  postSearchRequestSize,
  toPostSearchPage,
  type PostSearchCapability,
  type PostSearchQuery,
} from "../data/post-search-port"
import type { PostView } from "../data/types"
import { blockedBetween, canRead, postView, statusOf } from "./selectors"
import type { DemoPost, DemoState } from "./state"
import type { DemoStore } from "./store"

const LOADING = { status: "loading" } as const

/** Le texte cherché d'une publication : son corps et ses mots-dièse, repliés. */
function searchableText(post: DemoPost): string {
  return foldDiacritics(`${post.body} ${extractHashtags(post.body).join(" ")}`)
}

/**
 * Les publications trouvées pour ce lecteur, au plus `size`. Des mots trop courts ne cherchent
 * rien. Un « # » en tête d'un mot cherche le mot-dièse sans son signe.
 */
export function postSearchView(state: DemoState, viewerId: string, query: string, now: number, size: number): PostView[] {
  const folded = foldSearchQuery(query)
  if (folded.length < POST_SEARCH_MIN_LENGTH) return []
  const words = folded.split(/\s+/).map((word) => word.replace(/^#+/, "")).filter((word) => word.length > 0)
  if (words.length === 0) return []
  return state.posts
    .filter((post) => !(post.audience === "group" && !(post.author.kind === "person" && post.author.id === viewerId)))
    .filter((post) => !(post.author.kind === "person" && post.author.id !== viewerId && blockedBetween(state, viewerId, post.author.id)))
    .filter((post) => canRead(state, post, viewerId, now))
    .filter((post) => {
      const text = searchableText(post)
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, size)
    .map((post) => postView(state, post, viewerId, now))
}

/** La capacité de démonstration : réservée aux membres qui lisent le réseau, comme le moteur. */
export function createDemoPostSearch(store: DemoStore): PostSearchCapability {
  const useVersion = () => useSyncExternalStore(store.subscribe, store.getVersion, () => -1)
  return {
    usePostSearch(args) {
      const version = useVersion()
      const { query, limit } = args
      return useMemo((): PostSearchQuery => {
        if (version < 0) return LOADING
        const state = store.getState()
        const viewerId = state.session.personId
        if (!viewerId) return { status: "error", code: "not_signed_in" }
        const membership = state.memberships[viewerId]
        if (!membership) return { status: "error", code: "not_member" }
        const status = statusOf(state, viewerId, store.now())
        if (status === null || !hasCapability(status, "read_network", { suspensionReadAccess: membership.grounds.suspension?.readAccess ?? "none" })) {
          return { status: "error", code: status === "suspendue" ? "suspended" : "not_member" }
        }
        if (foldSearchQuery(query).length < POST_SEARCH_MIN_LENGTH) return { status: "ready", data: EMPTY_POST_SEARCH }
        return { status: "ready", data: toPostSearchPage(postSearchView(state, viewerId, query, store.now(), postSearchRequestSize(limit)), limit) }
      }, [version, query, limit])
    },
  }
}
