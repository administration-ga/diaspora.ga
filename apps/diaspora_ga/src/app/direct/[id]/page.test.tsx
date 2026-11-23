import { isValidElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DataSourceKind } from "@/lib/data-source"
import { conferenceRouteServed } from "@/lib/live"
import { ConferenceScreen } from "@/screens/icom-screens"

import ConferencePage from "./page"

/**
 * CH-817 — la page d'un direct : rien n'y répond tant que l'interrupteur est fermé (la position du
 * dépôt), ni jamais avec la démonstration ; ouverte, elle monte l'écran du moteur sur la session de
 * l'adresse.
 */
const NOT_FOUND = "NEXT_NOT_FOUND"
const mocks = vi.hoisted(() => ({ dataSource: "engine" as DataSourceKind }))

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND)
  },
}))
vi.mock("@/i18n/server", () => ({ getAppT: vi.fn() }))
vi.mock("@/lib/env", () => ({
  publicEnv: {
    get dataSource() {
      return mocks.dataSource
    },
  },
}))
// La vraie règle, interrupteur du dépôt compris ; un test l'ouvre en lui passant « open ».
vi.mock("@/lib/live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live")>()
  return { ...actual, conferenceRouteServed: vi.fn(actual.conferenceRouteServed) }
})
vi.mock("@/screens/icom-screens", () => ({ ConferenceScreen: () => null }))

const served = vi.mocked(conferenceRouteServed)
/** La règle réelle, telle que le module la porte (l'implémentation par défaut de la sonde). */
const realServed: typeof conferenceRouteServed = served.getMockImplementation() ?? (() => false)
const openSwitch = (dataSource: DataSourceKind) => realServed(dataSource, "open")

const page = (id: string) => ConferencePage({ params: Promise.resolve({ id }) })

afterEach(() => {
  mocks.dataSource = "engine"
  served.mockClear()
  served.mockImplementation(realServed)
})

describe("/direct/<id> — servie seulement l'interrupteur du direct ouvert et le moteur branché", () => {
  it.each(["engine", "demo"] as const)("fermé par le code : introuvable (%s)", async (dataSource) => {
    mocks.dataSource = dataSource
    await expect(page("s-1")).rejects.toThrow(NOT_FOUND)
    expect(served).toHaveBeenCalledWith(dataSource)
    expect(served).toHaveLastReturnedWith(false)
  })

  it("ouvert, avec le moteur : l'écran du direct sur la session de l'adresse, décodée une fois", async () => {
    served.mockImplementation(openSwitch)
    const element = await page("s%201")
    expect(isValidElement(element)).toBe(true)
    expect(element.type).toBe(ConferenceScreen)
    expect(element.props).toEqual({ sessionId: "s 1" })
  })

  it("ouvert, mais la démonstration de ce navigateur : introuvable", async () => {
    mocks.dataSource = "demo"
    served.mockImplementation(openSwitch)
    await expect(page("s-1")).rejects.toThrow(NOT_FOUND)
  })

  it("ouvert, identifiant vide ou mal encodé : introuvable", async () => {
    served.mockImplementation(openSwitch)
    await expect(page("")).rejects.toThrow(NOT_FOUND)
    await expect(page("%E0%A4%A")).rejects.toThrow(NOT_FOUND)
  })
})
