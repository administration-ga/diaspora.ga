// @vitest-environment jsdom
/**
 * AS-03 et AS-08 — le groupe d'une association au moteur : réouverture versionnée, mur au
 * format du fil, épingle relue avec sa garde, publication avec médias.
 */
import type { EngineAuthClient } from "@antsia/api/auth-client"
import type { PublishMediaInput } from "@diasporale/features/data"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineAssociationActivities } from "./engine-association-activities"

interface FakeQuery {
  data: unknown
  isError: boolean
  isSuccess: boolean
  isFetching: boolean
  dataUpdatedAt: number
  error: unknown
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  convexAuth: { isAuthenticated: true, isLoading: false },
  network: { _id: "network-diasporale" } as unknown,
  membership: undefined as unknown,
  queries: new Map<string, unknown>(),
  calls: [] as [string, unknown][],
}))
vi.mock("@antsia/api/hooks", () => ({
  useStableConvexAuth: () => mocks.auth,
  useAuthenticatedConvexQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query)
    mocks.calls.push([name, args])
    if (args === "skip") return { data: undefined, isError: false, isSuccess: false, isFetching: false, dataUpdatedAt: 0, error: null, refetch: vi.fn() }
    return mocks.queries.get(name) ?? { data: undefined, isError: false, isSuccess: false, isFetching: true, dataUpdatedAt: 0, error: null, refetch: vi.fn() }
  },
}))
vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.convexAuth,
  useQueries: (queries: Record<string, { query: Parameters<typeof getFunctionName>[0]; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    if (name === "modules/networks/networks:getBySlug") return { value: mocks.network }
    if (name === "modules/diaspora/membership:myMembership") return { value: mocks.membership }
    return {}
  },
}))

const WALL = "modules/thematicGroups/thematicGroups:groupWall"
const GET_GROUP = "modules/thematicGroups/thematicGroups:getGroup"
const NETWORK = "network-diasporale"
const MEMBER = { status: "declaree", capabilities: ["read_network", "publish"], facet: { countryOfResidence: "FR" } }

/** Une publication du groupe au format du fil, telle que le moteur la rend. */
const POST = {
  _id: "post-groupe-1",
  body: "Les photos de la rencontre de samedi.",
  media: [],
  share: null,
  shareCount: 0,
  audience: "group",
  visibility: "network",
  reach: "diaspora",
  country: null,
  publishedAt: 5,
  isMine: false,
  editedAt: null,
  commentCount: 2,
  page: null,
  author: { personId: "adherente", handle: "adherente", displayName: "Adhérente de recette", badges: [] },
  reactions: { counts: { like: 1, bravo: 0, soutien: 0, instructif: 0 }, total: 1, mine: null },
  viewer: { bookmarked: false, notifying: false },
}

const MEDIA: PublishMediaInput = { upload: { ref: "storage-photo", kind: "image", mimeType: "image/jpeg", sizeBytes: 1024, width: 800, height: 600 } as PublishMediaInput["upload"], altText: " Le buffet de la rencontre " }

function ok(data: unknown, dataUpdatedAt = 1): FakeQuery {
  return { data, isError: false, isSuccess: true, isFetching: false, dataUpdatedAt, error: null, refetch: vi.fn().mockResolvedValue(undefined) }
}
function refused(code: string): FakeQuery {
  return { data: undefined, isError: true, isSuccess: false, isFetching: false, dataUpdatedAt: 0, error: new ConvexError({ code }), refetch: vi.fn().mockResolvedValue(undefined) }
}
function lastArgs(name: string): unknown {
  return [...mocks.calls].reverse().find(([called]) => called === name)?.[1]
}

function setup() {
  const query = vi.fn(async (_ref: unknown, _args: unknown): Promise<unknown> => mocks.network)
  const mutation = vi.fn(async (_ref: unknown, _args: unknown): Promise<unknown> => null)
  const convex = { query, mutation } as unknown as ConvexReactClient
  const onPosts = vi.fn()
  const { groups } = createEngineAssociationActivities({ convex, authClient: {} as EngineAuthClient }, { onPosts })
  if (!groups.wall) throw new Error("Le mur du groupe doit être servi par le moteur")
  return { groups, wall: groups.wall, mutation, onPosts }
}

beforeEach(() => {
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  mocks.convexAuth = { isAuthenticated: true, isLoading: false }
  mocks.network = { _id: NETWORK }
  mocks.membership = { ...MEMBER }
  mocks.queries.clear()
  mocks.calls.length = 0
})
afterEach(cleanup)

describe("groupe d'une association — mur au format du fil (AS-08)", () => {
  it("lit le mur par fenêtres de vingt, reprend le curseur du fil et n'en garde que la publication et sa date", () => {
    mocks.queries.set(WALL, ok({ items: [POST], nextCursor: { publishedAt: 4, postId: "post-groupe-0", strategy: "legacy", postCreationTime: 3 } }))
    const { wall, onPosts } = setup()
    const { result } = renderHook(() => wall.useWall({ groupId: "group-1", cursor: { publishedAt: 9, postId: "post-groupe-9" } }))
    expect(lastArgs(WALL)).toEqual({ networkId: NETWORK, groupId: "group-1", limit: 20, cursor: { publishedAt: 9, postId: "post-groupe-9" } })
    expect(result.current.error).toBeNull()
    expect(result.current.data?.items.map((post) => post.id)).toEqual(["post-groupe-1"])
    expect(result.current.data?.nextCursor).toEqual({ publishedAt: 4, postId: "post-groupe-0" })
    expect(result.current.data?.lacunar).toBe(false)
    // La mémoire des réactions commune au fil reçoit les publications lues.
    expect(onPosts).toHaveBeenCalledWith([expect.objectContaining({ id: "post-groupe-1" })])
  })

  it("rien n'est demandé sans session ni droit de lire ; un refus retire les cartes", () => {
    mocks.convexAuth = { isAuthenticated: false, isLoading: false }
    const { wall } = setup()
    renderHook(() => wall.useWall({ groupId: "group-1", cursor: null }))
    expect(lastArgs(WALL)).toBe("skip")
    mocks.convexAuth = { isAuthenticated: true, isLoading: false }
    mocks.queries.set(WALL, refused("notFound"))
    const { result } = renderHook(() => wall.useWall({ groupId: "group-1", cursor: null }))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBe("not_found")
  })

  it("l'épingle se relit sur la fiche du groupe, avec sa garde ; sans épingle, null", () => {
    mocks.queries.set(GET_GROUP, ok({ groupId: "group-1", name: "Groupe de recette", pinned: POST }))
    const { wall } = setup()
    const pinned = renderHook(() => wall.usePinned("group-1"))
    expect(lastArgs(GET_GROUP)).toEqual({ networkId: NETWORK, groupId: "group-1" })
    expect(pinned.result.current.data).toMatchObject({ id: "post-groupe-1" })
    mocks.queries.set(GET_GROUP, ok({ groupId: "group-1", name: "Groupe de recette", pinned: null }, 2))
    pinned.rerender()
    expect(pinned.result.current.data).toBeNull()
  })
})

describe("groupe d'une association — gestes au moteur (AS-03, AS-08)", () => {
  it("rouvre en citant la fermeture lue, publie avec médias dans le groupe seul, épingle et désépingle", async () => {
    const { groups, wall, mutation } = setup()
    mutation.mockResolvedValueOnce({ state: "active" })
    expect(await groups.reopen({ groupId: "group-1", expectedClosedAt: 42 })).toEqual({ ok: true, value: null })
    mutation.mockResolvedValueOnce({ postId: "post-groupe-2", created: true, moderation: "published" })
    expect(await groups.publish({ groupId: "group-1", body: "Photos de samedi.", idempotencyKey: "cle-media", media: [MEDIA] })).toEqual({ ok: true, value: { postId: "post-groupe-2", created: true } })
    expect(await wall.pin({ groupId: "group-1", postId: "post-groupe-2" })).toEqual({ ok: true, value: null })
    expect(await wall.unpin("group-1")).toEqual({ ok: true, value: null })
    expect(mutation.mock.calls.map(([ref, args]) => [getFunctionName(ref as never), args])).toEqual([
      ["modules/diaspora/associationGroups:reopenGroupForPage", { networkId: NETWORK, groupId: "group-1", expectedClosedAt: 42 }],
      ["modules/posts/posts:publish", {
        networkId: NETWORK, groupId: "group-1", body: "Photos de samedi.", idempotencyKey: "cle-media", audience: "group", reach: "diaspora", alsoOnRoot: false,
        media: [{ storageId: "storage-photo", kind: "image", mimeType: "image/jpeg", sizeBytes: 1024, width: 800, height: 600, altText: "Le buffet de la rencontre" }],
      }],
      ["modules/thematicGroups/thematicGroups:pinGroupPost", { networkId: NETWORK, groupId: "group-1", postId: "post-groupe-2" }],
      ["modules/thematicGroups/thematicGroups:unpinGroupPost", { networkId: NETWORK, groupId: "group-1" }],
    ])
  })

  it("une autre fermeture entre-temps se dit « le groupe a changé » ; un refus garde son code", async () => {
    const { groups, mutation } = setup()
    mutation.mockRejectedValueOnce(new ConvexError({ code: "conflict" }))
    expect(await groups.reopen({ groupId: "group-1", expectedClosedAt: 42 })).toEqual({ ok: false, code: "association_group_changed" })
    mutation.mockRejectedValueOnce(new ConvexError({ code: "notFound" }))
    expect(await groups.reopen({ groupId: "group-1", expectedClosedAt: 42 })).toEqual({ ok: false, code: "not_found" })
  })
})
