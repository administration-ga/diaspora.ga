import { readFileSync } from "node:fs"

import { describe, expect, it } from "bun:test"

import { LIGHT_ACCOUNT_GROUNDS, type MembershipGrounds } from "./eligibility"
import {
  DIASPORA_GA_FACET_SCHEMA,
  DIASPORA_GA_NETWORK_SEED,
  DIASPORA_GA_SLICE,
  ENGINE_COMMENT_MAX_LENGTH,
  ENGINE_FACET_FIELD_KINDS,
  ENGINE_FACET_VISIBILITIES,
  ENGINE_NETWORK_FEATURES,
  ENGINE_POST_MAX_LENGTH,
  ENGINE_REACTION_KINDS,
  engineVerificationSource,
  facetFromEngine,
  GABONESE_NATIONALITY_CODES,
  idnGroundFromLink,
  toEngineFacet,
  toEngineFacetVisibility,
} from "./engine"
import { DEFAULT_FACET_VISIBILITY, FACET_FIELDS, type DiasporaFacet } from "./facet"

/**
 * Le domaine du moteur voisin (DIASPORA.GA vit à côté d'ANTSIA), relu comme TEXTE :
 * aucun module du moteur n'est chargé, le domaine reste sans dépendance et sa
 * couverture ne compte que ses propres fichiers.
 */
const ENGINE_DOMAIN = new URL("../../../../ANTSIA/packages/social-domain/src/", import.meta.url)

function engineSource(file: string): string {
  return readFileSync(new URL(file, ENGINE_DOMAIN), "utf8")
}

/** Les chaînes d'une liste `export const NOM = [ … ] as const`, ou `null` si elle n'y est pas. */
function declaredList(source: string, name: string): string[] | null {
  const found = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(source)
  return found ? [...(found[1] ?? "").matchAll(/"([A-Za-z_]+)"/g)].map((match) => match[1] ?? "") : null
}

/** La valeur d'une constante numérique `export const NOM = 123`, ou `null`. */
function declaredNumber(source: string, name: string): number | null {
  const found = new RegExp(`export const ${name} = (\\d+)\\b`).exec(source)
  return found ? Number(found[1]) : null
}

describe("miroirs des listes du moteur (le domaine ne dépend de rien)", () => {
  it("les modules activables d'un réseau sont ceux du moteur, dans le même ordre", () => {
    expect(declaredList(engineSource("networkFeatures.ts"), "NETWORK_FEATURES")).toEqual([...ENGINE_NETWORK_FEATURES])
  })

  it("les réactions et les longueurs des publications et des commentaires sont celles du moteur", () => {
    const content = engineSource("content.ts")
    expect(declaredList(content, "PERSONAL_REACTION_KINDS")).toEqual([...ENGINE_REACTION_KINDS])
    expect(declaredNumber(content, "PERSONAL_POST_MAX_LENGTH")).toBe(ENGINE_POST_MAX_LENGTH)
    expect(declaredNumber(content, "PERSONAL_COMMENT_MAX_LENGTH")).toBe(ENGINE_COMMENT_MAX_LENGTH)
  })

  it("test du test : la lecture voit une liste et un nombre, et rend `null` sans déclaration", () => {
    expect(declaredList('export const A = ["x", "y_z"] as const', "A")).toEqual(["x", "y_z"])
    expect(declaredList("export const B = 1", "A")).toBeNull()
    expect(declaredNumber("export const N = 2000", "N")).toBe(2000)
    expect(declaredNumber("export const M = 1", "N")).toBeNull()
  })
})

describe("projection des visibilités vers le moteur", () => {
  it("seul « tout le réseau » reste lisible par le moteur générique ; jamais la racine", () => {
    expect(toEngineFacetVisibility("network")).toBe("network")
    expect(toEngineFacetVisibility("country")).toBe("hidden")
    expect(toEngineFacetVisibility("connections")).toBe("hidden")
    expect(toEngineFacetVisibility("only_me")).toBe("hidden")
  })
})

describe("facette diaspora au format du moteur", () => {
  it("couvre chaque champ du domaine, dans l'ordre, avec des types et visibilités connus du moteur", () => {
    expect(DIASPORA_GA_FACET_SCHEMA.fields.map((field) => field.key)).toEqual([...FACET_FIELDS])
    for (const field of DIASPORA_GA_FACET_SCHEMA.fields) {
      expect(ENGINE_FACET_FIELD_KINDS).toContain(field.kind)
      expect(ENGINE_FACET_VISIBILITIES).toContain(field.defaultVisibility)
      expect(field.defaultVisibility).toBe(toEngineFacetVisibility(DEFAULT_FACET_VISIBILITY[field.key]))
    }
  })

  it("le pays de résidence est obligatoire et ne peut pas être le Gabon", () => {
    const country = DIASPORA_GA_FACET_SCHEMA.fields.find((field) => field.key === "countryOfResidence")
    expect(country).toMatchObject({ kind: "country", required: true, excludedValues: ["GA"] })
    expect(DIASPORA_GA_FACET_SCHEMA.fields.filter((field) => field.required).map((field) => field.key)).toEqual(["countryOfResidence"])
  })
})

describe("graine du réseau diaspora-ga", () => {
  it("réseau fermé, enfant d'ANTSIA, politique déclaré-ou-vérifié, visibilité réseau, France ouverte", () => {
    expect(DIASPORA_GA_NETWORK_SEED).toMatchObject({
      slug: "diaspora-ga",
      kind: "closed",
      parentSlug: "antsia",
      membershipPolicy: "declared_or_verified",
      defaultVisibility: "network",
      reachValues: ["local", "diaspora"],
      openCountries: ["FR"],
      theme: "diaspora-ga",
    })
    expect(DIASPORA_GA_NETWORK_SEED.facetSchema).toBe(DIASPORA_GA_FACET_SCHEMA)
  })
})

describe("toEngineFacet", () => {
  const minimal: DiasporaFacet = {
    countryOfResidence: "FR",
    associationIds: [],
    helpAvailable: false,
    visibility: DEFAULT_FACET_VISIBILITY,
  }

  it("omet les champs vides et projette les visibilités", () => {
    expect(toEngineFacet(minimal)).toEqual({
      values: { countryOfResidence: "FR", helpAvailable: false },
      visibilities: {
        countryOfResidence: "network",
        city: "hidden",
        postSlug: "hidden",
        associationIds: "hidden",
        arrivedAt: "hidden",
        helpAvailable: "network",
      },
    })
  })

  it("recopie chaque champ renseigné", () => {
    const full: DiasporaFacet = {
      ...minimal,
      city: "Lyon",
      postSlug: "consulat-general-paris",
      associationIds: ["asso-1", "asso-2"],
      arrivedAt: 2016,
      helpAvailable: true,
      visibility: { ...DEFAULT_FACET_VISIBILITY, city: "network" },
    }
    const engine = toEngineFacet(full)
    expect(engine.values).toEqual({
      countryOfResidence: "FR",
      city: "Lyon",
      postSlug: "consulat-general-paris",
      associationIds: ["asso-1", "asso-2"],
      arrivedAt: 2016,
      helpAvailable: true,
    })
    expect(engine.visibilities.city).toBe("network")
    // Copie défensive : le moteur ne reçoit jamais la référence du domaine.
    expect(engine.values.associationIds).not.toBe(full.associationIds)
  })
})

describe("la tranche qui gouverne le réseau", () => {
  it("porte un nom stable, celui du dossier convex/modules/diaspora", () => {
    expect(DIASPORA_GA_SLICE).toBe("diaspora")
  })
})

describe("idnGroundFromLink — le lien IDN du moteur lu comme fait du domaine", () => {
  it("garde le niveau de garantie et lit la nationalité gabonaise (alpha-2 ou alpha-3, casse indifférente)", () => {
    expect(GABONESE_NATIONALITY_CODES).toEqual(["GA", "GAB"])
    expect(idnGroundFromLink({ loa: 2, nationality: "GA" })).toEqual({ loa: 2, gaboneseNationality: true })
    expect(idnGroundFromLink({ loa: 3, nationality: " gab " })).toEqual({ loa: 3, gaboneseNationality: true })
  })

  it("une nationalité étrangère exclut ; une nationalité absente reste inconnue", () => {
    expect(idnGroundFromLink({ loa: 3, nationality: "FR" }).gaboneseNationality).toBe(false)
    expect(idnGroundFromLink({ loa: 3 }).gaboneseNationality).toBeNull()
    expect(idnGroundFromLink({ loa: 3, nationality: "  " }).gaboneseNationality).toBeNull()
  })

  it("un niveau absent ou hors bornes vaut le plus bas : le doute ne vérifie pas", () => {
    expect(idnGroundFromLink({}).loa).toBe(0)
    expect(idnGroundFromLink({ loa: 7 }).loa).toBe(0)
    expect(idnGroundFromLink({ loa: -1 }).loa).toBe(0)
    expect(idnGroundFromLink({ loa: 2.5 }).loa).toBe(0)
    expect(idnGroundFromLink({ loa: 4 }).loa).toBe(4)
  })
})

describe("engineVerificationSource — qui a vérifié, au vocabulaire du moteur", () => {
  const NOW = Date.UTC(2026, 9, 15)
  const idn = (loa: number): MembershipGrounds["idn"] => ({ loa, gaboneseNationality: true })

  it("l'attestation consulaire d'abord", () => {
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, consularAttestation: true }, NOW)).toBe("consulat")
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, idn: idn(3), sponsored: true, consularAttestation: true }, NOW)).toBe(
      "consulat",
    )
  })

  it("sinon IDN de garantie ≥ 2 avec parrainage", () => {
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, idn: idn(2), sponsored: true }, NOW)).toBe("idn")
  })

  it("EA-01 : la décision de l'opérateur seulement quand rien d'autre ne vérifie", () => {
    const founding = { seniorityWaiver: true }
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, foundingAdmission: founding }, NOW)).toBe("operator")
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, foundingAdmission: founding, idn: idn(3), sponsored: false }, NOW)).toBe("operator")
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, foundingAdmission: founding, idn: idn(2), sponsored: true }, NOW)).toBe("idn")
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, foundingAdmission: founding, consularAttestation: true }, NOW)).toBe("consulat")
  })

  it("rien quand les faits ne vérifient pas", () => {
    expect(engineVerificationSource(LIGHT_ACCOUNT_GROUNDS, NOW)).toBeNull()
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, idn: idn(3) }, NOW)).toBeNull()
    expect(engineVerificationSource({ ...LIGHT_ACCOUNT_GROUNDS, consularAttestation: true, leftAt: NOW - 1 }, NOW)).toBeNull()
  })
})

describe("facetFromEngine — la facette relue depuis le moteur", () => {
  it("rend la facette du domaine à partir des valeurs et des niveaux fins conservés par la tranche", () => {
    const facet: DiasporaFacet = {
      countryOfResidence: "FR",
      city: "Lyon",
      postSlug: "consulat-general-paris",
      associationIds: ["asso-1"],
      arrivedAt: 2016,
      helpAvailable: true,
      visibility: { ...DEFAULT_FACET_VISIBILITY, city: "network", arrivedAt: "country" },
    }
    expect(facetFromEngine(toEngineFacet(facet).values, facet.visibility)).toEqual(facet)
  })

  it("sans niveaux fins : la protection par défaut", () => {
    expect(facetFromEngine({ countryOfResidence: "BE", helpAvailable: false }, null)).toEqual({
      countryOfResidence: "BE",
      associationIds: [],
      helpAvailable: false,
      visibility: DEFAULT_FACET_VISIBILITY,
    })
  })

  it("sans pays de résidence valide, pas de facette", () => {
    expect(facetFromEngine({}, null)).toBeNull()
    expect(facetFromEngine({ countryOfResidence: "GA" }, null)).toBeNull()
    expect(facetFromEngine({ countryOfResidence: "ZZ" }, null)).toBeNull()
    expect(facetFromEngine({ countryOfResidence: 33 }, null)).toBeNull()
  })

  it("une valeur ou un niveau hors forme est ignoré, jamais deviné", () => {
    const facet = facetFromEngine(
      {
        countryOfResidence: "CA",
        city: "",
        postSlug: 12,
        associationIds: "asso-1",
        arrivedAt: 2016.5,
        helpAvailable: "oui",
      },
      { city: "tout le monde", arrivedAt: undefined, helpAvailable: "only_me" },
    )
    expect(facet).toEqual({
      countryOfResidence: "CA",
      associationIds: [],
      helpAvailable: false,
      visibility: { ...DEFAULT_FACET_VISIBILITY, helpAvailable: "only_me" },
    })
  })
})
