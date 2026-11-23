// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import type { Id } from "@convex/_generated/dataModel"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { directoryEntryReturn, memberBrowseReturn } from "./engine-returns.test-utils"
import { createEngineDataSource, createEngineMemberBrowse } from "./engine-source"
import { toMemberBrowsePage } from "./engine-views"

/**
 * L'adaptateur du parcours de l'annuaire (CH-816, lot P3) sans moteur : la lecture réactive
 * jouée par un `useQueries` factice. Une fenêtre par curseur, les cartes de la recherche,
 * le refus standard d'un compte qui ne consulte pas l'annuaire, sans appel.
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

const BROWSE = "modules/diaspora/directory:browseMembers"
const NETWORK = { _id: "network-diaspora" }
const MEMBER = { status: "declaree", capabilities: ["read_network", "publish", "view_directory"] }
const ADA = directoryEntryReturn({ personId: "p-ada" as Id<"persons">, facet: { countryOfResidence: "FR", city: "Lyon" }, badges: ["verified"] })
const FIRST_WINDOW = memberBrowseReturn({ page: [ADA], isDone: false, continueCursor: "v1:42" })

function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/diaspora/membership:myMembership") return MEMBER
    if (name === BROWSE) return FIRST_WINDOW
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

describe("parcours de l'annuaire — diaspora/directory:browseMembers", () => {
  it("une fenêtre : le pays, la ville saisie, « vérifiés seulement » et le curseur passent au moteur ; les cartes de la recherche reviennent", () => {
    const browse = createEngineMemberBrowse(DEPS)
    const { result } = renderHook(() => browse.useBrowse({ country: "FR", city: "  Lyon ", verifiedOnly: true, cursor: null }))
    expect(mocks.read).toHaveBeenCalledWith(BROWSE, { networkId: NETWORK._id, country: "FR", city: "Lyon", verifiedOnly: true, cursor: null })
    expect(result.current).toEqual({
      status: "ready",
      data: {
        items: [{ personId: "p-ada", handle: "ada.exemple", displayName: "Ada EXEMPLE", headline: null, badges: ["verified"], facet: { countryOfResidence: "FR", city: "Lyon" } }],
        continueCursor: "v1:42",
        isDone: false,
      },
    })
  })

  it("sans ville ni filtre, rien de plus n'est envoyé ; la fenêtre suivante suit son curseur", () => {
    const browse = createEngineMemberBrowse(DEPS)
    renderHook(() => browse.useBrowse({ country: "FR", city: "   ", cursor: "v1:42" }))
    expect(mocks.read).toHaveBeenCalledWith(BROWSE, { networkId: NETWORK._id, country: "FR", cursor: "v1:42" })
  })

  it("un compte en attente, hors session ou hors adhésion : le refus standard, sans lecture de l'annuaire", () => {
    respondWith({ "modules/diaspora/membership:myMembership": { status: "en_attente", capabilities: ["read_network"] } })
    const browse = createEngineMemberBrowse(DEPS)
    expect(renderHook(() => browse.useBrowse({ country: "FR", cursor: null })).result.current).toEqual({ status: "error", code: "status_insufficient" })
    respondWith({ "modules/diaspora/membership:myMembership": null })
    expect(renderHook(() => browse.useBrowse({ country: "FR", cursor: null })).result.current).toEqual({ status: "error", code: "not_member" })
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(renderHook(() => browse.useBrowse({ country: "FR", cursor: null })).result.current).toEqual({ status: "error", code: "not_signed_in" })
    expect(mocks.read).not.toHaveBeenCalledWith(BROWSE, expect.anything())
  })

  it("un refus du moteur se lit comme un code fermé", () => {
    respondWith({ [BROWSE]: new ConvexError({ code: "statusInsufficient" }) })
    const browse = createEngineMemberBrowse(DEPS)
    expect(renderHook(() => browse.useBrowse({ country: "FR", cursor: null })).result.current).toEqual({ status: "error", code: "status_insufficient" })
  })

  it("une réponse identique garde la même fenêtre (la chaîne des fenêtres ne se relance pas)", () => {
    const browse = createEngineMemberBrowse(DEPS)
    const { result, rerender } = renderHook(() => browse.useBrowse({ country: "FR", cursor: null }))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it("la fin du parcours : pas de curseur ; une suite sans curseur se lit comme une fin", () => {
    expect(toMemberBrowsePage(memberBrowseReturn())).toEqual({ items: [], continueCursor: null, isDone: true })
    expect(toMemberBrowsePage(memberBrowseReturn({ isDone: false, continueCursor: "" }))).toEqual({ items: [], continueCursor: null, isDone: true })
    // Un pays inconnu dans une carte est écarté, jamais deviné (comme la recherche).
    expect(toMemberBrowsePage(memberBrowseReturn({ page: [directoryEntryReturn({ personId: "p-x" as Id<"persons">, facet: { countryOfResidence: "XX" } })] })).items[0]?.facet).toEqual({})
  })

  it("la source du moteur sert la capacité", () => {
    expect(createEngineDataSource(DEPS).memberBrowse).toBeDefined()
  })
})
