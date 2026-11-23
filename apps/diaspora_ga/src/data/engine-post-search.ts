"use client"

/**
 * DS-11, volet recherche (CH-817) — chercher dans les publications par le moteur (`posts.search`).
 *
 * Le moteur juge chaque candidate par la garde du fil, depuis le réseau diaspora-ga : il ne rend
 * que ce que le lecteur a le droit de lire, une publication de groupe d'autrui jamais, et un refus
 * indistinct. Il rend une fenêtre bornée sans curseur : l'adaptateur en demande une ligne de plus
 * que l'écran n'en montre, pour savoir s'il en reste (`postSearchRequestSize`). Aucune recherche
 * n'est gardée. Réservé aux membres qui lisent le réseau : sinon le refus standard, sans appel.
 */
import { api } from "@convex/_generated/api"
import {
  EMPTY_POST_SEARCH,
  POST_SEARCH_MIN_LENGTH,
  postSearchLimit,
  postSearchRequestSize,
  toPostSearchPage,
  type PostSearchCapability,
  type PostSearchPage,
  type PostSearchQuery,
  type PostView,
} from "@diaspora-ga/features/data"
import { useMemo } from "react"

import { type EngineSourceDeps, failed, LOADING, memberReadError, ready, useEngineMember, useLoaded } from "./engine-kit"
import { toPostView } from "./engine-views"

export function createEnginePostSearch(deps: EngineSourceDeps, hooks: { readonly onPosts?: (posts: readonly PostView[]) => void } = {}): PostSearchCapability {
  // Une lecture réactive seulement : aucune écriture.
  void deps
  return {
    usePostSearch(args): PostSearchQuery {
      const member = useEngineMember()
      const error = memberReadError(member)
      const networkId = member.networkId.state === "ready" ? member.networkId.value : null
      const canRead = error === null && member.auth.isAuthenticated && member.membership.state === "ready" && member.membership.value !== null
      const term = args.query.trim()
      const searching = term.length >= POST_SEARCH_MIN_LENGTH
      const wanted = postSearchLimit(args.limit)
      const loaded = useLoaded(
        api.modules.posts.posts.search,
        canRead && networkId && searching ? { networkId, query: term, limit: postSearchRequestSize(wanted) } : "skip",
      )
      const value = loaded.state === "ready" ? loaded.value : undefined
      const code = loaded.state === "error" ? loaded.code : null
      const page = useMemo((): PostSearchPage | undefined => (value === undefined ? undefined : toPostSearchPage(value.items.map(toPostView), wanted)), [value, wanted])
      // Les publications trouvées alimentent « retirer ma réaction », comme le fil.
      if (page) hooks.onPosts?.(page.items)
      return useMemo((): PostSearchQuery => {
        if (error !== null) return failed<PostSearchPage>(error)
        if (!searching) return ready(EMPTY_POST_SEARCH)
        if (code !== null) return failed<PostSearchPage>(code)
        return page === undefined ? LOADING : ready(page)
      }, [error, searching, code, page])
    },
  }
}
