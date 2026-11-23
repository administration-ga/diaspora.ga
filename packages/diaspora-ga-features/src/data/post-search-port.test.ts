import { describe, expect, it } from "vitest"

import {
  POST_SEARCH_MAX_RESULTS,
  POST_SEARCH_PAGE_SIZE,
  nextPostSearchLimit,
  postSearchLimit,
  postSearchRequestSize,
  toPostSearchPage,
} from "./post-search-port"
import type { PostView } from "./types"

/** DS-11 (volet recherche) : les fenêtres d'une recherche, bornées comme le moteur. */
const found = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `post-${index}` }) as PostView)

describe("recherche dans les publications — fenêtres bornées", () => {
  it("le nombre voulu reste entre une publication et la borne ; une valeur illisible vaut une fenêtre", () => {
    expect(postSearchLimit(POST_SEARCH_PAGE_SIZE)).toBe(20)
    expect(postSearchLimit(0)).toBe(1)
    expect(postSearchLimit(500)).toBe(POST_SEARCH_MAX_RESULTS)
    expect(postSearchLimit(Number.NaN)).toBe(POST_SEARCH_PAGE_SIZE)
    expect(postSearchLimit(21.7)).toBe(21)
  })

  it("« Voir plus » ajoute une fenêtre, sans jamais passer la borne", () => {
    expect(nextPostSearchLimit(20)).toBe(40)
    expect(nextPostSearchLimit(40)).toBe(POST_SEARCH_MAX_RESULTS)
    expect(nextPostSearchLimit(POST_SEARCH_MAX_RESULTS)).toBe(POST_SEARCH_MAX_RESULTS)
  })

  it("le fournisseur demande une publication de plus pour savoir s'il en reste, sauf à la borne", () => {
    expect(postSearchRequestSize(20)).toBe(21)
    expect(postSearchRequestSize(40)).toBe(41)
    expect(postSearchRequestSize(POST_SEARCH_MAX_RESULTS)).toBe(POST_SEARCH_MAX_RESULTS)
  })

  it("une suite se propose s'il en reste ; à la borne, l'écran demande de préciser", () => {
    expect(toPostSearchPage(found(21), 20)).toMatchObject({ hasMore: true, capped: false })
    expect(toPostSearchPage(found(21), 20).items).toHaveLength(20)
    expect(toPostSearchPage(found(12), 20)).toMatchObject({ hasMore: false, capped: false })
    expect(toPostSearchPage(found(50), 50)).toMatchObject({ hasMore: false, capped: true })
    expect(toPostSearchPage(found(45), 50)).toMatchObject({ hasMore: false, capped: false })
    expect(toPostSearchPage([], 20)).toEqual({ items: [], hasMore: false, capped: false })
  })
})
