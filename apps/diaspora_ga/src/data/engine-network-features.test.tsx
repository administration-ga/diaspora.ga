// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineNetworkFeatures, networkFeaturesErrorCode } from "./engine-network-features"

/**
 * L'adaptateur des fonctionnalités du réseau sans moteur (ADR-0041 du moteur) : lectures
 * réactives jouées par un `useQueries` factice, écritures contre un client Convex factice.
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
const SETTINGS = "modules/networks/features:settings"

function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/diaspora/membership:myMembership") return MEMBERSHIP
    if (name === OPEN) return ["pilotMetrics", "pages", "jobs"]
    throw new Error(`Unexpected read: ${name}`)
  }
}

function setup(mutation: (name: string, args: Record<string, unknown>) => unknown = () => ({ changed: true })) {
  const writes: { name: string; args: Record<string, unknown> }[] = []
  const convex = {
    query: vi.fn(async (reference: Reference) => (getFunctionName(reference) === "modules/networks/networks:getBySlug" ? NETWORK : null)),
    mutation: vi.fn(async (reference: Reference, args: Record<string, unknown>) => {
      const name = getFunctionName(reference)
      writes.push({ name, args })
      return mutation(name, args)
    }),
  } as unknown as ConvexReactClient
  return { features: createEngineNetworkFeatures({ convex, authClient: {} as EngineAuthClient }), writes }
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

describe("fonctionnalités du réseau — réglages de l'administration", () => {
  it("l'administration lit l'état des huit ; tout autre membre reçoit le refus indistinct", () => {
    const rows = [{ feature: "pages", enabled: true, open: true, requires: null, updatedAt: 1 }]
    respondWith({ [SETTINGS]: rows })
    const { features } = setup()
    expect(renderHook(() => features.useSettings()).result.current).toEqual({ status: "ready", data: rows })
    respondWith({ [SETTINGS]: new ConvexError({ code: "notFound" }) })
    expect(renderHook(() => features.useSettings()).result.current).toEqual({ status: "error", code: "not_found" })
  })

  it("la bascule passe le réseau, la clé, l'état et le motif nettoyé ; ses refus ont leur code", async () => {
    const { features, writes } = setup()
    expect(await features.setFeature({ feature: "jobs", enabled: true, reason: "  Ouverture de l'emploi pour le pilote.  " })).toEqual({ ok: true, value: { changed: true } })
    expect(writes).toEqual([{ name: "modules/networks/features:setFeature", args: { networkId: NETWORK._id, feature: "jobs", enabled: true, reason: "Ouverture de l'emploi pour le pilote." } }])
    const refused = setup(() => { throw new ConvexError({ code: "invalidArgument", rule: "NETWORK_FEATURE_REQUIRES_PARENT" }) })
    expect(await refused.features.setFeature({ feature: "jobs", enabled: true, reason: "Ouverture de l'emploi pour le pilote." })).toEqual({ ok: false, code: "network_feature_requires_parent" })
    expect(networkFeaturesErrorCode(new ConvexError({ code: "invalidArgument", rule: "NETWORK_FEATURE_HAS_OPEN_CHILDREN" }))).toBe("network_feature_has_open_children")
    expect(networkFeaturesErrorCode(new ConvexError({ code: "invalidArgument", rule: "DECISION_REASON_LENGTH", params: { min: 10, max: 500 } }))).toBe("network_feature_reason_length")
    expect(networkFeaturesErrorCode(new ConvexError({ code: "notFound" }))).toBe("not_found")
  })
})
