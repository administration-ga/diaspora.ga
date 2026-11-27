import { expect, test } from "bun:test"
import { incoming, destination, missingConsulateEntry } from "./navigation"
test("seuls les liens associés ouvrent une session de passage", () => {
  const fields = new URLSearchParams({ state: "a".repeat(64), code: "b".repeat(64) })
  expect(incoming("https://diaspora.ga/mobile/ouvrir")).toBe("https://diaspora.ga/passerelle/consulat?mode=app")
  expect(incoming("https://diaspora.ga/mobile/retour#" + fields)).toBe("https://diaspora.ga/mobile/retour#" + fields)
  for (const other of ["https://diaspora.ga/mobile/retour#code=1", "http://diaspora.ga/mobile/ouvrir", "https://diaspora.ga.example/mobile/ouvrir", "https://user@diaspora.ga/mobile/ouvrir", "foo://mobile/ouvrir"]) expect(incoming(other)).toBeNull()
})
test("les destinations externes sont confiées au système", () => {
  expect(destination("https://consulat.ga/my-space")).toBe("outside")
  expect(destination("https://diaspora.ga/fil")).toBe("inside")
  expect(destination("file:///tmp")).toBe("blocked")
})
test("le bouton consulaire reprend la session sans accepter de paramètres sur le lien privé", () => {
  expect(incoming("diasporaga:///ouvrir")).toBe("https://diaspora.ga/passerelle/consulat?mode=app&ouvrir=1")
  expect(incoming("diasporaga:///ouvrir?redirect=https://example.org")).toBeNull()
})

test("seule une entrée consulaire absente reprend la porte web, sans transférer de billet", () => {
  for (const link of ["diasporaga:///ouvrir", "https://diaspora.ga/mobile/ouvrir"]) {
    const entry = incoming(link)!
    expect(missingConsulateEntry(404, entry, entry)).toBe("https://diaspora.ga/entrer?depuis=consulat")
    for (const status of [200, 401, 403, 500]) expect(missingConsulateEntry(status, entry, entry)).toBeNull()
    expect(missingConsulateEntry(404, entry, "https://diaspora.ga/fil")).toBeNull()
  }
  const callback = "https://diaspora.ga/mobile/retour#code=exemple"
  expect(missingConsulateEntry(404, callback, callback)).toBeNull()
})

test("un lien de téléphone ouvre le composeur système pour un numéro simple", () => {
  expect(destination("tel:+24101234567")).toBe("outside")
  expect(destination("tel:*123%23")).toBe("blocked")
  expect(destination("tel://example.org")).toBe("blocked")
})
