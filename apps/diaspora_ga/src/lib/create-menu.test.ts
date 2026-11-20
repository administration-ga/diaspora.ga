import { describe, expect, it } from "vitest"

import { createFormats } from "./create-menu"
import { routes } from "./routes"

describe("menu « Créer » de la coque", () => {
  it("un membre qui publie, actus servies : une actu, puis les deux inscriptions", () => {
    const formats = createFormats({ canPublish: true, stories: true, status: "verifiee", pages: true })
    expect(formats.map((format) => format.id)).toEqual(["story", "association", "company"])
    expect(formats.map((format) => format.href)).toEqual([routes.newStory(), routes.newPage("association"), routes.newPage("company")])
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

  it("pages fermées sur le réseau (ADR-0041 du moteur) : ni association ni entreprise, l'actu reste", () => {
    expect(createFormats({ canPublish: true, stories: true, status: "verifiee", pages: false }).map((format) => format.id)).toEqual(["story"])
    expect(createFormats({ canPublish: false, stories: true, status: "en_attente", pages: false })).toEqual([])
  })
})
