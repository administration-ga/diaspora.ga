// @vitest-environment node
import { DAY_MS } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { createDemoDataSource } from "./source"
import { demoEntryPrefill } from "./entry-prefill"
import { createDemoSeed, type DemoPerson, type DemoState } from "./state"
import { DemoStore } from "./store"

/**
 * Lot A4 de l'accueil en un écran (décision du 25/11/2026), au fournisseur de démonstration : le
 * pré-remplissage se lit du retour d'IDN SIMULÉ (identités fictives de `/entrer/idn`), comme le
 * moteur le fera du vrai. Nom civil composé « NOM Prénom », identifiants proposés dans l'ordre,
 * disponibilité pour la personne de la session, aucune résidence (IDN ne la connaît pas avant le
 * lot M2). Rien n'est écrit.
 */
const T0 = Date.UTC(2026, 10, 25, 12)

async function awaSignedIn() {
  const store = new DemoStore(null, () => T0, 0)
  await store.signInWithIdn({ firstName: "Awa", lastName: "Ogooué", loa: 2, gaboneseNationality: true })
  return store
}

describe("démonstration — pré-remplissage de l'accueil d'après IDN (lot A4)", () => {
  it("propose le nom civil et les identifiants tirés d'IDN, sans résidence ni donnée consulaire", async () => {
    const store = await awaSignedIn()
    const prefill = demoEntryPrefill(store.getState())
    expect(prefill).toEqual({
      displayName: "OGOOUÉ Awa",
      handles: [
        { handle: "awa", available: true },
        { handle: "ogooue.awa", available: true },
        { handle: "awa.ogooue", available: true },
      ],
      residence: null,
    })
    // Lire ne crée rien : la personne reste sans profil.
    const me = store.getState().session.personId ?? ""
    expect(store.getState().persons[me]?.profile).toBeNull()
  })

  it("un identifiant déjà pris par un autre membre est dit pris, à sa place dans l'ordre", async () => {
    const store = await awaSignedIn()
    const state = store.getState()
    const other: DemoPerson = {
      id: "p-homonyme",
      idn: null,
      local: { kind: "email", value: "homonyme@example.com" },
      profile: { handle: "awa", displayName: "Awa HOMONYME", headline: null },
      administrationLink: false,
      createdAt: T0 - DAY_MS,
      demoAccountKey: null,
    }
    const withOther: DemoState = { ...state, persons: { ...state.persons, [other.id]: other } }
    expect(demoEntryPrefill(withOther)?.handles).toEqual([
      { handle: "awa", available: false },
      { handle: "ogooue.awa", available: true },
      { handle: "awa.ogooue", available: true },
    ])
  })

  it("plusieurs prénoms : chacun est proposé, six identifiants au plus", async () => {
    const store = new DemoStore(null, () => T0, 0)
    await store.signInWithIdn({ firstName: "Jean-Rémy Éloïse Marie Ange Rose", lastName: "Ndong Mba", loa: 2, gaboneseNationality: true })
    const prefill = demoEntryPrefill(store.getState())
    expect(prefill?.displayName).toBe("NDONG MBA Jean-Rémy Éloïse Marie Ange Rose")
    expect(prefill?.handles.map((item) => item.handle)).toEqual(["jeanremy", "ndongmba.jeanremy", "eloise", "marie", "ange", "rose"])
  })

  it("rien à proposer : compte par code, profil déjà né, personne déconnectée", async () => {
    const byCode = new DemoStore(null, () => T0, 0)
    const sent = await byCode.requestCode({ kind: "email", value: "neuve@example.com" })
    if (!sent.ok || sent.value.demoCode === null) throw new Error("code de démonstration attendu")
    await byCode.verifyCode(sent.value.demoCode)
    expect(demoEntryPrefill(byCode.getState())).toBeNull()

    const joined = await awaSignedIn()
    expect(await joined.join({
      facet: { countryOfResidence: "FR", city: "" },
      handle: "awa",
      displayName: "OGOOUÉ Awa",
      consents: { social_profile: true, directory: false, notifications: false },
      directoryVisibility: "hidden",
    })).toMatchObject({ ok: true })
    // Comme le moteur : le pré-remplissage s'efface dès que le profil naît.
    expect(demoEntryPrefill(joined.getState())).toBeNull()

    expect(demoEntryPrefill(createDemoSeed(T0))).toBeNull()
  })

  it("la source de démonstration sert la capacité", async () => {
    const source = createDemoDataSource(await awaSignedIn())
    expect(source.entryPrefill?.useEntryPrefill).toBeTypeOf("function")
  })
})
