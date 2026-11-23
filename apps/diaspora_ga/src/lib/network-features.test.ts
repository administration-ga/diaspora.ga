import { featureGateOf, NETWORK_FEATURES, type FeatureGate, type NetworkFeature } from "@diaspora-ga/features/data"
import { MEMBER_MENU_WIDEST_SITUATION, memberMenu } from "@diaspora-ga/features/navigation"
import { describe, expect, it } from "vitest"

import { featureOfPath, featuresUnderDestination, ROUTE_FEATURES } from "./network-features"
import { ROUTE_DESTINATIONS, type RouteKey } from "./nav-destinations"
import { routes } from "./routes"

/** ADR-0041 du moteur : chaque adresse relève du socle ou d'une fonctionnalité activable. */
describe("adresses et fonctionnalités du réseau", () => {
  it("complétude : une ligne par adresse de la table des routes, ni plus ni moins", () => {
    expect(Object.keys(ROUTE_FEATURES).sort()).toEqual(Object.keys(routes).sort())
    expect(Object.keys(ROUTE_FEATURES).sort()).toEqual(Object.keys(ROUTE_DESTINATIONS).sort())
  })

  it("chaque fonctionnalité a au moins une adresse, sauf la mesure du pilote (lue dans l'administration, CH-815 A6) ; aucune adresse hors de la coque n'en relève", () => {
    const used = new Set(Object.values(ROUTE_FEATURES).filter((feature) => feature !== null))
    expect(NETWORK_FEATURES.filter((feature) => !used.has(feature))).toEqual(["pilotMetrics"])
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
    // CH-815 A6 : la mesure du pilote n'a plus d'adresse sur diaspora.ga.
    expect(Object.values(ROUTE_FEATURES)).not.toContain("pilotMetrics")
  })

  it("une adresse inconnue ou hors de la coque ne relève d'aucune fonctionnalité", () => {
    expect(featureOfPath("/inconnue")).toBeNull()
    expect(featureOfPath(routes.legalNotice())).toBeNull()
    expect(featureOfPath(routes.enter())).toBeNull()
  })
})

/** CH-816, lot P1 : « Communautés » n'entre dans la barre qu'avec un module qui s'y range. */
describe("les modules rangés sous une destination, dérivés des deux tables", () => {
  /** Une garde comme l'application la monte : ces seules clés ouvertes, lecture faite. */
  const gate = (open: readonly NetworkFeature[]) => featureGateOf({ openFeatures: open, featuresReady: true })
  /** « Communautés » dans la barre, comme la coque la décide : la garde, puis le menu partagé. */
  const communitiesOffered = (features: FeatureGate) =>
    memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: NETWORK_FEATURES.filter((feature) => features.isOpen(feature)) }).rail.some((entry) => entry.id === "communities")
  const COMMUNITY_FEATURES = featuresUnderDestination("communities")

  it("sous Communautés : groupes et évènements, emploi, entraide, mentorat, kit d'arrivée — ni les pages, ni les services, ni la mesure du pilote", () => {
    expect(COMMUNITY_FEATURES).toEqual(["groupsAndEvents", "jobs", "mutualAid", "mentoring", "arrivalKit"])
  })

  it("suit les tables : un module y figure si et seulement si une de ses adresses se range sous la destination", () => {
    const keys = Object.keys(ROUTE_FEATURES) as RouteKey[]
    for (const destination of ["feed", "explore", "services", "communities", "messages", "myActivity", "moderation"] as const) {
      const expected = NETWORK_FEATURES.filter((feature) =>
        keys.some((key) => {
          const home = ROUTE_DESTINATIONS[key]
          return ROUTE_FEATURES[key] === feature && home.kind === "member" && home.destination === destination
        }),
      )
      expect(featuresUnderDestination(destination), destination).toEqual(expected)
    }
    // Le socle seul ne range aucun module : le fil et la messagerie n'en ont pas.
    expect(featuresUnderDestination("feed")).toEqual([])
    expect(featuresUnderDestination("messages")).toEqual([])
    expect(featuresUnderDestination("services")).toEqual(["services"])
  })

  it.each([
    [[], false],
    [["pages"], false],
    [["pages", "pilotMetrics"], false],
    [["pages", "services"], false],
    [["pages", "services", "groupsAndEvents"], true],
    [["pages", "groupsAndEvents"], true],
    [["pages", "jobs"], true],
    [["mutualAid"], true],
    [["mentoring"], true],
    [["arrivalKit"], true],
    [[...NETWORK_FEATURES], true],
  ] as const)("ouverts %j : Communautés offerte = %s", (open, offered) => {
    expect(communitiesOffered(gate(open))).toBe(offered)
  })

  it("chaque module seul : offerte exactement pour ceux qui se rangent sous Communautés", () => {
    for (const feature of NETWORK_FEATURES) {
      expect(communitiesOffered(gate([feature])), feature).toBe(COMMUNITY_FEATURES.includes(feature))
    }
  })

  it("pendant la lecture des modules, rien n'est affirmé ouvert ; une source non gardée (test d'écran) sert tout", () => {
    expect(communitiesOffered(featureGateOf({ openFeatures: [], featuresReady: false }))).toBe(false)
    expect(communitiesOffered(featureGateOf(null))).toBe(true)
  })
})
