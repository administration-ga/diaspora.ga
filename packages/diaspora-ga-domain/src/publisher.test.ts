import { describe, expect, test } from "bun:test"

import { PUBLISHER, PUBLISHER_TEXT_VARIABLES } from "./publisher"

describe("l'éditeur cité par les textes du site", () => {
  test("chaque fait d'identité est renseigné", () => {
    for (const [fact, value] of Object.entries(PUBLISHER)) expect(value.trim().length, fact).toBeGreaterThan(0)
  })

  test("le registre est figé : aucun écran ne peut le réécrire", () => {
    expect(Object.isFrozen(PUBLISHER)).toBe(true)
    expect(Object.isFrozen(PUBLISHER_TEXT_VARIABLES)).toBe(true)
  })

  test("l'adresse de contact est une adresse de rôle, jamais une adresse personnelle", () => {
    expect(PUBLISHER.email).toMatch(/^(?:admin|contact|support|donnees|dpo)@[a-z0-9.-]+\.[a-z]{2,}$/)
  })

  test("le site de la société est un nom, sans protocole : ce n'est pas un lien écrit en dur", () => {
    expect(PUBLISHER.website).not.toMatch(/^https?:/)
    expect(PUBLISHER.website).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/)
  })

  test("le représentant légal s'écrit Prénom puis NOM en capitales", () => {
    const words = PUBLISHER.representative.split(" ")
    const family = words[words.length - 1]!
    expect(family).toBe(family.toUpperCase())
    for (const given of words.slice(0, -1)) expect(given, given).toMatch(/^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)*$/u)
  })

  test("une variable de texte par fait, au nom explicite", () => {
    expect(Object.keys(PUBLISHER_TEXT_VARIABLES).sort()).toEqual(
      Object.keys(PUBLISHER)
        .map((fact) => `publisher${fact[0]!.toUpperCase()}${fact.slice(1)}`)
        .sort(),
    )
    expect(PUBLISHER_TEXT_VARIABLES.publisherRccm).toBe(PUBLISHER.rccm)
    expect(PUBLISHER_TEXT_VARIABLES.publisherRepresentative).toBe(PUBLISHER.representative)
  })
})
