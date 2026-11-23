import type { EngineAuthClient } from "@antsia/api/auth-client"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import { createEngineActions } from "./engine-source"
import { toPostView, toWall } from "./engine-views"

/**
 * FD-10 côté moteur, sans moteur : les gestes de l'auteur partent vers les fonctions que le moteur
 * sert déjà (`posts.pinOnMyWall`, `posts.unpinMyWall`, `posts.withdrawFromRoot`, la marque
 * `notify` de `marks.toggleMark`), bornés par le réseau diaspora-ga ; le mur dit quelle
 * publication est l'épinglée, et chaque publication dit si le lecteur suit ses commentaires.
 */
function fakeConvex(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const run = async (reference: unknown, args: Record<string, unknown> = {}) => {
    const name = getFunctionName(reference as never)
    calls.push({ name, args })
    const handler = handlers[name]
    if (!handler) throw new Error(`fonction non prévue par le test : ${name}`)
    return handler(args)
  }
  return { convex: { query: run, mutation: run } as unknown as ConvexReactClient, calls }
}

const NETWORK = { "modules/networks/networks:getBySlug": () => ({ _id: "n-diaspora-ga", slug: "diaspora-ga" }) }
const AUTH = {} as EngineAuthClient

const base = {
  body: "Publication fictive",
  audience: "public",
  visibility: "network",
  publishedAt: 1,
  editedAt: null,
  isMine: true,
  author: { personId: "p1", handle: "ada", displayName: "Ada EXEMPLE", badges: [] },
  reactions: { counts: { like: 0, bravo: 0, soutien: 0, instructif: 0 }, total: 0, mine: null },
  commentCount: 0,
  shareCount: 0,
  media: [],
  share: null,
  page: null,
  reach: "diaspora",
  country: null,
  reason: "own",
}
const item = (id: string, notifying = false) => ({ ...base, _id: id, viewer: { bookmarked: false, notifying } }) as never

describe("gestes de l'auteur par le moteur (FD-10)", () => {
  it("épingler, retirer l'épingle, retirer d'ANTSIA et suivre les commentaires partent vers leurs fonctions, bornés par le réseau", async () => {
    let marked = true
    const { convex, calls } = fakeConvex({
      ...NETWORK,
      "modules/posts/posts:pinOnMyWall": () => ({ pinned: true }),
      "modules/posts/posts:unpinMyWall": () => ({ pinned: false }),
      "modules/posts/posts:withdrawFromRoot": () => ({ withdrawn: true }),
      "modules/marks/marks:toggleMark": () => ({ marked }),
    })
    const actions = createEngineActions({ convex, authClient: AUTH })
    expect(await actions.pinOnMyWall?.("post-1")).toEqual({ ok: true, value: null })
    expect(await actions.unpinMyWall?.()).toEqual({ ok: true, value: null })
    expect(await actions.withdrawFromRoot?.("post-2")).toEqual({ ok: true, value: null })
    expect(await actions.toggleCommentNotifications?.("post-3")).toEqual({ ok: true, value: { notifying: true } })
    marked = false
    expect(await actions.toggleCommentNotifications?.("post-3")).toEqual({ ok: true, value: { notifying: false } })
    expect(calls.slice(1)).toEqual([
      { name: "modules/posts/posts:pinOnMyWall", args: { networkId: "n-diaspora-ga", postId: "post-1" } },
      { name: "modules/posts/posts:unpinMyWall", args: { networkId: "n-diaspora-ga" } },
      { name: "modules/posts/posts:withdrawFromRoot", args: { networkId: "n-diaspora-ga", postId: "post-2" } },
      { name: "modules/marks/marks:toggleMark", args: { networkId: "n-diaspora-ga", postId: "post-3", kind: "notify" } },
      { name: "modules/marks/marks:toggleMark", args: { networkId: "n-diaspora-ga", postId: "post-3", kind: "notify" } },
    ])
  })

  it("un refus du moteur arrive à l'écran par son code fermé (refus indistinct : « introuvable »)", async () => {
    const { convex } = fakeConvex({
      ...NETWORK,
      "modules/posts/posts:pinOnMyWall": () => { throw new ConvexError({ code: "notFound" } as never) },
      "modules/posts/posts:withdrawFromRoot": () => { throw new ConvexError({ code: "rateLimited", retryAfterMs: 1000 } as never) },
    })
    const actions = createEngineActions({ convex, authClient: AUTH })
    expect(await actions.pinOnMyWall?.("post-groupe")).toEqual({ ok: false, code: "not_found" })
    expect(await actions.withdrawFromRoot?.("post-2")).toEqual({ ok: false, code: "rate_limited" })
  })

  it("le mur marque l'épinglée de la première page, et elle seule ; les pages suivantes n'en ont pas", () => {
    const pinned = item("epinglee")
    expect(toWall({ items: [item("a"), pinned], pinned }).map((post) => [post.id, post.pinned])).toEqual([["epinglee", true], ["a", false]])
    expect(toWall({ items: [item("b")], pinned: null }).map((post) => [post.id, post.pinned])).toEqual([["b", false]])
  })

  it("chaque publication dit si le lecteur suit ses commentaires ; le fil ne prétend rien de l'épingle", () => {
    expect(toPostView(item("suivie", true))).toMatchObject({ id: "suivie", notifying: true })
    expect(toPostView(item("libre"))).toMatchObject({ notifying: false })
    expect(toPostView(item("libre")).pinned).toBeUndefined()
  })
})
