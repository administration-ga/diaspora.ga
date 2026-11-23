import { DIASPORA_GA_LOCALES } from "@diaspora-ga/features/i18n"
import { MEMBERS_APP_CODE_SWITCH_STATES } from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { conferenceRouteServed, conferenceSessionId, isLiveSwitchOpen, LIVE_SWITCH, LIVE_SWITCH_STATES, liveIsOpen } from "./live"
import { OFFER_CARDS } from "./public-offer"

describe("interrupteur du direct (CH-817) — rien n'est proposé tant que le direct n'est pas prouvé", () => {
  it("est fermé par défaut : le pilote ouvre sans direct, comme sans appels (décision 2 du plan 04)", () => {
    expect(LIVE_SWITCH).toBe("closed")
    expect(liveIsOpen()).toBe(false)
  })

  it("deux positions seulement, et seule « open » ouvre le direct", () => {
    expect(LIVE_SWITCH_STATES).toEqual(["closed", "open"])
    expect(isLiveSwitchOpen("closed")).toBe(false)
    expect(isLiveSwitchOpen("open")).toBe(true)
  })

  it("admin.diaspora.ga dit vrai : l'interrupteur qu'elle montre en lecture seule est celui-ci, une seule valeur", () => {
    expect(MEMBERS_APP_CODE_SWITCH_STATES.live).toBe(LIVE_SWITCH)
  })
})

describe("la page d'un direct — servie seulement interrupteur ouvert ET moteur branché", () => {
  it("fermé (la position du dépôt) : introuvable, moteur ou démonstration", () => {
    expect(conferenceRouteServed("engine")).toBe(false)
    expect(conferenceRouteServed("demo")).toBe(false)
  })

  it("ouvert : servie avec le moteur, jamais par la démonstration de ce navigateur", () => {
    expect(conferenceRouteServed("engine", "open")).toBe(true)
    expect(conferenceRouteServed("demo", "open")).toBe(false)
  })

  it("l'identifiant de la session se décode une fois ; vide ou mal encodé, aucun", () => {
    expect(conferenceSessionId("abc123")).toBe("abc123")
    expect(conferenceSessionId("s%201")).toBe("s 1")
    expect(conferenceSessionId("")).toBeNull()
    expect(conferenceSessionId("%E0%A4%A")).toBeNull()
  })
})

describe("la page d'entrée n'annonce pas le direct", () => {
  const SHOWCASE = ["landing", "meta", "brand"] as const
  const strings = (tree: unknown): string[] => (typeof tree === "string" ? [tree] : typeof tree === "object" && tree !== null ? Object.values(tree).flatMap(strings) : [])

  it("aucune carte de l'offre publique ne porte le direct", () => {
    expect(OFFER_CARDS.map((card) => card.id as string)).not.toContain("live")
  })

  it("aucun texte de vitrine ne parle de direct ni de conférence, en français comme en anglais", () => {
    const words = { fr: /\b(directs?|en direct|conférences?)\b/i, en: /\b(livestreams?|live (streams?|broadcasts?|videos?)|broadcasts?|conferences?)\b/i } as const
    for (const locale of ["fr", "en"] as const) {
      const showcase = SHOWCASE.flatMap((family) => strings(DIASPORA_GA_LOCALES[locale][family]))
      expect(showcase.length, locale).toBeGreaterThan(0)
      expect(showcase.filter((text) => words[locale].test(text)), locale).toEqual([])
    }
  })
})
