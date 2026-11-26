import { NETWORK_FEATURES, type NetworkFeature } from "@diaspora-ga/features/data"
import { describe, expect, it } from "vitest"

import { ANNOUNCED_FEATURES, CONSULAR_ATTESTATION_ANNOUNCED, OFFER_CARDS, announcedOfferCards } from "./public-offer"

const ids = (announced?: readonly NetworkFeature[]) => announcedOfferCards(announced).map((card) => card.id)

describe("ce que la page d'entrée annonce (CH-816)", () => {
  it("au lancement : les pages seulement, et aucune vérification consulaire présentée comme disponible", () => {
    expect(ANNOUNCED_FEATURES).toEqual(["pages"])
    expect(CONSULAR_ATTESTATION_ANNOUNCED).toBe(false)
    expect(ids()).toEqual(["country", "people", "pages", "contact"])
  })

  it("sans module annoncé : les trois cartes du socle", () => {
    expect(ids([])).toEqual(["country", "people", "contact"])
  })

  it("avec les pages : quatre cartes, les pages après les personnes", () => {
    expect(ids(["pages"])).toEqual(["country", "people", "pages", "contact"])
  })

  it("avec tous les modules : les dix cartes, dans l'ordre", () => {
    expect(ids(NETWORK_FEATURES)).toEqual([
      "country",
      "people",
      "pages",
      "groupsAndEvents",
      "services",
      "jobs",
      "mutualAid",
      "mentoring",
      "arrivalKit",
      "contact",
    ])
  })

  it("l'ordre d'affichage est celui des cartes, pas celui de la déclaration", () => {
    expect(ids(["arrivalKit", "jobs", "pages"])).toEqual(["country", "people", "pages", "jobs", "arrivalKit", "contact"])
  })

  it("chaque module, sauf les mesures du pilote et la passerelle consulat.ga, a exactement une carte ; le socle a les siennes", () => {
    // Sans carte : la mesure (réservée à l'équipe) et la passerelle (CH-863 : un lien du menu du compte, pas une offre du réseau).
    const WITHOUT_CARD: readonly NetworkFeature[] = ["pilotMetrics", "consulateGateway"]
    for (const feature of NETWORK_FEATURES) {
      const cards = OFFER_CARDS.filter((card) => card.feature === feature)
      expect(cards, feature).toHaveLength(WITHOUT_CARD.includes(feature) ? 0 : 1)
    }
    expect(OFFER_CARDS.filter((card) => card.feature === null).map((card) => card.id)).toEqual(["country", "people", "contact"])
    expect(new Set(OFFER_CARDS.map((card) => card.id)).size).toBe(OFFER_CARDS.length)
  })

  it("les mesures du pilote (réservées à l'équipe) n'ajoutent aucune carte", () => {
    expect(ids(["pages", "pilotMetrics"])).toEqual(ids(["pages"]))
  })

  it("la passerelle consulat.ga (CH-863) n'ajoute aucune carte : la page d'entrée n'annonce pas un lien vers une autre application", () => {
    expect(ids(["pages", "consulateGateway"])).toEqual(ids(["pages"]))
    expect(ids(["consulateGateway"])).toEqual(ids([]))
  })

  it("un module inconnu ou cité deux fois ne change rien", () => {
    const unknown = ["pages", "marketplace"] as unknown as readonly NetworkFeature[]
    expect(ids(unknown)).toEqual(ids(["pages"]))
    expect(ids(["pages", "pages", "jobs", "jobs"])).toEqual(ids(["pages", "jobs"]))
  })
})
