// @vitest-environment node
import { describe, expect, it } from "vitest"

import { frenchDe } from "./french-elision"
import { createAppI18n, getFixedT } from "./index"

/**
 * Recette moteur du 20/11/2026 — « Publier au nom de Amicale… », « l'équipe de Amicale… » :
 * « de » s'élide devant un nom inséré qui commence par une voyelle. Un seul mécanisme, le format
 * `de` des phrases françaises ; l'anglais n'en sait rien.
 */
describe("élision de « de » devant un nom inséré", () => {
  it("s'élide devant une voyelle, accentuée ou non, une ligature ou « y » ; jamais devant « h » ni une consonne", () => {
    expect(frenchDe("Amicale de Lyon")).toBe("d’Amicale de Lyon")
    expect(frenchDe("Écoute Gabon")).toBe("d’Écoute Gabon")
    expect(frenchDe("éclat")).toBe("d’éclat")
    expect(frenchDe("Île-de-France Solidaire")).toBe("d’Île-de-France Solidaire")
    expect(frenchDe("Œuvres du Sud")).toBe("d’Œuvres du Sud")
    expect(frenchDe("Yvette MBA")).toBe("d’Yvette MBA")
    expect(frenchDe("UNION DES GABONAIS")).toBe("d’UNION DES GABONAIS")
    expect(frenchDe("Hôtel du Port")).toBe("de Hôtel du Port")
    expect(frenchDe("Béatrice MOUSSAVOU")).toBe("de Béatrice MOUSSAVOU")
    expect(frenchDe("@awa.demo")).toBe("de @awa.demo")
    expect(frenchDe("3 Frères")).toBe("de 3 Frères")
  })

  it("prend la majuscule en début de phrase", () => {
    expect(frenchDe("Amina", { capital: true })).toBe("D’Amina")
    expect(frenchDe("Patrice", { capital: true })).toBe("De Patrice")
  })

  it("s'applique par le format `de` des phrases françaises, et l'anglais reste tel quel", () => {
    const fr = getFixedT("fr")
    expect(fr("pagePublications.publishAs", { name: "Amicale de Lyon" })).toBe("Publier au nom d’Amicale de Lyon")
    expect(fr("pagePublications.publishAs", { name: "Saveurs de Lille" })).toBe("Publier au nom de Saveurs de Lille")
    expect(fr("pageAdmin.invitations.accepted", { name: "Amicale de Lyon" })).toBe("Invitation acceptée : vous faites désormais partie de l'équipe d’Amicale de Lyon.")
    expect(fr("mentoring.requestCard.fromMentee", { name: "Amina", domain: "Études" })).toBe("D’Amina · Études")
    expect(fr("mentoring.requestCard.fromMentee", { name: "Patrice", domain: "Études" })).toBe("De Patrice · Études")
    const en = getFixedT("en")
    expect(en("pagePublications.publishAs", { name: "Amicale de Lyon" })).toBe("Publish as Amicale de Lyon")
  })

  it("chaque instance porte le format, client comme serveur, même après un changement de langue", async () => {
    const instance = createAppI18n({ locale: "en" })
    await instance.changeLanguage("fr")
    expect(instance.t("pagePublications.publishAs", { name: "Amicale" })).toBe("Publier au nom d’Amicale")
  })
})
