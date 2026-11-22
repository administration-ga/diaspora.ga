import { DEFAULT_FEED_SCOPE, FEED_SCOPES, type FeedScope } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { FEED_DISCOVERY_OFFERED, OFFERED_FEED_SCOPES, offeredFeedScope, showsFeedDiscovery } from "./feed-presentation"

describe("le fil offert au lancement (CH-816, P2)", () => {
  it("deux onglets — le pays, puis toute la diaspora — et aucune découverte ; le domaine garde ses quatre portées", () => {
    expect(OFFERED_FEED_SCOPES).toEqual(["mon_pays", "diaspora"])
    expect(FEED_DISCOVERY_OFFERED).toBe(false)
    expect(FEED_SCOPES).toEqual(["mon_pays", "diaspora", "recents", "pour_vous"])
    for (const scope of OFFERED_FEED_SCOPES) expect(FEED_SCOPES).toContain(scope)
    expect(OFFERED_FEED_SCOPES).toContain(DEFAULT_FEED_SCOPE)
  })

  it.each([
    ["mon_pays", "mon_pays"],
    ["diaspora", "diaspora"],
    ["recents", "mon_pays"],
    ["pour_vous", "mon_pays"],
  ] as const)("une adresse qui demande « %s » montre « %s »", (requested, shown) => {
    expect(offeredFeedScope(requested)).toBe(shown)
  })

  it("une déclaration élargie ramène les portées retirées, sans autre changement", () => {
    expect(offeredFeedScope("recents", FEED_SCOPES)).toBe("recents")
    expect(offeredFeedScope("pour_vous", FEED_SCOPES)).toBe("pour_vous")
  })

  it("sans la portée par défaut parmi les offertes, la première offerte ; aucune offerte, la portée par défaut", () => {
    const onlyDiaspora: readonly FeedScope[] = ["diaspora"]
    expect(offeredFeedScope("mon_pays", onlyDiaspora)).toBe("diaspora")
    expect(offeredFeedScope("recents", [])).toBe(DEFAULT_FEED_SCOPE)
  })

  it("la découverte ne s'ouvre que demandée ET offerte", () => {
    expect(showsFeedDiscovery(true)).toBe(false)
    expect(showsFeedDiscovery(false)).toBe(false)
    expect(showsFeedDiscovery(true, true)).toBe(true)
    expect(showsFeedDiscovery(false, true)).toBe(false)
  })
})
