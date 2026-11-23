// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineNetworkFeatures } from "./engine-network-features"

/**
 * L'adaptateur des fonctionnalités du réseau sans moteur (ADR-0041 du moteur) : la lecture
 * réactive des modules ouverts, jouée par un `useQueries` factice.
 */
type Reference = Parameters<typeof getFunctionName>[0]

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
  read: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.read(name, queries.value.args)
    return { value: mocks.respond(name, queries.value.args) }
  },
}))

const NETWORK = { _id: "network-diaspora" }
const MEMBERSHIP = { status: "declaree", capabilities: ["read_network", "publish"] }
const OPEN = "modules/networks/features:open"

function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/diaspora/membership:myMembership") return MEMBERSHIP
    if (name === OPEN) return ["pilotMetrics", "pages", "jobs"]
    throw new Error(`Unexpected read: ${name}`)
  }
}

function setup() {
  const convex = {
    query: vi.fn(async (reference: Reference) => (getFunctionName(reference) === "modules/networks/networks:getBySlug" ? NETWORK : null)),
    mutation: vi.fn(async () => {
      throw new Error("aucune écriture depuis le site des membres")
    }),
  } as unknown as ConvexReactClient
  return { features: createEngineNetworkFeatures({ convex, authClient: {} as EngineAuthClient }), convex }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  respondWith()
})
afterEach(cleanup)

describe("fonctionnalités du réseau — clés ouvertes (networks/features:open)", () => {
  it("un membre lit les clés ouvertes de son réseau, dans l'ordre des clés", () => {
    const { features } = setup()
    const { result } = renderHook(() => features.useOpen())
    expect(result.current).toEqual({ status: "ready", data: ["pages", "jobs", "pilotMetrics"] })
    expect(mocks.read).toHaveBeenCalledWith(OPEN, { networkId: NETWORK._id })
  })

  it("hors session ou hors adhésion, rien n'est ouvert, sans appel ; une lecture refusée n'ouvre rien", () => {
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    const { features } = setup()
    expect(renderHook(() => features.useOpen()).result.current).toEqual({ status: "ready", data: [] })
    mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
    respondWith({ "modules/diaspora/membership:myMembership": null })
    expect(renderHook(() => features.useOpen()).result.current).toEqual({ status: "ready", data: [] })
    expect(mocks.read).not.toHaveBeenCalledWith(OPEN, expect.anything())
    respondWith({ [OPEN]: new Error("refusé") })
    expect(renderHook(() => features.useOpen()).result.current).toEqual({ status: "ready", data: [] })
  })

  it("pendant que la session se résout, la lecture attend", () => {
    mocks.auth = { isAuthenticated: false, isPending: true, isUnauthenticated: false }
    const { features } = setup()
    expect(renderHook(() => features.useOpen()).result.current).toEqual({ status: "loading" })
  })
})

describe("fonctionnalités du réseau — aucune décision depuis le site des membres (CH-815, D5)", () => {
  it("l'adaptateur ne sert que la lecture des modules ouverts : ni l'état des huit, ni la bascule", () => {
    const { features, convex } = setup()
    expect(Object.keys(features)).toEqual(["useOpen"])
    renderHook(() => features.useOpen())
    expect(mocks.read).not.toHaveBeenCalledWith("modules/networks/features:settings", expect.anything())
    expect(convex.mutation).not.toHaveBeenCalled()
  })
})
