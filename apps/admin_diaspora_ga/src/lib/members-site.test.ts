import { describe, expect, it, vi } from "vitest"

vi.mock("./env", () => ({ publicEnv: { convexUrl: null, membersSiteUrl: null } }))

import { membersDeskUrl } from "./members-site"

/** CH-815 A7 — les liens vers le bureau de modération de diaspora.ga : origine de l'environnement, chemin partagé. */
describe("liens vers le bureau de modération de diaspora.ga", () => {
  it("la file et les pages à vérifier, sur l'origine des membres", () => {
    expect(membersDeskUrl("file", "https://membres.exemple")).toBe("https://membres.exemple/moderation?onglet=file")
    expect(membersDeskUrl("pages", "https://membres.exemple")).toBe("https://membres.exemple/moderation?onglet=pages")
  })

  it("sans origine configurée, aucun lien", () => {
    expect(membersDeskUrl("file")).toBeNull()
    expect(membersDeskUrl("pages", null)).toBeNull()
  })
})
