import { describe, expect, test } from "bun:test"

import {
  CONSULATE_DESTINATION_RULES,
  CONSULATE_DESTINATIONS,
  consulateDestinationUrl,
  parseConsulateOrigin,
} from "./consulate-destinations"

/**
 * Contrat DIASPORA-PASSERELLE-V1 (CH-863, lot D1) — le sens DIASPORA.GA → consulat.ga : deux
 * destinations FERMÉES, composées depuis l'origine configurée, sans rien de personnel.
 */
const ORIGIN = "https://consulat.example"

describe("passerelle consulat.ga — les destinations du contrat", () => {
  test("deux clés fermées, dans l'ordre du contrat : l'espace personnel, puis l'inscription", () => {
    expect(CONSULATE_DESTINATIONS).toEqual(["mySpace", "register"])
    expect(Object.keys(CONSULATE_DESTINATION_RULES).sort()).toEqual([...CONSULATE_DESTINATIONS].sort())
  })

  test("les chemins sont ceux du contrat : /my-space sans paramètre, /register?type=long_stay", () => {
    expect(consulateDestinationUrl(ORIGIN, "mySpace")).toBe("https://consulat.example/my-space")
    expect(consulateDestinationUrl(ORIGIN, "register")).toBe("https://consulat.example/register?type=long_stay")
  })

  test("aucune clé personnelle : un seul paramètre en tout, fermé, qui ne désigne personne", () => {
    const keys = CONSULATE_DESTINATIONS.flatMap((destination) => Object.keys(CONSULATE_DESTINATION_RULES[destination].query))
    expect(keys).toEqual(["type"])
    const personal = /id|nip|mail|phone|tel|handle|name|nom|token|user|person|session|code|country|pays|ref/i
    for (const destination of CONSULATE_DESTINATIONS) {
      const url = new URL(consulateDestinationUrl(ORIGIN, destination) ?? "")
      // Ni identifiant, ni ancre, ni référent possible dans l'adresse : seulement le chemin et la valeur fermée.
      expect(url.hash).toBe("")
      expect(url.username + url.password).toBe("")
      for (const [name, value] of url.searchParams) {
        expect(personal.test(name), name).toBe(false)
        expect(value).toBe("long_stay")
      }
    }
  })

  test("l'origine se normalise : casse de l'hôte, barre finale, port gardé", () => {
    expect(parseConsulateOrigin("https://Consulat.Example/")).toBe("https://consulat.example")
    expect(parseConsulateOrigin("  https://consulat.example  ")).toBe("https://consulat.example")
    expect(parseConsulateOrigin("HTTPS://consulat.example:8443")).toBe("https://consulat.example:8443")
    expect(consulateDestinationUrl("https://consulat.example/", "mySpace")).toBe("https://consulat.example/my-space")
  })

  test("une adresse absente ou vide : aucune destination, jamais un lien mort", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(parseConsulateOrigin(value)).toBeNull()
      expect(consulateDestinationUrl(value, "mySpace")).toBeNull()
      expect(consulateDestinationUrl(value, "register")).toBeNull()
    }
  })

  test("une origine invalide est refusée : pas https, identifiants, chemin, requête, ancre, blanc, barre inverse", () => {
    const refused = [
      "http://consulat.example",
      "ftp://consulat.example",
      "javascript:alert(1)",
      "//consulat.example",
      "consulat.example",
      "https://",
      "https://agent:secret@consulat.example",
      "https://agent@consulat.example",
      "https://consulat.example/fr",
      "https://consulat.example/my-space",
      "https://consulat.example?ref=diaspora",
      "https://consulat.example/?",
      "https://consulat.example#espace",
      "https://consulat.example/#",
      "https://consulat .example",
      "https://consulat.example\\fr",
      "https://consulat.example\u0000",
    ]
    for (const value of refused) {
      expect(parseConsulateOrigin(value), value).toBeNull()
      expect(consulateDestinationUrl(value, "mySpace"), value).toBeNull()
    }
  })
})
