import { describe, expect, it } from "vitest"

import { createDemoDeviceNotifications } from "./device-notifications"

describe("démonstration — notifications de cet appareil (DS-14, volet push)", () => {
  it("dit l'appareil indisponible : la démonstration n'envoie rien", () => {
    const capability = createDemoDeviceNotifications()
    expect(capability.useDevice("person_awa")).toEqual({ status: "ready", data: { state: "unavailable", subscribedHere: false } })
  })

  it("aucun geste ne réussit : jamais un « activé » qui ne serait pas vrai", async () => {
    const capability = createDemoDeviceNotifications()
    expect(await capability.enable("person_awa")).toEqual({ ok: false, code: "push_unavailable" })
    expect(await capability.disable("person_awa")).toEqual({ ok: false, code: "push_unavailable" })
    // Rien n'a bougé.
    expect(capability.useDevice("person_awa")).toEqual({ status: "ready", data: { state: "unavailable", subscribedHere: false } })
  })
})
