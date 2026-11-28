import type { CountryCode } from "@diaspora-ga/domain"
import type { EntryPrefillView, OwnProfileView } from "@diaspora-ga/features/data"
import { describe, expect, it } from "vitest"

import { existingIdentityOf, NO_IDENTITY, welcomeJoinInput, welcomeModel, type ReturningFacet, type WelcomeModelInput } from "./welcome-model"

/**
 * A1 de l'accueil en un écran (décision du 25/11/2026) : le modèle pur de `/bienvenue`. Il dit,
 * d'après le pré-remplissage d'IDN, les pays ouverts, l'identité commune déjà là (EA-04) et
 * l'adhésion partie, ce que l'écran MONTRE en ligne de rappel et ce qu'il DEMANDE en champ, et ce
 * que le clic envoie. Noms, identifiants et villes fictifs.
 */
const OPEN: readonly CountryCode[] = ["FR", "BE"]

function prefill(overrides: Partial<EntryPrefillView> = {}): EntryPrefillView {
  return {
    displayName: "NDONG MBA Jean-Rémy Éloïse",
    handles: [
      { handle: "jeanremy", available: true },
      { handle: "ndongmba.jeanremy", available: true },
    ],
    residence: null,
    ...overrides,
  }
}

function input(overrides: Partial<WelcomeModelInput> = {}): WelcomeModelInput {
  return { prefill: null, openCountries: OPEN, identity: NO_IDENTITY, returning: null, ...overrides }
}

const PROFILE: OwnProfileView = { personId: "p-1", handle: "demo.exterieur", displayName: "Brice MOUNDOUNGA", headline: "Accroche", published: true, private: false }

describe("l'identité — ligne de rappel quand IDN la donne, champs sinon", () => {
  it("pré-remplissage complet : nom et premier identifiant libre, en une ligne de rappel", () => {
    const model = welcomeModel(input({ prefill: prefill() }))
    expect(model.identity).toEqual({ mode: "summary", displayName: "NDONG MBA Jean-Rémy Éloïse", handle: "jeanremy" })
    expect(model.handleCandidates).toEqual(["jeanremy", "ndongmba.jeanremy"])
    expect(model.defaults).toMatchObject({ displayName: "NDONG MBA Jean-Rémy Éloïse", handleChoice: "jeanremy" })
  })

  it("le premier identifiant LIBRE est présélectionné ; un pris ou un hors charte n'est jamais proposé", () => {
    const model = welcomeModel(input({
      prefill: prefill({
        handles: [
          { handle: "jeanremy", available: false },
          { handle: "Jean Rémy", available: true },
          { handle: "ndongmba.jeanremy", available: true },
          { handle: "eloise", available: true },
        ],
      }),
    }))
    expect(model.identity).toEqual({ mode: "summary", displayName: "NDONG MBA Jean-Rémy Éloïse", handle: "ndongmba.jeanremy" })
    expect(model.handleCandidates).toEqual(["ndongmba.jeanremy", "eloise"])
  })

  it("partiel — le nom sans identifiant libre : les champs, le nom déjà posé", () => {
    const model = welcomeModel(input({ prefill: prefill({ handles: [{ handle: "jeanremy", available: false }] }) }))
    expect(model.identity).toEqual({ mode: "fields" })
    expect(model.handleCandidates).toEqual([])
    expect(model.defaults).toMatchObject({ displayName: "NDONG MBA Jean-Rémy Éloïse", handleChoice: "" })
  })

  it("partiel — un identifiant sans nom : les champs, l'identifiant présélectionné", () => {
    const model = welcomeModel(input({ prefill: prefill({ displayName: null }) }))
    expect(model.identity).toEqual({ mode: "fields" })
    expect(model.defaults).toMatchObject({ displayName: "", handleChoice: "jeanremy" })
  })

  it("un nom trop long pour un nom affiché : les champs, le nom posé pour être raccourci", () => {
    const long = `NDONG MBA ${"Jean-Rémy ".repeat(6).trim()}`
    const model = welcomeModel(input({ prefill: prefill({ displayName: long }) }))
    expect(long.length).toBeGreaterThan(60)
    expect(model.identity).toEqual({ mode: "fields" })
    expect(model.defaults.displayName).toBe(long)
  })

  it("aucun pré-remplissage : les champs, vides, aucune proposition choisie d'office", () => {
    const model = welcomeModel(input())
    expect(model.identity).toEqual({ mode: "fields" })
    expect(model.handleCandidates).toEqual([])
    expect(model.defaults).toEqual({ displayName: "", handleChoice: "", country: "", city: "" })
  })

  it("un profil commun déjà là (EA-04) : gardé tel quel, le nom d'IDN n'est pas proposé", () => {
    const published = welcomeModel(input({ prefill: prefill(), identity: existingIdentityOf(PROFILE) }))
    expect(published.identity).toEqual({ mode: "kept", identity: { kind: "published", personId: "p-1", handle: "demo.exterieur", displayName: "Brice MOUNDOUNGA", headline: "Accroche" } })
    expect(published.handleCandidates).toEqual([])
    const withdrawn = welcomeModel(input({ identity: existingIdentityOf({ ...PROFILE, published: false }) }))
    expect(withdrawn.identity).toMatchObject({ mode: "kept", identity: { kind: "withdrawn" } })
    // Un profil sans identifiant ni nom n'est pas une identité : compte neuf.
    expect(existingIdentityOf({ ...PROFILE, handle: null })).toEqual(NO_IDENTITY)
    expect(existingIdentityOf(null)).toEqual(NO_IDENTITY)
  })
})

describe("la résidence — facette d'avant le départ, puis IDN, puis la saisie", () => {
  it("IDN donne un pays ouvert et une ville : ligne de rappel", () => {
    const model = welcomeModel(input({ prefill: prefill({ residence: { country: "FR", city: "Lyon" } }) }))
    expect(model.residence).toEqual({ mode: "summary", source: "idn", country: "FR", city: "Lyon", open: true })
    expect(model.defaults).toMatchObject({ country: "FR", city: "Lyon" })
  })

  it("un pays fermé reste une ligne de rappel, marquée fermée (l'avis `countryNotOpen` s'y affiche)", () => {
    const model = welcomeModel(input({ prefill: prefill({ residence: { country: "ES", city: null } }) }))
    expect(model.residence).toEqual({ mode: "summary", source: "idn", country: "ES", city: "", open: true })
  })

  it("pays ouverts pas encore lus : rien n'est affirmé (ni ouvert ni fermé)", () => {
    const model = welcomeModel(input({ openCountries: null, prefill: prefill({ residence: { country: "ES", city: null } }) }))
    expect(model.residence).toMatchObject({ mode: "summary", open: true })
  })

  it("un pays inconnu ou aucune résidence : les champs, vides", () => {
    for (const residence of [{ country: "ZZ", city: null }, null]) {
      const model = welcomeModel(input({ prefill: prefill({ residence }) }))
      expect(model.residence).toEqual({ mode: "fields" })
      expect(model.defaults).toMatchObject({ country: "", city: "" })
    }
  })

  it("une ville trop longue : les champs, le pays et la ville posés pour être corrigés", () => {
    const city = "L".repeat(81)
    const model = welcomeModel(input({ prefill: prefill({ residence: { country: "FR", city } }) }))
    expect(model.residence).toEqual({ mode: "fields" })
    expect(model.defaults).toMatchObject({ country: "FR", city })
  })

  it("retour après un départ : la facette d'avant l'emporte sur IDN", () => {
    const returning: ReturningFacet = { countryOfResidence: "BE", city: "Bruxelles", arrivedAt: 2015 }
    const model = welcomeModel(input({ returning, prefill: prefill({ residence: { country: "FR", city: "Lyon" } }) }))
    expect(model.residence).toEqual({ mode: "summary", source: "departed", country: "BE", city: "Bruxelles", open: true })
    expect(model.defaults).toMatchObject({ country: "BE", city: "Bruxelles" })
  })
})

describe("le clic — ce qui part, et rien d'autre", () => {
  it("compte neuf : profil public et annuaire réseau, notifications coupées, aucune année d'arrivée", () => {
    const model = welcomeModel(input({ prefill: prefill() }))
    expect(welcomeJoinInput(model, { displayName: "NDONG MBA Jean-Rémy Éloïse", handle: "jeanremy", country: "FR", city: "Lyon" })).toEqual({
      facet: { countryOfResidence: "FR", city: "Lyon" },
      handle: "jeanremy",
      displayName: "NDONG MBA Jean-Rémy Éloïse",
      consents: { social_profile: true, directory: true, notifications: false },
      directoryVisibility: "network",
      guestProfile: true,
    })
  })

  it("un profil gardé (EA-04) n'envoie ni nom ni identifiant", () => {
    const model = welcomeModel(input({ identity: existingIdentityOf(PROFILE) }))
    const sent = welcomeJoinInput(model, { displayName: "", handle: "", country: "FR", city: "" })
    expect(sent).not.toHaveProperty("handle")
    expect(sent).not.toHaveProperty("displayName")
    expect(sent.consents).toEqual({ social_profile: true, directory: true, notifications: false })
  })

  it("retour après un départ : l'année d'arrivée d'avant est gardée dans le même pays, jamais transportée ailleurs", () => {
    const returning: ReturningFacet = { countryOfResidence: "BE", city: "Bruxelles", arrivedAt: 2015 }
    const model = welcomeModel(input({ returning, identity: existingIdentityOf(PROFILE) }))
    expect(welcomeJoinInput(model, { displayName: "", handle: "", country: "BE", city: "Bruxelles" }).facet).toEqual({ countryOfResidence: "BE", city: "Bruxelles", arrivedAt: 2015 })
    expect(welcomeJoinInput(model, { displayName: "", handle: "", country: "FR", city: "Lyon" }).facet).toEqual({ countryOfResidence: "FR", city: "Lyon" })
  })
})
