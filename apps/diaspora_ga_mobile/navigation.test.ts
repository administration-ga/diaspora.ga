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

import { publicShareUrl, readShareRequest, smsComposerUrl } from "./share-links"

test("les liens sociaux conservent leur cible à l'ouverture, sans reprendre les traceurs", () => {
  const base = "https://diaspora.ga"
  const invite = "/messages?invitation-groupe=" + "A_b2".repeat(7)
  for (const path of ["/@awa.paris", "/pages/amicale", "/publication/abcd1234", "/fil", invite, "/pages/amicale?contenu=photos#page-publications"]) {
    expect(incoming(base + path)).toBe(base + path)
  }
  expect(incoming(base + "/@awa?email=prive#rien")).toBe(base + "/@awa")
  expect(incoming(base + "/messages?utm_source=mobile")).toBe(base + "/messages")
  expect(incoming(base + "/messages?invitation-groupe=x")).toBeNull()
  expect(incoming(base + "/publication/abc?trace=1#commenter")).toBe(base + "/publication/abc#commenter")
  expect(incoming(base + "/publication/abc#autre")).toBe(base + "/publication/abc")
  expect(publicShareUrl(new URL(base + "/messages"))).toBeNull()
  for (const path of ["/@x%2Fy", "/messages?invitation-groupe=x", "/api/auth", "/publication/a%20b"]) {
    expect(publicShareUrl(new URL(base + path))).toBeNull()
  }
})

test("seuls les messages du site et un lien canonique peuvent ouvrir le partage", () => {
  const source = "https://diaspora.ga/fil"
  const request = { type: "diaspora-share-v1", id: "1710061120012-3", action: "sms", url: "https://diaspora.ga/@awa?secret=1", title: "Mon profil" }
  const data = JSON.stringify(request)
  expect(readShareRequest(source, data)?.url).toBe("https://diaspora.ga/@awa")
  expect(readShareRequest("https://identite.ga/entrer", data)).toBeNull()
  for (const replacement of [
    { type: "inconnu" }, { action: "send" }, { url: "https://diaspora.ga/mobile/retour#code=123" },
    { url: "https://tiers.test/@awa" }, { url: "sms:+12345678" }, { id: "x" }
  ]) expect(readShareRequest(source, JSON.stringify({ ...request, ...replacement }))).toBeNull()
  expect(destination("sms:+12345?body=Message")).toBe("blocked")
  expect(smsComposerUrl("https://diaspora.ga/@awa", false)).toBe("sms:?body=https%3A%2F%2Fdiaspora.ga%2F%40awa")
  expect(smsComposerUrl("https://diaspora.ga/@awa", true)).toBe("sms:&body=https%3A%2F%2Fdiaspora.ga%2F%40awa")
})
