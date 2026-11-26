// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { browserCredentialHash, type BrowserPushSnapshot, type PushBrowser, type PushPermissionState } from "@/lib/web-push"

import { createEngineDeviceNotifications, deviceNotificationsErrorCode, pushRefusalCode, webPushPublicKey } from "./engine-device-notifications"

/**
 * L'adaptateur des notifications de cet appareil (DS-14, volet push) sans moteur ni navigateur :
 * lectures réactives jouées par un `useQueries` factice, écritures contre un client Convex
 * factice, script de fond et service push fabriqués. Personne, réseau et adresses fictifs.
 */
type Reference = Parameters<typeof getFunctionName>[0]

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    return { value: mocks.respond(getFunctionName(queries.value.query), queries.value.args) }
  },
}))

const PERSON = { _id: "person-awa", handle: "awa.recette", displayName: "Awa" }
const NETWORK = { _id: "network-diaspora" }
const ENDPOINT = "https://push.example.test/abonnement-fictif"
const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) }
const CONFIGURED = { applications: [{ applicationId: "diaspora_ga" }], vapidPublicKey: "clefPubliqueFictive0", available: { web: true, expo: false, fcm: false, apns_voip: false, apns: false, digest: false } }
const UNCONFIGURED = { ...CONFIGURED, vapidPublicKey: null, available: { ...CONFIGURED.available, web: false } }
const NO_ROWS: readonly unknown[] = Object.freeze([])

function deviceRow(credentialHash: string, overrides: Record<string, unknown> = {}) {
  return { currentSession: true, subscriptionId: "sub-1", applicationId: "diaspora_ga", deviceId: "appareil-fictif-1", provider: "web", credentialHash, active: true, updatedAt: 1, ...overrides }
}

/** Les lectures réactives : chaque réponse est un objet STABLE (comme le client Convex). */
function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/people/persons:getMyPerson") return PERSON
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/notifications/pushSubscriptions:configuration") return CONFIGURED
    if (name === "modules/notifications/pushSubscriptions:listMine") return NO_ROWS
    throw new Error(`Unexpected read: ${name}`)
  }
}

function fakeBrowser(snapshot: BrowserPushSnapshot, permission: PushPermissionState = "granted") {
  const subscription = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: KEYS }), unsubscribe: vi.fn(async () => true) }
  const pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) }
  const browser = {
    snapshot: vi.fn(async () => snapshot),
    deviceId: vi.fn(() => "appareil-fictif-1"),
    ensureDeviceId: vi.fn(() => "appareil-fictif-1"),
    register: vi.fn(async () => ({ pushManager }) as unknown as ServiceWorkerRegistration),
    requestPermission: vi.fn(async () => permission),
    subscription: vi.fn(async () => subscription as unknown as PushSubscription),
  } satisfies PushBrowser
  return { browser, subscription, pushManager }
}

type Handler = (args: Record<string, unknown>) => unknown

function setup(browser: PushBrowser, handlers: Record<string, Handler> = {}) {
  const calls: { kind: "query" | "mutation"; name: string; args: Record<string, unknown> }[] = []
  const defaults: Record<string, Handler> = {
    "modules/people/persons:getMyPerson": () => PERSON,
    "modules/networks/networks:getBySlug": () => NETWORK,
    "modules/notifications/pushSubscriptions:configuration": () => CONFIGURED,
    "modules/notifications/pushSubscriptions:listMine": () => [],
    "modules/people/consents:recordConsent": () => null,
    "modules/notifications/pushSubscriptions:subscribe": () => ({ subscriptionId: "sub-1" }),
    "modules/notifications/pushSubscriptions:unsubscribe": () => null,
  }
  const call = (kind: "query" | "mutation") => vi.fn(async (reference: Reference, args: Record<string, unknown>) => {
    const name = getFunctionName(reference)
    calls.push({ kind, name, args })
    const handler = handlers[name] ?? defaults[name]
    if (!handler) throw new Error(`Unexpected ${kind}: ${name}`)
    return handler(args)
  })
  const convex = { query: call("query"), mutation: call("mutation") } as unknown as ConvexReactClient
  const capability = createEngineDeviceNotifications({ convex, authClient: {} as EngineAuthClient }, browser)
  return { capability, writes: () => calls.filter((entry) => entry.kind === "mutation") }
}

const READY_BROWSER: BrowserPushSnapshot = { supported: true, permission: "default", hash: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  respondWith()
})
afterEach(cleanup)

async function stateOf(capability: ReturnType<typeof setup>["capability"], personId = PERSON._id) {
  const { result } = renderHook(() => capability.useDevice(personId))
  await waitFor(() => expect(result.current.status).not.toBe("loading"))
  return result.current
}

describe("Notifications de cet appareil — lecture (configuration, listMine, navigateur)", () => {
  it("serveur configuré pour `diaspora_ga`, navigateur capable, non abonné : prêt à activer", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    expect(await stateOf(setup(browser).capability)).toEqual({ status: "ready", data: { state: "off", subscribedHere: false } })
  })

  it("variables absentes, ou `diaspora_ga` absente du registre : indisponible", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    respondWith({ "modules/notifications/pushSubscriptions:configuration": UNCONFIGURED })
    expect(await stateOf(setup(browser).capability)).toMatchObject({ data: { state: "unavailable" } })
    respondWith({ "modules/notifications/pushSubscriptions:configuration": { ...CONFIGURED, applications: [{ applicationId: "antsia_ga" }] } })
    expect(await stateOf(setup(browser).capability)).toMatchObject({ data: { state: "unavailable" } })
  })

  it("navigateur sans notification poussée ; autorisation refusée", async () => {
    expect(await stateOf(setup(fakeBrowser({ supported: false, permission: "default", hash: null }).browser).capability)).toMatchObject({ data: { state: "unsupported" } })
    expect(await stateOf(setup(fakeBrowser({ supported: true, permission: "denied", hash: null }).browser).capability)).toMatchObject({ data: { state: "denied" } })
  })

  it("abonné sur cet appareil et pour cette session : actif, désactivable ; une ligne d'une autre session ne compte pas", async () => {
    const hash = await browserCredentialHash(ENDPOINT)
    const browser = fakeBrowser({ supported: true, permission: "granted", hash }).browser
    const ROWS = Object.freeze([deviceRow(hash)])
    respondWith({ "modules/notifications/pushSubscriptions:listMine": ROWS })
    expect(await stateOf(setup(browser).capability)).toEqual({ status: "ready", data: { state: "on", subscribedHere: true } })
    const STALE = Object.freeze([deviceRow(hash, { currentSession: false })])
    respondWith({ "modules/notifications/pushSubscriptions:listMine": STALE })
    expect(await stateOf(setup(browser).capability)).toEqual({ status: "ready", data: { state: "off", subscribedHere: true } })
  })

  it("la session d'une autre personne : introuvable ; déconnecté : refus de session", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    expect(await stateOf(setup(browser).capability, "person-autre")).toEqual({ status: "error", code: "not_found" })
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(await stateOf(setup(browser).capability)).toEqual({ status: "error", code: "not_signed_in" })
  })
})

describe("Notifications de cet appareil — le geste « Activer »", () => {
  it("serveur non configuré : rien n'est demandé au navigateur, rien n'est écrit", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    const { capability, writes } = setup(browser, { "modules/notifications/pushSubscriptions:configuration": () => UNCONFIGURED })
    expect(await capability.enable(PERSON._id)).toEqual({ ok: false, code: "push_unavailable" })
    expect(browser.requestPermission).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it("navigateur incapable : refus avant toute lecture du serveur", async () => {
    const { browser } = fakeBrowser({ supported: false, permission: "default", hash: null })
    const { capability, writes } = setup(browser)
    expect(await capability.enable(PERSON._id)).toEqual({ ok: false, code: "push_unsupported" })
    expect(browser.register).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it("accordée : l'accord « notifications » du réseau, puis l'abonnement web de `diaspora_ga`", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    const { capability, writes } = setup(browser)
    expect(await capability.enable(PERSON._id)).toEqual({ ok: true, value: null })
    expect(writes().map((entry) => [entry.name, entry.args])).toEqual([
      ["modules/people/consents:recordConsent", { networkId: NETWORK._id, purpose: "notifications", origin: "settings" }],
      ["modules/notifications/pushSubscriptions:subscribe", { networkId: NETWORK._id, applicationId: "diaspora_ga", deviceId: "appareil-fictif-1", credential: { provider: "web", endpoint: ENDPOINT, keys: KEYS } }],
    ])
  })

  it("depuis l'invite de première visite : le même geste, l'accord porte l'origine `prompt`", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    const { capability, writes } = setup(browser)
    expect(await capability.enable(PERSON._id, { origin: "prompt" })).toEqual({ ok: true, value: null })
    expect(writes()[0]).toMatchObject({ name: "modules/people/consents:recordConsent", args: { networkId: NETWORK._id, purpose: "notifications", origin: "prompt" } })
  })

  it("refusée dans le navigateur : aucun accord, aucun abonnement", async () => {
    const { browser } = fakeBrowser(READY_BROWSER, "denied")
    const { capability, writes } = setup(browser)
    expect(await capability.enable(PERSON._id)).toEqual({ ok: false, code: "push_denied" })
    expect(writes()).toEqual([])
  })

  it("adresse de service push refusée par le serveur : indisponible, et la souscription du navigateur est fermée", async () => {
    const { browser, subscription } = fakeBrowser(READY_BROWSER)
    const { capability } = setup(browser, { "modules/notifications/pushSubscriptions:subscribe": () => { throw new ConvexError({ code: "invalidArgument", field: "endpoint" } as never) } })
    expect(await capability.enable(PERSON._id)).toEqual({ ok: false, code: "push_unavailable" })
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("la session d'une autre personne : fermé avant toute écriture", async () => {
    const { browser } = fakeBrowser(READY_BROWSER)
    const { capability, writes } = setup(browser)
    expect(await capability.enable("person-autre")).toEqual({ ok: false, code: "not_found" })
    expect(browser.requestPermission).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })
})

describe("Notifications de cet appareil — le geste « Désactiver »", () => {
  it("retire les seules lignes de cet appareil, puis ferme la souscription du navigateur ; l'accord reste", async () => {
    const hash = await browserCredentialHash(ENDPOINT)
    const { browser, subscription } = fakeBrowser({ supported: true, permission: "granted", hash })
    const { capability, writes } = setup(browser, { "modules/notifications/pushSubscriptions:listMine": () => [deviceRow(hash), deviceRow("ailleurs", { subscriptionId: "sub-2", deviceId: "autre" })] })
    expect(await capability.disable(PERSON._id)).toEqual({ ok: true, value: null })
    expect(writes().map((entry) => [entry.name, entry.args])).toEqual([["modules/notifications/pushSubscriptions:unsubscribe", { networkId: NETWORK._id, subscriptionId: "sub-1" }]])
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe("codes fermés", () => {
  it("clé publique servie seulement si le push web est disponible et `diaspora_ga` déclarée", () => {
    expect(webPushPublicKey(CONFIGURED)).toBe("clefPubliqueFictive0")
    expect(webPushPublicKey(UNCONFIGURED)).toBeNull()
    expect(webPushPublicKey(null)).toBeNull()
  })

  it("issues du navigateur et refus du moteur", () => {
    expect([pushRefusalCode("denied"), pushRefusalCode("unavailable"), pushRefusalCode("unsupported"), pushRefusalCode("cancelled")]).toEqual(["push_denied", "push_unavailable", "push_unsupported", "push_cancelled"])
    expect(deviceNotificationsErrorCode(new ConvexError({ code: "rateLimited" } as never))).toBe("rate_limited")
    expect(deviceNotificationsErrorCode(new ConvexError({ code: "invalidArgument" } as never))).toBe("push_unavailable")
  })
})
