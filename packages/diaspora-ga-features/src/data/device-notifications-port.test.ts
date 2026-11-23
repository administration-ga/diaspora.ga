import { describe, expect, it } from "vitest"

import { ACTION_ERROR_CODES } from "./errors"
import { DEVICE_NOTIFICATION_STATES, DEVICE_NOTIFICATIONS_ERROR_CODES, deviceNotificationState, type DeviceNotificationFacts } from "./device-notifications-port"

/** Un appareil prêt : navigateur capable, serveur configuré, autorisation pas encore demandée, non abonné. */
const READY: DeviceNotificationFacts = { supported: true, configured: true, permission: "default", subscribed: false }

describe("deviceNotificationState — ce que l'écran dit de cet appareil (DS-14, volet push)", () => {
  it("un navigateur qui ne reçoit pas de notification poussée l'emporte sur tout le reste", () => {
    expect(deviceNotificationState({ ...READY, supported: false, configured: false, permission: "denied", subscribed: true })).toBe("unsupported")
  })

  it("serveur non configuré (variables ou registre absents) : indisponible, même abonné ou bloqué", () => {
    expect(deviceNotificationState({ ...READY, configured: false })).toBe("unavailable")
    expect(deviceNotificationState({ ...READY, configured: false, permission: "denied", subscribed: true })).toBe("unavailable")
  })

  it("autorisation refusée dans le navigateur : bloqué, même si une ancienne souscription traîne", () => {
    expect(deviceNotificationState({ ...READY, permission: "denied" })).toBe("denied")
    expect(deviceNotificationState({ ...READY, permission: "denied", subscribed: true })).toBe("denied")
  })

  it("prêt : abonné ou non sur cet appareil", () => {
    expect(deviceNotificationState(READY)).toBe("off")
    expect(deviceNotificationState({ ...READY, permission: "granted" })).toBe("off")
    expect(deviceNotificationState({ ...READY, permission: "granted", subscribed: true })).toBe("on")
  })

  it("cinq états fermés, et des refus d'activation qui sont des codes d'action (traduits par `errors.<code>`)", () => {
    expect([...DEVICE_NOTIFICATION_STATES]).toEqual(["unsupported", "unavailable", "denied", "off", "on"])
    for (const code of DEVICE_NOTIFICATIONS_ERROR_CODES) expect(ACTION_ERROR_CODES, code).toContain(code)
  })
})
