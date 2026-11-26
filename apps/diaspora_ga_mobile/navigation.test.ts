import { expect, test } from "bun:test"
import { incoming, destination } from "./navigation"
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
