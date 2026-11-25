// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineEntryPrefill, MY_ENTRY_PREFILL, toEntryPrefillView } from "./engine-entry-prefill"
import { createEngineDataSource } from "./engine-source"

/**
 * Lot A4 de l'accueil en un écran (décision du 25/11/2026) : l'adaptateur du pré-remplissage,
 * sans moteur — la lecture réactive `people/idnPrefill:myEntryPrefill` (lot M1, pas encore sur la
 * branche principale du moteur) jouée par un `useQueries` factice. Noms et identifiants fictifs.
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

const PREFILL = "modules/people/idnPrefill:myEntryPrefill"
const DEPS = { convex: {} as ConvexReactClient, authClient: {} as EngineAuthClient }
const ROW = {
  displayName: "NDONG MBA Jean-Rémy Éloïse",
  handles: [
    { handle: "jeanremy", available: false },
    { handle: "ndongmba.jeanremy", available: true },
  ],
  residence: null,
}
/** Ce que rend le client Convex quand la fonction n'existe pas sur le déploiement (moteur `f152b07e`). */
const MISSING_FUNCTION = new Error(
  `[CONVEX Q(${PREFILL})] [Request ID: 0123456789abcdef] Server Error\nCould not find public function for '${PREFILL}'. Did you forget to run \`npx convex dev\` or \`npx convex deploy\`?\n\n  Called by client`,
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  mocks.respond = (name) => {
    if (name === PREFILL) return ROW
    throw new Error(`Unexpected read: ${name}`)
  }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("pré-remplissage de l'accueil — people/idnPrefill:myEntryPrefill (lot A4)", () => {
  it("la source du moteur sert la capacité, sous le nom de la fonction du lot M1", () => {
    expect(createEngineDataSource(DEPS).entryPrefill?.useEntryPrefill).toBeTypeOf("function")
    expect(getFunctionName(MY_ENTRY_PREFILL)).toBe(PREFILL)
  })

  it("lit sans argument, pour la personne de la session, et rend la proposition telle quelle", () => {
    const { result } = renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill())
    expect(mocks.read).toHaveBeenCalledWith(PREFILL, {})
    expect(result.current).toEqual({ status: "ready", data: ROW })
  })

  it("rien à proposer (`null`) : rendu tel quel", () => {
    mocks.respond = () => null
    const { result } = renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill())
    expect(result.current).toEqual({ status: "ready", data: null })
  })

  it("un moteur sans la fonction (f152b07e) : la saisie ordinaire, sans erreur et sans un mot en console", () => {
    const consoleError = vi.spyOn(console, "error")
    const consoleWarn = vi.spyOn(console, "warn")
    const consoleLog = vi.spyOn(console, "log")
    mocks.respond = () => MISSING_FUNCTION
    const { result } = renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill())
    expect(result.current).toEqual({ status: "ready", data: null })
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleLog).not.toHaveBeenCalled()
  })

  it("tout autre refus ou panne du moteur retombe aussi sur la saisie", () => {
    mocks.respond = () => new Error("[CONVEX Q] Server Error")
    const { result } = renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill())
    expect(result.current).toEqual({ status: "ready", data: null })
  })

  it("attend la réponse, et ne lit rien sans session", () => {
    mocks.respond = () => undefined
    expect(renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill()).result.current).toEqual({ status: "loading" })
    vi.clearAllMocks()
    mocks.auth = { isAuthenticated: false, isPending: true, isUnauthenticated: false }
    expect(renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill()).result.current).toEqual({ status: "loading" })
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(renderHook(() => createEngineEntryPrefill(DEPS).useEntryPrefill()).result.current).toEqual({ status: "ready", data: null })
    expect(mocks.read).not.toHaveBeenCalled()
  })
})

describe("pré-remplissage — lecture défensive de la réponse", () => {
  it("garde six identifiants au plus et écarte les entrées mal formées", () => {
    const handles = Array.from({ length: 8 }, (_, index) => ({ handle: `awa${index}`, available: index % 2 === 0 }))
    expect(toEntryPrefillView({ displayName: "OGOOUÉ Awa", handles: [{ handle: 42, available: true }, { handle: "awa", available: "oui" }, ...handles], residence: null })).toEqual({
      displayName: "OGOOUÉ Awa",
      handles: handles.slice(0, 6),
      residence: null,
    })
  })

  it("la résidence n'est lue que pays ISO et ville ; une forme inconnue n'est pas lue", () => {
    expect(toEntryPrefillView({ displayName: null, handles: [], residence: { country: "FR", city: "Lyon" } })?.residence).toEqual({ country: "FR", city: "Lyon" })
    expect(toEntryPrefillView({ displayName: null, handles: [], residence: { country: "FR", city: null } })?.residence).toEqual({ country: "FR", city: null })
    expect(toEntryPrefillView({ displayName: "A B", handles: [], residence: { country: "France", city: "Lyon" } })?.residence).toBeNull()
    expect(toEntryPrefillView({ displayName: "A B", handles: [], residence: { country: "FR", city: 7, street: "rue" } })?.residence).toEqual({ country: "FR", city: null })
  })

  it("rien d'utilisable : `null`", () => {
    expect(toEntryPrefillView(null)).toBeNull()
    expect(toEntryPrefillView("NDONG")).toBeNull()
    expect(toEntryPrefillView({ displayName: "  ", handles: "awa", residence: 3 })).toBeNull()
  })
})
