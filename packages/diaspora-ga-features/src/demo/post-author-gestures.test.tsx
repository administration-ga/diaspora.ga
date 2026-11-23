import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ProfilePostsPageRequest } from "../data/types"
import { createDemoDataSource } from "./source"
import { createDemoSeed, type DemoPost, type DemoState } from "./state"
import { DemoStore } from "./store"

/**
 * FD-10 au fournisseur de démonstration, comme le moteur : l'épingle du mur (une seule, en tête de
 * la première page), le retrait d'ANTSIA (la publication reste ici), l'avis des nouveaux
 * commentaires (une bascule privée). Données fictives seulement.
 */
const NOW = Date.UTC(2026, 10, 20, 12)
const AUTHOR = "p-mireille"
const HANDLE = "mireille.ivindo"
const READER = "p-steeve"
const COMMENTER = "p-nadia"

function post(id: string, createdAt: number, overrides: Partial<DemoPost> = {}): DemoPost {
  return {
    id, author: { kind: "person", id: AUTHOR }, body: `Publication fictive ${id}`,
    scope: { reach: "diaspora" }, audience: "public", visibility: "network", moderation: "published",
    createdAt, reactions: {}, baseReactions: 0, editedAt: null, ...overrides,
  }
}

const POSTS = [
  post("recente", NOW - 1_000),
  post("ancienne", NOW - 50_000),
  post("aussi-antsia", NOW - 20_000, { visibility: "root" }),
  post("autrui", NOW - 10_000, { author: { kind: "person", id: READER } }),
]

function setup(personId = AUTHOR, overrides: Partial<DemoState> = {}) {
  const state: DemoState = { ...createDemoSeed(NOW), posts: POSTS, comments: [], notifications: [], session: { personId }, ...overrides }
  const store = new DemoStore({ getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }, () => NOW, 0)
  return { store, source: createDemoDataSource(store) }
}

const wall = (items: readonly { id: string; pinned?: boolean }[] | undefined) => (items ?? []).map((item) => [item.id, item.pinned])

describe("démonstration — épingler sur mon mur (FD-10)", () => {
  it("l'épinglée passe en tête de la première page, marquée, jamais deux fois ; la suivante la remplace ; le retrait rend l'ordre des dates", async () => {
    const { source } = setup()
    const { result } = renderHook(() => source.useProfilePostsPage({ handle: HANDLE }))
    expect(wall(result.current.data?.items)).toEqual([["recente", false], ["aussi-antsia", false], ["ancienne", false]])

    await act(async () => { expect(await source.actions.pinOnMyWall?.("ancienne")).toEqual({ ok: true, value: null }) })
    expect(wall(result.current.data?.items)).toEqual([["ancienne", true], ["recente", false], ["aussi-antsia", false]])

    // Une seule épingle : la nouvelle remplace l'ancienne, qui reste publiée à sa place.
    await act(async () => { await source.actions.pinOnMyWall?.("aussi-antsia") })
    expect(wall(result.current.data?.items)).toEqual([["aussi-antsia", true], ["recente", false], ["ancienne", false]])

    await act(async () => { expect(await source.actions.unpinMyWall?.()).toEqual({ ok: true, value: null }) })
    expect(wall(result.current.data?.items)).toEqual([["recente", false], ["aussi-antsia", false], ["ancienne", false]])
    // Sans épingle, retirer l'épingle ne change rien.
    expect(await source.actions.unpinMyWall?.()).toEqual({ ok: true, value: null })
  })

  it("un lecteur voit l'épinglée de l'auteur en tête de son mur ; une page suivante ne la répète pas", async () => {
    const { store, source } = setup()
    await source.actions.pinOnMyWall?.("ancienne")
    await store.switchTo(READER)
    const { result, rerender } = renderHook((args: ProfilePostsPageRequest) => source.useProfilePostsPage(args), { initialProps: { handle: HANDLE } as ProfilePostsPageRequest })
    expect(wall(result.current.data?.items)[0]).toEqual(["ancienne", true])
    rerender({ handle: HANDLE, cursor: { publishedAt: NOW, postId: "z" } })
    expect(result.current.data?.items.map((item) => item.id)).not.toContain("ancienne")
    expect(result.current.data?.items.every((item) => item.pinned === false)).toBe(true)
  })

  it("ne s'épingle pas : la publication d'autrui, une publication de groupe, une publication en relecture (le même « introuvable »)", async () => {
    const { source } = setup(AUTHOR, {
      posts: [...POSTS, post("groupe", NOW - 5_000, { audience: "group" }), post("relue", NOW - 6_000, { moderation: "pending_review" })],
    })
    for (const id of ["autrui", "groupe", "relue", "inconnue"]) expect(await source.actions.pinOnMyWall?.(id), id).toEqual({ ok: false, code: "not_found" })
  })
})

describe("démonstration — retirer d'ANTSIA (FD-10)", () => {
  it("la publication ne se dit plus « aussi dans ANTSIA » et reste lisible ici ; un second retrait ne change rien", async () => {
    const { source } = setup()
    const { result } = renderHook(() => source.usePost("aussi-antsia"))
    expect(result.current).toMatchObject({ status: "ready", data: { visibility: "root" } })
    await act(async () => { expect(await source.actions.withdrawFromRoot?.("aussi-antsia")).toEqual({ ok: true, value: null }) })
    expect(result.current).toMatchObject({ status: "ready", data: { id: "aussi-antsia", visibility: "network", audience: "public" } })
    expect(await source.actions.withdrawFromRoot?.("aussi-antsia")).toEqual({ ok: true, value: null })
  })

  it("la publication d'autrui ne se retire pas d'ANTSIA", async () => {
    const { source } = setup(AUTHOR, { posts: [...POSTS, post("autrui-antsia", NOW, { author: { kind: "person", id: READER }, visibility: "root" })] })
    expect(await source.actions.withdrawFromRoot?.("autrui-antsia")).toEqual({ ok: false, code: "not_found" })
  })
})

describe("démonstration — suivre les commentaires (FD-10)", () => {
  it("qui suit les commentaires d'une publication est avisé du suivant ; après l'arrêt, plus aucun avis", async () => {
    const { store, source } = setup(READER)
    const { result } = renderHook(() => source.usePost("recente"))
    expect(result.current).toMatchObject({ data: { notifying: false } })
    await act(async () => { expect(await source.actions.toggleCommentNotifications?.("recente")).toEqual({ ok: true, value: { notifying: true } }) })
    expect(result.current).toMatchObject({ data: { notifying: true } })

    await store.switchTo(COMMENTER)
    expect((await source.actions.comment({ postId: "recente", body: "Premier commentaire fictif" })).ok).toBe(true)
    const unread = () => store.getState().notifications.filter((item) => item.recipientId === READER && item.kind === "post_comment" && item.postId === "recente" && item.readAt === null)
    expect(unread()).toHaveLength(1)

    await store.switchTo(READER)
    await source.actions.markAllNotificationsRead()
    await act(async () => { expect(await source.actions.toggleCommentNotifications?.("recente")).toEqual({ ok: true, value: { notifying: false } }) })
    expect(result.current).toMatchObject({ data: { notifying: false } })
    await store.switchTo(COMMENTER)
    await source.actions.comment({ postId: "recente", body: "Second commentaire fictif" })
    expect(unread()).toHaveLength(0)
  })

  it("une publication illisible ne se suit pas (le même « introuvable »)", async () => {
    const { source } = setup(READER, { posts: [...POSTS, post("cercle", NOW, { audience: "connections" })], connections: [] })
    expect(await source.actions.toggleCommentNotifications?.("cercle")).toEqual({ ok: false, code: "not_found" })
  })
})
