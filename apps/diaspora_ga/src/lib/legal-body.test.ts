import { describe, expect, it } from "vitest"

import { legalBodyLines, parseLegalBody } from "./legal-body"

describe("corps d'une rubrique lu en blocs (LX-05)", () => {
  it("une phrase seule reste un paragraphe", () => {
    expect(parseLegalBody("Une seule phrase.")).toEqual([{ kind: "paragraph", text: "Une seule phrase." }])
  })

  it("une ligne vide sépare deux paragraphes", () => {
    expect(parseLegalBody("Premier.\n\nSecond.")).toEqual([
      { kind: "paragraph", text: "Premier." },
      { kind: "paragraph", text: "Second." },
    ])
  })

  it("un bloc dont chaque ligne commence par un tiret est une liste", () => {
    expect(parseLegalBody("Vous pouvez :\n\n– exporter vos données ;\n– effacer votre compte.\n\nFin.")).toEqual([
      { kind: "paragraph", text: "Vous pouvez :" },
      { kind: "list", items: ["exporter vos données ;", "effacer votre compte."] },
      { kind: "paragraph", text: "Fin." },
    ])
  })

  it("un tiret au milieu d'un paragraphe n'en fait pas une liste", () => {
    expect(parseLegalBody("Le réseau – fermé – est gratuit.\nIl le reste.")).toEqual([{ kind: "paragraph", text: "Le réseau – fermé – est gratuit. Il le reste." }])
  })

  it("ignore les lignes vides en trop et les espaces de bord", () => {
    expect(parseLegalBody("\n\n  Premier.  \n\n\n\n - un\n - deux\n\n")).toEqual([
      { kind: "paragraph", text: "Premier." },
      { kind: "list", items: ["un", "deux"] },
    ])
  })

  it("rend les lignes lues à l'écran, sans les marques de liste", () => {
    expect(legalBodyLines("Titre :\n\n– un ;\n– deux.")).toEqual(["Titre :", "un ;", "deux."])
  })
})
