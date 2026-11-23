import { describe, expect, test } from "bun:test"
import {
  DEFAULT_DIRECTORY_VISIBILITY,
  DIRECTORY_PAGE_SIZE_MAX,
  clampDirectoryPageSize,
  directoryCityKey,
  isListedInDirectoryFor,
  isVerifiedMember,
  matchesDirectoryBrowse,
  matchesDirectoryCountry,
  parseDirectoryBrowse,
  withMembershipTrust,
  type DirectoryTarget,
  type DirectoryViewer,
} from "./directory"
import { CITY_MAX_LENGTH } from "./facet"

const TARGET: DirectoryTarget = { status: "declaree", visibility: "country", consentActive: true, country: "FR" }
const VIEWER: DirectoryViewer = { status: "verifiee", country: "FR", isSelf: false, blockedWithTarget: false }

describe("annuaire opt-in", () => {
  test("masqué par défaut", () => {
    expect(DEFAULT_DIRECTORY_VISIBILITY).toBe("hidden")
    expect(isListedInDirectoryFor({ ...TARGET, visibility: "hidden" }, VIEWER)).toBe(false)
  })

  test("niveau pays : les membres du même pays seulement", () => {
    expect(isListedInDirectoryFor(TARGET, VIEWER)).toBe(true)
    expect(isListedInDirectoryFor(TARGET, { ...VIEWER, country: "BE" })).toBe(false)
  })

  test("niveau réseau : tout membre actif", () => {
    expect(isListedInDirectoryFor({ ...TARGET, visibility: "network" }, { ...VIEWER, country: "CA" })).toBe(true)
  })

  test("sans consentement en vigueur, jamais", () => {
    expect(isListedInDirectoryFor({ ...TARGET, visibility: "network", consentActive: false }, VIEWER)).toBe(false)
  })

  test("un membre en attente ne figure pas et ne consulte pas", () => {
    expect(isListedInDirectoryFor({ ...TARGET, status: "en_attente" }, VIEWER)).toBe(false)
    expect(isListedInDirectoryFor(TARGET, { ...VIEWER, status: "en_attente" })).toBe(false)
  })

  test("suspendus et partis : ni l'un ni l'autre", () => {
    expect(isListedInDirectoryFor({ ...TARGET, status: "suspendue" }, VIEWER)).toBe(false)
    expect(isListedInDirectoryFor(TARGET, { ...VIEWER, status: "partie" })).toBe(false)
  })

  test("le blocage ferme l'annuaire dans les deux sens", () => {
    expect(isListedInDirectoryFor({ ...TARGET, visibility: "network" }, { ...VIEWER, blockedWithTarget: true })).toBe(false)
  })

  test("soi-même : visible si l'on a choisi un niveau et consenti", () => {
    const self = { ...VIEWER, isSelf: true, status: "en_attente" as const }
    expect(isListedInDirectoryFor(TARGET, self)).toBe(true)
    expect(isListedInDirectoryFor({ ...TARGET, visibility: "hidden" }, self)).toBe(false)
    expect(isListedInDirectoryFor({ ...TARGET, consentActive: false }, self)).toBe(false)
  })
})

describe("parcourir l'annuaire par pays et par ville (CH-816, lot P3)", () => {
  const OPEN = ["FR", "BE"] as const

  test("un pays ouvert, normalisé ; la ville facultative, repliée comme les villes saisies", () => {
    expect(parseDirectoryBrowse({ country: " fr " }, OPEN)).toEqual({ ok: true, value: { country: "FR", cityKey: null, verifiedOnly: false } })
    expect(parseDirectoryBrowse({ country: "BE", city: "  Saint-Josse   ten-Noode ", verifiedOnly: true }, OPEN)).toEqual({
      ok: true,
      value: { country: "BE", cityKey: "saint josse ten noode", verifiedOnly: true },
    })
    expect(parseDirectoryBrowse({ country: "FR", city: "   " }, OPEN)).toEqual({ ok: true, value: { country: "FR", cityKey: null, verifiedOnly: false } })
    expect(parseDirectoryBrowse({ country: "FR", city: null }, OPEN)).toEqual({ ok: true, value: { country: "FR", cityKey: null, verifiedOnly: false } })
  })

  test("un pays fermé, inconnu ou le Gabon ne se parcourt pas", () => {
    expect(parseDirectoryBrowse({ country: "CA" }, OPEN)).toEqual({ ok: false, code: "directory_country_closed" })
    expect(parseDirectoryBrowse({ country: "XX" }, ["XX"])).toEqual({ ok: false, code: "directory_country_closed" })
    expect(parseDirectoryBrowse({ country: "GA" }, ["GA"])).toEqual({ ok: false, code: "directory_country_closed" })
  })

  test("une ville trop longue, sur deux lignes ou sans lettre est refusée", () => {
    expect(parseDirectoryBrowse({ country: "FR", city: "a".repeat(CITY_MAX_LENGTH + 1) }, OPEN)).toEqual({ ok: false, code: "directory_city_invalid" })
    expect(parseDirectoryBrowse({ country: "FR", city: "Lyon\nParis" }, OPEN)).toEqual({ ok: false, code: "directory_city_invalid" })
    expect(parseDirectoryBrowse({ country: "FR", city: "- ' -" }, OPEN)).toEqual({ ok: false, code: "directory_city_invalid" })
  })

  test("la clé d'une ville de facette : sans accents ni tirets ; rien sans ville", () => {
    expect(directoryCityKey("Saint-Étienne")).toBe("saint etienne")
    expect(directoryCityKey(" saint  etienne ")).toBe("saint etienne")
    expect(directoryCityKey("’")).toBeNull()
    expect(directoryCityKey(undefined)).toBeNull()
    expect(directoryCityKey(null)).toBeNull()
  })

  test("les filtres se jugent sur ce que le LECTEUR voit : un pays ou une ville masqués ne répondent jamais", () => {
    const filters = { country: "FR", cityKey: null, verifiedOnly: false } as const
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR" }, verified: false }, filters)).toBe(true)
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "BE" }, verified: false }, filters)).toBe(false)
    // Le pays masqué au lecteur : le parcours ne le révèle pas.
    expect(matchesDirectoryBrowse({ projection: {}, verified: true }, filters)).toBe(false)

    const lyon = { ...filters, cityKey: "lyon" }
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR", city: "LYON" }, verified: false }, lyon)).toBe(true)
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR", city: "Lille" }, verified: false }, lyon)).toBe(false)
    // La ville réservée aux relations : absente de la projection, absente du parcours par ville.
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR" }, verified: false }, lyon)).toBe(false)

    const verifiedOnly = { ...filters, verifiedOnly: true }
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR" }, verified: true }, verifiedOnly)).toBe(true)
    expect(matchesDirectoryBrowse({ projection: { countryOfResidence: "FR" }, verified: false }, verifiedOnly)).toBe(false)
  })

  test("le filtre de pays, partagé par la recherche et le parcours : le pays que le lecteur VOIT", () => {
    expect(matchesDirectoryCountry({ countryOfResidence: "FR" }, "FR")).toBe(true)
    expect(matchesDirectoryCountry({ countryOfResidence: "BE" }, "FR")).toBe(false)
    expect(matchesDirectoryCountry({}, "FR")).toBe(false)
  })

  test("vérifié : le badge calculé par le moteur, ou le statut « vérifiée » du réseau", () => {
    expect(isVerifiedMember("verifiee", ["community"])).toBe(true)
    expect(isVerifiedMember("declaree", ["verified"])).toBe(true)
    expect(isVerifiedMember("declaree", ["community"])).toBe(false)
    expect(isVerifiedMember("declaree", ["public_agent"])).toBe(false)
  })

  test("les badges d'un membre listé : « Vérifié » quand le statut l'est, « Communauté » cède la place", () => {
    expect(withMembershipTrust(["community"], "verifiee")).toEqual(["verified"])
    expect(withMembershipTrust(["public_agent"], "verifiee")).toEqual(["verified", "public_agent"])
    expect(withMembershipTrust(["verified", "public_agent"], "verifiee")).toEqual(["verified", "public_agent"])
    expect(withMembershipTrust(["community"], "declaree")).toEqual(["community"])
  })
})

describe("pagination stricte (anti-extraction)", () => {
  test("bornée entre 1 et la borne", () => {
    expect(clampDirectoryPageSize(5)).toBe(5)
    expect(clampDirectoryPageSize(500)).toBe(DIRECTORY_PAGE_SIZE_MAX)
    expect(clampDirectoryPageSize(0)).toBe(1)
    expect(clampDirectoryPageSize(-3)).toBe(1)
    expect(clampDirectoryPageSize(7.8)).toBe(7)
    expect(clampDirectoryPageSize(Number.NaN)).toBe(DIRECTORY_PAGE_SIZE_MAX)
    expect(clampDirectoryPageSize(Number.POSITIVE_INFINITY)).toBe(DIRECTORY_PAGE_SIZE_MAX)
  })
})
