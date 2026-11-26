import { MEMBERS_APP_CODE_SWITCH_STATES } from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { createFormats } from "./create-menu"
import { LIVE_SWITCH } from "./live"
import { routes } from "./routes"

describe("menu « Créer » de la coque", () => {
  it("un membre qui publie, actus servies : une actu, une conférence (direct ouvert par le code), puis les deux inscriptions", () => {
    const formats = createFormats({ canPublish: true, stories: true, status: "verifiee", pages: true })
    expect(formats.map((format) => format.id)).toEqual(["story", "live", "association", "company"])
    expect(formats.map((format) => format.href)).toEqual([routes.newStory(), null, routes.newPage("association"), routes.newPage("company")])
  })

  it("sans actus servies (démonstration), seulement les inscriptions", () => {
    expect(createFormats({ canPublish: true, stories: false, status: "declaree", pages: true }).map((format) => format.id)).toEqual(["association", "company"])
  })

  it("un membre en attente ne publie pas d'actu mais voit l'inscription ; une adhésion suspendue ou quittée, rien", () => {
    expect(createFormats({ canPublish: false, stories: true, status: "en_attente", pages: true }).map((format) => format.id)).toEqual(["association", "company"])
    expect(createFormats({ canPublish: false, stories: true, status: "suspendue", pages: true })).toEqual([])
    expect(createFormats({ canPublish: false, stories: true, status: "partie", pages: true })).toEqual([])
  })

  it("chaque format porte son titre et sa ligne d'aide, en clés de la locale", () => {
    for (const format of createFormats({ canPublish: true, stories: true, status: "verifiee", pages: true })) {
      expect(format.labelKey).toBe(`nav.create.${format.id}`)
      expect(format.hintKey).toBe(`nav.create.${format.id}Hint`)
    }
  })

  it("pages fermées sur le réseau (ADR-0041 du moteur) : ni association ni entreprise, l'actu et la conférence restent", () => {
    expect(createFormats({ canPublish: true, stories: true, status: "verifiee", pages: false }).map((format) => format.id)).toEqual(["story", "live"])
    expect(createFormats({ canPublish: false, stories: true, status: "en_attente", pages: false })).toEqual([])
  })

  describe("la conférence (CH-817), derrière l'interrupteur du direct", () => {
    const LIVE_CLOSED = { ...MEMBERS_APP_CODE_SWITCH_STATES, live: "closed" } as const

    it("ouvert par le code (la position du dépôt depuis le 26/11/2026) : après l'actu, sans adresse (elle ouvre en place la création du direct), avec son titre et sa ligne d'aide", () => {
      expect(LIVE_SWITCH).toBe("open")
      const formats = createFormats({ canPublish: true, stories: true, status: "verifiee", pages: true })
      expect(formats.map((format) => format.id)).toEqual(["story", "live", "association", "company"])
      expect(formats[1]).toEqual({ id: "live", href: null, labelKey: "nav.create.live", hintKey: "nav.create.liveHint" })
    })

    it("ouvert : comme l'actu, seulement pour qui publie avec iCom ouvert (jamais en démonstration)", () => {
      expect(createFormats({ canPublish: false, stories: true, status: "en_attente", pages: true }).map((format) => format.id)).toEqual(["association", "company"])
      expect(createFormats({ canPublish: true, stories: false, status: "declaree", pages: true }).map((format) => format.id)).toEqual(["association", "company"])
    })

    it("refermé par le code : jamais offerte", () => {
      expect(createFormats({ canPublish: true, stories: true, status: "verifiee", pages: true, codeSwitches: LIVE_CLOSED }).map((format) => format.id)).toEqual(["story", "association", "company"])
    })
  })
})
