// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEnginePostSearch } from "./engine-post-search"
import { createEngineDataSource } from "./engine-source"

/**
 * DS-11 (volet recherche) côté moteur, sans moteur : la lecture réactive jouée par un
 * `useQueries` factice. Les mots et la fenêtre (une publication de plus) partent à
 * `posts.search`, borné par le réseau ; une recherche trop courte ou un compte qui ne lit pas le
 * réseau n'appellent rien ; un refus du moteur se lit comme un code fermé.
 */
type Reference = Parameters<typeof getFunctionName>[0]

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
  read: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth, useAuthenticatedConvexQuery: () => ({}) }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.read(name, queries.value.args)
    return { value: mocks.respond(name, queries.value.args) }
  },
}))

const SEARCH = "modules/posts/posts:search"
const NETWORK = { _id: "network-diaspora" }
const MEMBER = { status: "declaree", capabilities: ["read_network", "publish"] }

const item = (id: string) => ({
  _id: id,
  body: "Publication fictive trouvée",
  audience: "public",
  visibility: "network",
  publishedAt: 1,
  editedAt: null,
  isMine: false,
  author: { personId: "p2", handle: "ada", displayName: "Ada EXEMPLE", badges: [] },
  reactions: { counts: { like: 0, bravo: 0, soutien: 0, instructif: 0 }, total: 0, mine: "bravo" },
  commentCount: 0,
  shareCount: 0,
  media: [],
  share: null,
  page: null,
  reach: "diaspora",
  country: null,
  reason: "public",
  viewer: { bookmarked: false, notifying: false },
})

function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/diaspora/membership:myMembership") return MEMBER
    if (name === SEARCH) return { items: [item("post-1"), item("post-2")] }
    throw new Error(`Unexpected read: ${name}`)
  }
}

const DEPS = { convex: {} as ConvexReactClient, authClient: {} as EngineAuthClient }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  respondWith()
})
afterEach(cleanup)

describe("recherche dans les publications — posts/posts:search", () => {
  it("les mots, sans blancs, et la fenêtre d'une publication de plus partent au moteur, bornés par le réseau ; les publications reviennent", () => {
    const seen = vi.fn()
    const search = createEnginePostSearch(DEPS, { onPosts: seen })
    const { result } = renderHook(() => search.usePostSearch({ query: "  médicaments ", limit: 20 }))
    expect(mocks.read).toHaveBeenCalledWith(SEARCH, { networkId: NETWORK._id, query: "médicaments", limit: 21 })
    expect(result.current).toMatchObject({ status: "ready", data: { hasMore: false, capped: false } })
    expect(result.current.status === "ready" ? result.current.data.items.map((post) => post.id) : []).toEqual(["post-1", "post-2"])
    // Les réactions connues alimentent « retirer ma réaction », comme le fil.
    expect(seen).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "post-1", myReaction: "bravo" })]))
  })

  it("une publication de plus que la fenêtre annonce la suite ; à la borne, la fenêtre ne dépasse pas cinquante", () => {
    respondWith({ [SEARCH]: { items: Array.from({ length: 21 }, (_, index) => item(`post-${index}`)) } })
    const search = createEnginePostSearch(DEPS)
    const { result } = renderHook(() => search.usePostSearch({ query: "annonce", limit: 20 }))
    expect(result.current).toMatchObject({ status: "ready", data: { hasMore: true } })
    expect(result.current.status === "ready" ? result.current.data.items : []).toHaveLength(20)
    renderHook(() => search.usePostSearch({ query: "annonce", limit: 500 }))
    expect(mocks.read).toHaveBeenLastCalledWith(SEARCH, { networkId: NETWORK._id, query: "annonce", limit: 50 })
  })

  it("une recherche trop courte rend une liste vide, sans appel au moteur", () => {
    const search = createEnginePostSearch(DEPS)
    expect(renderHook(() => search.usePostSearch({ query: " a ", limit: 20 })).result.current).toEqual({ status: "ready", data: { items: [], hasMore: false, capped: false } })
    expect(mocks.read).not.toHaveBeenCalledWith(SEARCH, expect.anything())
  })

  it("hors session ou hors adhésion : le refus standard, sans appel au moteur", () => {
    respondWith({ "modules/diaspora/membership:myMembership": null })
    const search = createEnginePostSearch(DEPS)
    expect(renderHook(() => search.usePostSearch({ query: "annonce", limit: 20 })).result.current).toEqual({ status: "error", code: "not_member" })
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(renderHook(() => search.usePostSearch({ query: "annonce", limit: 20 })).result.current).toEqual({ status: "error", code: "not_signed_in" })
    expect(mocks.read).not.toHaveBeenCalledWith(SEARCH, expect.anything())
  })

  it("un refus du moteur se lit comme un code fermé", () => {
    respondWith({ [SEARCH]: new ConvexError({ code: "rateLimited", retryAfterMs: 1000 }) })
    const search = createEnginePostSearch(DEPS)
    expect(renderHook(() => search.usePostSearch({ query: "annonce", limit: 20 })).result.current).toEqual({ status: "error", code: "rate_limited" })
  })

  it("la source du moteur sert la capacité", () => {
    expect(createEngineDataSource(DEPS).postSearch).toBeDefined()
  })
})
