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

  it("l'entrée porte la section à rouvrir, sauf le tableau de bord", () => {
    expect(routes.signIn()).toBe("/entrer")
    expect(routes.signIn(routes.dashboard())).toBe("/entrer")
    expect(routes.signIn(routes.journal())).toBe("/entrer?retour=%2Fjournal")
  })

  it("une sortie non confirmée se dit à l'entrée, et se relit", () => {
    expect(routes.signedOut(false)).toBe("/entrer")
    expect(routes.signedOut(true)).toBe("/entrer?deconnexion=incomplete")
    expect(signOutWasIncomplete("?deconnexion=incomplete")).toBe(true)
    expect(signOutWasIncomplete("?deconnexion=autre")).toBe(false)
    expect(signOutWasIncomplete("")).toBe(false)
  })
})
