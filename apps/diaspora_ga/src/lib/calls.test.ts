import { noticeLink, type FeatureRoutes } from "@diaspora-ga/features"
import { MEMBERS_APP_CODE_SWITCH_STATES } from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { CALL_SWITCH_STATES, CALLS_SWITCH, callJournalRoute, callsAreOpen, isCallsSwitchOpen } from "./calls"
import { routes } from "./routes"

describe("interrupteur des appels (IM-01) — rien n'est proposé tant que les appels ne sont pas prouvés", () => {
  it("est fermé par défaut : le pilote ouvre sans appels (décision 2 du plan 04)", () => {
    expect(CALLS_SWITCH).toBe("closed")
    expect(callsAreOpen()).toBe(false)
  })

  it("deux positions seulement, et seule « open » ouvre les appels", () => {
    expect(CALL_SWITCH_STATES).toEqual(["closed", "open"])
    expect(isCallsSwitchOpen("closed")).toBe(false)
    expect(isCallsSwitchOpen("open")).toBe(true)
  })

  it("admin.diaspora.ga dit vrai : l'interrupteur qu'elle montre en lecture seule est celui-ci (CH-815 A5)", () => {
    expect(MEMBERS_APP_CODE_SWITCH_STATES.calls).toBe(CALLS_SWITCH)
  })
})

describe("le journal d'appels comme destination des surfaces (cloche, notification poussée)", () => {
  const base: FeatureRoutes = {
    profile: routes.profile, post: routes.post, page: routes.page, hub: routes.hub, feed: () => routes.feed(),
    sponsor: routes.sponsor, settings: routes.settings, attestation: routes.attestation, enter: routes.enter,
  }
  const missed = { kind: "call_missed", actor: { handle: "awa.demo" }, postId: null } as const

  it("appels fermés (par défaut) : la table n'offre pas le journal, et l'avis d'un appel manqué n'y mène pas", () => {
    expect(callJournalRoute()).toEqual({})
    expect(callJournalRoute(false)).toEqual({})
    expect(noticeLink(missed, { ...base, ...callJournalRoute() })).toBeNull()
  })

  it("appels ouverts : le journal d'appels de la table des routes, sur sa brique", () => {
    expect(callJournalRoute(true).callJournal?.()).toBe(routes.callJournal())
    expect(noticeLink(missed, { ...base, ...callJournalRoute(true) })).toEqual({ href: routes.callJournal(), label: "bell.openCallJournal" })
  })
})
