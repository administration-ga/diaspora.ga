import { describe, expect, it } from "vitest"

import { routes, signOutWasIncomplete } from "./routes"

/** CH-815 A4 — toutes les adresses du contrat sont déclarées ici, et nulle part ailleurs (cliquet local des adresses). */
describe("table des routes d'admin.diaspora.ga", () => {
  it("déclare exactement les adresses du contrat", () => {
    const paths = Object.entries(routes)
      .filter(([name]) => name !== "signedOut")
      .map(([, route]) => (route as () => string)())
      .sort()
    expect(paths).toEqual(
      [
        "/entrer",
        "/",
        "/modules",
        "/apercu",
        "/mesure",
        "/journal",
        "/institutions",
        "/fondateurs",
        "/pays",
        "/recours",
        "/equipe",
        "/regles",
        "/sante-fonctionnelle",
        "/api/sante-fonctionnelle",
      ].sort(),
    )
  })

  it("l'entrée est nue : aucune section à rouvrir ne voyage dans l'adresse (revue A1, F2)", () => {
    expect(routes.signIn()).toBe("/entrer")
    // Aucun argument n'est accepté : la section retenue vit dans l'onglet (`requested-section.ts`).
    expect(routes.signIn.length).toBe(0)
  })

  it("une sortie non confirmée se dit à l'entrée, et se relit", () => {
    expect(routes.signedOut(false)).toBe("/entrer")
    expect(routes.signedOut(true)).toBe("/entrer?deconnexion=incomplete")
    expect(signOutWasIncomplete("?deconnexion=incomplete")).toBe(true)
    expect(signOutWasIncomplete("?deconnexion=autre")).toBe(false)
    expect(signOutWasIncomplete("")).toBe(false)
  })
})
