import { LEGAL_TEXT_KINDS, LEGAL_TEXTS } from "@diaspora-ga/domain"
import { MEMBER_INFORMATION_ENTRIES, MEMBER_MENU_ENTRIES } from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { INFORMATION_ENTRY_TEXTS, LEGAL_TEXT_ROUTES, legalSectionAnchor, legalSectionFragment, legalSectionHref, legalSummaryAnchor } from "./legal-texts"
import { memberMenuHref } from "./member-menu"
import { anchors, routes } from "./routes"

describe("Les entrées « Informations » du menu et les textes du site (page flottante)", () => {
  it("chaque entrée du groupe a sa ligne : le texte qu'elle ouvre, ou aucun (la charte est une page)", () => {
    expect(Object.keys(INFORMATION_ENTRY_TEXTS)).toEqual([...MEMBER_INFORMATION_ENTRIES])
    expect(INFORMATION_ENTRY_TEXTS.charte).toBeNull()
  })

  it("chaque texte du site est ouvert par une entrée, une seule, celle qui mène à sa page", () => {
    const opened = Object.values(INFORMATION_ENTRY_TEXTS).filter((kind) => kind !== null)
    expect([...opened].sort()).toEqual([...LEGAL_TEXT_KINDS].sort())
    for (const id of MEMBER_INFORMATION_ENTRIES) {
      const kind = INFORMATION_ENTRY_TEXTS[id]
      if (kind === null) continue
      expect(memberMenuHref(MEMBER_MENU_ENTRIES[id], "awa.demo"), id).toBe(LEGAL_TEXT_ROUTES[kind]())
    }
  })
})

describe("L'adresse d'une rubrique et celle du sommaire", () => {
  it("une rubrique : la page du texte, à l'ancre de la rubrique ; une règle : l'adresse que citent les signalements", () => {
    expect(legalSectionHref("privacy", "controller")).toBe(`${routes.privacy()}#${legalSectionAnchor("privacy", "controller")}`)
    expect(legalSectionHref("community", "measures")).toBe(routes.communityRule("measures"))
  })

  it("dans la page publique : l'ancre seule, celle de la rubrique ou du sommaire", () => {
    expect(legalSectionFragment("notice", "intellectualProperty")).toBe("#intellectual-property")
    expect(legalSectionFragment("community", "prohibited")).toBe("#contenus-interdits")
    expect(legalSectionFragment("contact", null)).toBe(anchors.legalSummary)
  })

  it("le sommaire : la page du texte, à l'ancre du sommaire, qu'aucune rubrique ne porte", () => {
    expect(legalSummaryAnchor()).toBe(anchors.legalSummary.slice(1))
    expect(legalSectionHref("terms", null)).toBe(`${routes.terms()}${anchors.legalSummary}`)
    for (const kind of LEGAL_TEXT_KINDS) {
      const sections = LEGAL_TEXTS[kind].sections.map((section) => legalSectionAnchor(kind, section))
      expect(sections, kind).not.toContain(legalSummaryAnchor())
    }
  })
})
