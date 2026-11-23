import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { POST_SEARCH_MAX_RESULTS } from "../data/post-search-port"
import { createDemoDataSource } from "./source"
import { createDemoSeed, type DemoPost, type DemoState } from "./state"
import { DemoStore } from "./store"

/**
 * DS-11 (volet recherche) au fournisseur de démonstration, comme `posts.search` du moteur : les
 * seules publications lisibles, mots repliés, blocage écarté, masquage non, groupe d'autrui
 * jamais, fenêtres bornées. Données fictives seulement.
 */
const NOW = Date.UTC(2026, 10, 20, 12)
const READER = "p-mireille"

function post(id: string, body: string, overrides: Partial<DemoPost> = {}): DemoPost {
  return {
    id, author: { kind: "person", id: "p-steeve" }, body,
    scope: { reach: "diaspora" }, audience: "public", visibility: "network", moderation: "published",
    createdAt: NOW - Number(id.replace(/\D/g, "") || 0) * 1_000, reactions: {}, baseReactions: 0, editedAt: null, ...overrides,
  }
}

function source(posts: readonly DemoPost[], overrides: Partial<DemoState> = {}, personId: string | null = READER) {
  const state: DemoState = { ...createDemoSeed(NOW), posts: [...posts], session: { personId }, ...overrides }
  const store = new DemoStore({ getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }, () => NOW, 0)
  const capability = createDemoDataSource(store).postSearch
  if (!capability) throw new Error("la démonstration doit servir la recherche dans les publications")
  return capability
}

const ids = (result: { current: ReturnType<ReturnType<typeof source>["usePostSearch"]> }) =>
  result.current.status === "ready" ? result.current.data.items.map((item) => item.id) : result.current.status

describe("démonstration — chercher dans les publications (DS-11)", () => {
  it("trouve sans accents ni majuscules, dans le texte et les mots-dièse, des plus récentes aux plus anciennes", () => {
    const search = source([
      post("p1", "Des médicaments à envoyer à Libreville"),
      post("p2", "Rien à voir"),
      post("p3", "Soirée #Culture à Lyon"),
      post("p4", "MÉDICAMENTS disponibles"),
    ])
    expect(ids(renderHook(() => search.usePostSearch({ query: "medicaments", limit: 20 })).result)).toEqual(["p1", "p4"])
    expect(ids(renderHook(() => search.usePostSearch({ query: "#culture", limit: 20 })).result)).toEqual(["p3"])
    expect(ids(renderHook(() => search.usePostSearch({ query: "lyon soiree", limit: 20 })).result)).toEqual(["p3"])
  })

  it("des mots trop courts ne cherchent rien, sans erreur", () => {
    const search = source([post("p1", "a b c")])
    expect(renderHook(() => search.usePostSearch({ query: " a ", limit: 20 })).result.current).toEqual({ status: "ready", data: { items: [], hasMore: false, capped: false } })
  })

  it("seules les publications lisibles : ni le cercle d'autrui, ni le groupe d'autrui, ni un auteur bloqué ; une publication masquée se retrouve", () => {
    const search = source(
      [
        post("p1", "Recette fictive publique"),
        post("p2", "Recette fictive du cercle", { audience: "connections" }),
        post("p3", "Recette fictive du groupe", { audience: "group" }),
        post("p4", "Recette fictive bloquée", { author: { kind: "person", id: "p-nadia" } }),
        post("p5", "Recette fictive masquée"),
      ],
      {
        connections: [],
        blocks: [{ id: "b1", byId: "p-nadia", targetId: READER, createdAt: NOW }],
        marks: [{ personId: READER, postId: "p5", kind: "hidden", createdAt: NOW }],
      },
    )
    expect(ids(renderHook(() => search.usePostSearch({ query: "recette", limit: 20 })).result)).toEqual(["p1", "p5"])
  })

  it("une fenêtre, puis la suivante, jusqu'à la borne où il faut préciser", () => {
    const search = source(Array.from({ length: 60 }, (_, index) => post(`p${index + 1}`, "Annonce fictive")))
    const first = renderHook(() => search.usePostSearch({ query: "annonce", limit: 20 })).result.current
    expect(first).toMatchObject({ status: "ready", data: { hasMore: true, capped: false } })
    expect(first.status === "ready" ? first.data.items : []).toHaveLength(20)
    const last = renderHook(() => search.usePostSearch({ query: "annonce", limit: POST_SEARCH_MAX_RESULTS })).result.current
    expect(last).toMatchObject({ status: "ready", data: { hasMore: false, capped: true } })
    expect(last.status === "ready" ? last.data.items : []).toHaveLength(POST_SEARCH_MAX_RESULTS)
  })

  it("hors session ou hors adhésion : le refus standard", () => {
    expect(renderHook(() => source([], {}, null).usePostSearch({ query: "annonce", limit: 20 })).result.current).toEqual({ status: "error", code: "not_signed_in" })
    const seed = createDemoSeed(NOW)
    const { [READER]: _absent, ...others } = seed.memberships
    void _absent
    expect(renderHook(() => source([], { memberships: others }).usePostSearch({ query: "annonce", limit: 20 })).result.current).toEqual({ status: "error", code: "not_member" })
  })
})
