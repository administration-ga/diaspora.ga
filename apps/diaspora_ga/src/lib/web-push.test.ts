// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import {
  browserCredentialHash,
  currentDeviceSubscriptions,
  type DeviceSubscriptionRow,
  disableWebNotifications,
  enableWebNotifications,
  NOTIFICATION_APPLICATION_ID,
  type PushPermissionState,
  webPushKey,
} from "./web-push"

/**
 * Les gestes du navigateur (DS-14, volet push), sans navigateur : souscription, script de fond et
 * service push fabriqués. Adresses et clés fictives (`example.test`).
 */
const ENDPOINT = "https://push.example.test/abonnement-fictif"
const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) }
const PUBLIC_KEY = "clefPubliqueFictive0"

function fakeSubscription(endpoint = ENDPOINT) {
  return { endpoint, toJSON: () => ({ endpoint, keys: KEYS }), unsubscribe: vi.fn(async () => true) }
}

function fakeRegistration(previous: ReturnType<typeof fakeSubscription> | null, created = fakeSubscription()) {
  const pushManager = { getSubscription: vi.fn(async () => previous), subscribe: vi.fn(async () => created) }
  return { registration: { pushManager } as unknown as ServiceWorkerRegistration, pushManager, created }
}

function operations(permission: PushPermissionState, registration: ServiceWorkerRegistration) {
  const order: string[] = []
  return {
    order,
    ops: {
      register: vi.fn(async () => registration),
      requestPermission: vi.fn(async () => { order.push("permission"); return permission }),
      recordConsent: vi.fn(async () => { order.push("consent") }),
      subscribe: vi.fn(async (input: { applicationId: string; deviceId: string }) => { order.push(`subscribe:${input.applicationId}`); return { subscriptionId: "sub-1" } }),
      unsubscribe: vi.fn(async () => null),
      deviceId: () => "appareil-fictif-1",
      current: () => true,
    },
  }
}

describe("enableWebNotifications — le geste « Activer »", () => {
  it("sans clé publique (serveur non configuré) : rien n'est demandé au navigateur, rien n'est écrit", async () => {
    const { registration } = fakeRegistration(null)
    const { ops } = operations("granted", registration)
    expect(await enableWebNotifications(ops, "")).toEqual({ ok: false, reason: "unavailable" })
    expect(ops.register).not.toHaveBeenCalled()
    expect(ops.requestPermission).not.toHaveBeenCalled()
    expect(ops.recordConsent).not.toHaveBeenCalled()
  })

  it("autorisation refusée ou fermée : aucun accord, aucun abonnement", async () => {
    for (const [permission, reason] of [["denied", "denied"], ["default", "cancelled"]] as const) {
      const { registration, pushManager } = fakeRegistration(null)
      const { ops } = operations(permission, registration)
      expect(await enableWebNotifications(ops, PUBLIC_KEY), permission).toEqual({ ok: false, reason })
      expect(ops.recordConsent).not.toHaveBeenCalled()
      expect(ops.subscribe).not.toHaveBeenCalled()
      expect(pushManager.subscribe).not.toHaveBeenCalled()
    }
  })

  it("accordée : l'autorisation, puis l'accord du réseau, puis l'abonnement de CET appareil pour `diaspora_ga`", async () => {
    const { registration, pushManager } = fakeRegistration(null)
    const { ops, order } = operations("granted", registration)
    const result = await enableWebNotifications(ops, PUBLIC_KEY)
    expect(result).toEqual({ ok: true, credentialHash: await browserCredentialHash(ENDPOINT) })
    expect(order).toEqual(["permission", "consent", `subscribe:${NOTIFICATION_APPLICATION_ID}`])
    expect(NOTIFICATION_APPLICATION_ID).toBe("diaspora_ga")
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: webPushKey(PUBLIC_KEY) })
    expect(ops.subscribe).toHaveBeenCalledWith({ applicationId: "diaspora_ga", deviceId: "appareil-fictif-1", credential: { provider: "web", endpoint: ENDPOINT, keys: KEYS } })
  })

  it("refusée par le serveur : la souscription créée ici est fermée dans le navigateur, l'erreur remonte", async () => {
    const { registration, created } = fakeRegistration(null)
    const { ops } = operations("granted", registration)
    ops.subscribe.mockRejectedValueOnce(new Error("refus du serveur"))
    await expect(enableWebNotifications(ops, PUBLIC_KEY)).rejects.toThrow("refus du serveur")
    expect(created.unsubscribe).toHaveBeenCalledTimes(1)
    expect(ops.unsubscribe).not.toHaveBeenCalled()
  })

  it("une souscription déjà présente est reprise, et jamais fermée par un échec", async () => {
    const previous = fakeSubscription()
    const { registration, pushManager } = fakeRegistration(previous)
    const { ops } = operations("granted", registration)
    ops.subscribe.mockRejectedValueOnce(new Error("refus du serveur"))
    await expect(enableWebNotifications(ops, PUBLIC_KEY)).rejects.toThrow()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(previous.unsubscribe).not.toHaveBeenCalled()
  })

  it("une souscription illisible (adresse non HTTPS) n'est jamais envoyée au serveur", async () => {
    const created = fakeSubscription("http://push.example.test/abonnement-fictif")
    const { registration } = fakeRegistration(null, created)
    const { ops } = operations("granted", registration)
    await expect(enableWebNotifications(ops, PUBLIC_KEY)).rejects.toThrow()
    expect(ops.recordConsent).not.toHaveBeenCalled()
    expect(ops.subscribe).not.toHaveBeenCalled()
    expect(created.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

function row(overrides: Partial<DeviceSubscriptionRow> = {}): DeviceSubscriptionRow {
  return { subscriptionId: "sub-1", applicationId: "diaspora_ga", deviceId: "appareil-fictif-1", provider: "web", credentialHash: "empreinte-1", currentSession: true, active: true, ...overrides }
}

describe("currentDeviceSubscriptions — les lignes de CET appareil, pour DIASPORA.GA", () => {
  it("par l'empreinte du navigateur, sinon par l'identifiant local ; jamais une autre application ni un autre fournisseur", () => {
    const rows = [
      row(),
      row({ subscriptionId: "sub-2", credentialHash: "empreinte-2", deviceId: "autre-appareil" }),
      row({ subscriptionId: "sub-3", applicationId: "antsia_ga" }),
      row({ subscriptionId: "sub-4", provider: "expo" }),
      row({ subscriptionId: "sub-5", active: false }),
    ]
    expect(currentDeviceSubscriptions(rows, "empreinte-1", null).map((item) => item.subscriptionId)).toEqual(["sub-1"])
    expect(currentDeviceSubscriptions(rows, null, "appareil-fictif-1").map((item) => item.subscriptionId)).toEqual(["sub-1"])
    expect(currentDeviceSubscriptions(rows, null, null)).toEqual([])
  })
})

describe("disableWebNotifications — le geste « Désactiver »", () => {
  it("retire les seules lignes de cet appareil, puis ferme la souscription du navigateur", async () => {
    const subscription = fakeSubscription()
    const hash = await browserCredentialHash(ENDPOINT)
    const unsubscribe = vi.fn(async () => null)
    await disableWebNotifications({ subscription: subscription as unknown as PushSubscription, subscriptions: [row({ credentialHash: hash }), row({ subscriptionId: "sub-2", credentialHash: "ailleurs", deviceId: "autre" })], deviceId: null, unsubscribe })
    expect(unsubscribe.mock.calls).toEqual([["sub-1"]])
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("le navigateur se ferme même si le réseau échoue", async () => {
    const subscription = fakeSubscription()
    const hash = await browserCredentialHash(ENDPOINT)
    const unsubscribe = vi.fn(async () => { throw new Error("réseau") })
    await expect(disableWebNotifications({ subscription: subscription as unknown as PushSubscription, subscriptions: [row({ credentialHash: hash })], deviceId: null, unsubscribe })).rejects.toThrow("réseau")
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe("webPushKey", () => {
  it("décode la clé publique base64url en octets", () => {
    expect(Array.from(webPushKey("AQID-_8"))).toEqual([1, 2, 3, 251, 255])
  })
})
