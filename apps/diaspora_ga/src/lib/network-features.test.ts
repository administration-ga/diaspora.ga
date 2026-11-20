import { NETWORK_FEATURES } from "@diaspora-ga/features/data"
import { describe, expect, it } from "vitest"

import { featureOfPath, ROUTE_FEATURES } from "./network-features"
import { ROUTE_DESTINATIONS } from "./nav-destinations"
import { routes } from "./routes"

/** ADR-0041 du moteur : chaque adresse relève du socle ou d'une fonctionnalité activable. */
describe("adresses et fonctionnalités du réseau", () => {
  it("complétude : une ligne par adresse de la table des routes, ni plus ni moins", () => {
    expect(Object.keys(ROUTE_FEATURES).sort()).toEqual(Object.keys(routes).sort())
    expect(Object.keys(ROUTE_FEATURES).sort()).toEqual(Object.keys(ROUTE_DESTINATIONS).sort())
  })

  it("chaque fonctionnalité a au moins une adresse ; aucune adresse hors de la coque n'en relève", () => {
    const used = new Set(Object.values(ROUTE_FEATURES).filter((feature) => feature !== null))
    expect(NETWORK_FEATURES.filter((feature) => !used.has(feature))).toEqual([])
    for (const [key, home] of Object.entries(ROUTE_DESTINATIONS)) {
      if (home.kind === "outside") expect(ROUTE_FEATURES[key as keyof typeof ROUTE_FEATURES], key).toBeNull()
    }
  })

  it("le socle reste servi : fil, publication, pays, communautés, personnes, iCom, compte, modération", () => {
    for (const href of [routes.feed(), routes.post("p-1"), routes.notifications(), routes.hub("FR"), routes.communities(), routes.explore(), routes.members(), routes.profile("awa"), routes.relations(), routes.messages(), routes.settings(), routes.moderationDesk(), routes.bookmarks()]) {
      expect(featureOfPath(href), href).toBeNull()
    }
  })

  it("chaque module a ses adresses, sous-adresses comprises ; le gabarit le plus précis l'emporte", () => {
    expect(featureOfPath(routes.pages())).toBe("pages")
    expect(featureOfPath(routes.page("amicale"))).toBe("pages")
    expect(featureOfPath(routes.pageManage("amicale"))).toBe("pages")
    expect(featureOfPath(routes.newPage("association"))).toBe("pages")
    expect(featureOfPath(routes.myActivity())).toBe("pages")
    expect(featureOfPath(routes.activityRequest("r-1"))).toBe("services")
    expect(featureOfPath(routes.associationGroup("amicale"))).toBe("groupsAndEvents")
    expect(featureOfPath(routes.associationEvent("amicale", "e-1"))).toBe("groupsAndEvents")
    expect(featureOfPath(routes.agenda())).toBe("groupsAndEvents")
    expect(featureOfPath(routes.services())).toBe("services")
    expect(featureOfPath(routes.serviceOffer("o-1"))).toBe("services")
    expect(featureOfPath(routes.myServiceRequests())).toBe("services")
    expect(featureOfPath(routes.jobs())).toBe("jobs")
    expect(featureOfPath(routes.jobOffer("j-1"))).toBe("jobs")
    expect(featureOfPath(routes.talents())).toBe("jobs")
    expect(featureOfPath(routes.myApplications())).toBe("jobs")
    expect(featureOfPath(routes.mutualAid())).toBe("mutualAid")
    expect(featureOfPath(routes.mutualAidItem("q-1"))).toBe("mutualAid")
    expect(featureOfPath(routes.mentoring())).toBe("mentoring")
    expect(featureOfPath(routes.myMentoring())).toBe("mentoring")
    expect(featureOfPath(routes.arrivalKit())).toBe("arrivalKit")
    expect(featureOfPath(routes.arrivalKitResource("k-1"))).toBe("arrivalKit")
    expect(featureOfPath(routes.pilotDashboard())).toBe("pilotMetrics")
  })

  it("une adresse inconnue ou hors de la coque ne relève d'aucune fonctionnalité", () => {
    expect(featureOfPath("/inconnue")).toBeNull()
    expect(featureOfPath(routes.legalNotice())).toBeNull()
    expect(featureOfPath(routes.enter())).toBeNull()
  })
})
