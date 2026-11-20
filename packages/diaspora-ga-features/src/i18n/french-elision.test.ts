// @vitest-environment node
import type { i18n as I18nInstance } from "i18next"
import { describe, expect, it } from "vitest"

import { ELIDABLE_WORDS, frenchElide, registerFrenchFormats } from "./french-elision"
import { createAppI18n, getFixedT } from "./index"

/**
 * Recette moteur du 20/11/2026 — « Publier au nom de Amicale… », « l'équipe de Amicale… » :
 * un mot élidable (« de », « que »…) s'élide devant un nom inséré qui commence par une voyelle.
 * Un seul mécanisme, les formats des phrases françaises (`{{name, de}}`, `{{name, que}}`) ;
 * l'anglais n'en sait rien.
 */
describe("élision devant un nom inséré", () => {
  it("s'élide devant une voyelle, accentuée ou non, d'ici ou d'ailleurs, ou une ligature", () => {
    expect(frenchElide("de", "Amicale de Lyon")).toBe("d’Amicale de Lyon")
    expect(frenchElide("de", "Écoute Gabon")).toBe("d’Écoute Gabon")
    expect(frenchElide("de", "éclat")).toBe("d’éclat")
    expect(frenchElide("de", "Île-de-France Solidaire")).toBe("d’Île-de-France Solidaire")
    expect(frenchElide("de", "Œuvres du Sud")).toBe("d’Œuvres du Sud")
    expect(frenchElide("de", "Æsir")).toBe("d’Æsir")
    expect(frenchElide("de", "UNION DES GABONAIS")).toBe("d’UNION DES GABONAIS")
    expect(frenchElide("de", "Ángela RUIZ")).toBe("d’Ángela RUIZ")
    expect(frenchElide("de", "Óscar PÉREZ")).toBe("d’Óscar PÉREZ")
    expect(frenchElide("de", "Úrsula MOREIRA")).toBe("d’Úrsula MOREIRA")
  })

  it("« y » devant une consonne s'élide, « y » devant une voyelle est une consonne ; jamais devant « h » ni une consonne", () => {
    expect(frenchElide("de", "Yvette MBA")).toBe("d’Yvette MBA")
    expect(frenchElide("de", "Yannick NDONG")).toBe("de Yannick NDONG")
    expect(frenchElide("de", "Yolande")).toBe("de Yolande")
    expect(frenchElide("de", "Yaoundé Solidarité")).toBe("de Yaoundé Solidarité")
    expect(frenchElide("de", "Hôtel du Port")).toBe("de Hôtel du Port")
    expect(frenchElide("de", "Béatrice MOUSSAVOU")).toBe("de Béatrice MOUSSAVOU")
    expect(frenchElide("de", "@awa.demo")).toBe("de @awa.demo")
    expect(frenchElide("de", "3 Frères")).toBe("de 3 Frères")
  })

  it("vaut pour chaque mot élidable, et prend la majuscule en début de phrase", () => {
    expect(frenchElide("que", "Amina")).toBe("qu’Amina")
    expect(frenchElide("que", "Patrice")).toBe("que Patrice")
    expect(frenchElide("jusque", "Owendo")).toBe("jusqu’Owendo")
    expect(frenchElide("le", "Ogooué")).toBe("l’Ogooué")
    expect(frenchElide("la", "Amicale")).toBe("l’Amicale")
    expect(frenchElide("de", "Amina", { capital: true })).toBe("D’Amina")
    expect(frenchElide("de", "Patrice", { capital: true })).toBe("De Patrice")
    expect(frenchElide("que", "Ángela", { capital: true })).toBe("Qu’Ángela")
    expect(ELIDABLE_WORDS).toEqual(expect.arrayContaining(["de", "que", "jusque", "le", "la", "ne", "je", "me", "te", "se"]))
  })

  it("s'applique par les formats des phrases françaises, apostrophes typographiques, et l'anglais reste tel quel", () => {
    const fr = getFixedT("fr")
    expect(fr("pagePublications.publishAs", { name: "Amicale de Lyon" })).toBe("Publier au nom d’Amicale de Lyon")
    expect(fr("pagePublications.publishAs", { name: "Saveurs de Lille" })).toBe("Publier au nom de Saveurs de Lille")
    expect(fr("pageAdmin.invitations.accepted", { name: "Amicale de Lyon" })).toBe("Invitation acceptée : vous faites désormais partie de l’équipe d’Amicale de Lyon.")
    expect(fr("mentoring.requestCard.fromMentee", { name: "Amina", domain: "Études" })).toBe("D’Amina · Études")
    expect(fr("mentoring.requestCard.fromMentee", { name: "Patrice", domain: "Études" })).toBe("De Patrice · Études")
    expect(fr("mentoring.request.consent", { name: "Amina" })).toBe("J’accepte qu’Amina voie mon nom publié, mon objectif et mon message.")
    expect(fr("mentoring.request.consent", { name: "Yannick NDONG" })).toBe("J’accepte que Yannick NDONG voie mon nom publié, mon objectif et mon message.")
    const en = getFixedT("en")
    expect(en("pagePublications.publishAs", { name: "Amicale de Lyon" })).toBe("Publish as Amicale de Lyon")
  })

  it("chaque instance porte les formats, client comme serveur, même après un changement de langue", async () => {
    const instance = createAppI18n({ locale: "en" })
    await instance.changeLanguage("fr")
    expect(instance.t("pagePublications.publishAs", { name: "Amicale" })).toBe("Publier au nom d’Amicale")
  })

  it("une instance sans formateur est refusée tout haut, jamais « Publier au nom Amicale » en silence", () => {
    const bare = { services: {} } as unknown as I18nInstance
    expect(() => registerFrenchFormats(bare)).toThrow(/formateur/)
  })
})
