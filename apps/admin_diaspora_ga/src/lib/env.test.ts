import { describe, expect, it } from "vitest"

import { readSiteOrigin } from "./env"

describe("origine de l'application des membres", () => {
  it("garde l'origine d'une adresse http(s) lisible", () => {
    expect(readSiteOrigin("https://membres.exemple")).toBe("https://membres.exemple")
    expect(readSiteOrigin(" https://membres.exemple/chemin?x=1 ")).toBe("https://membres.exemple")
    expect(readSiteOrigin("http://localhost:3031")).toBe("http://localhost:3031")
  })

  it("absente, vide, illisible, d'un autre protocole ou avec des identifiants : aucun lien", () => {
    for (const raw of [undefined, "", "   ", "membres.exemple", "javascript:alert(1)", "ftp://membres.exemple", "https://moi:secret@membres.exemple"]) {
      expect(readSiteOrigin(raw), String(raw)).toBeNull()
    }
  })
})
