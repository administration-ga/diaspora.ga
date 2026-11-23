import { describe, expect, test } from "bun:test"

import {
  COMMUNITY_RULES,
  isCommunityRule,
  LAWYER_QUESTIONS,
  LEGAL_TEXT_KINDS,
  LEGAL_TEXT_STATUSES,
  LEGAL_TEXTS,
  legalTextsBlockingRelease,
  pendingLegalTexts,
} from "./legal-texts"

describe("textes du site (LX-05)", () => {
  test("chaque texte a une version, une date valide, un état connu et des rubriques uniques", () => {
    expect(Object.keys(LEGAL_TEXTS).sort()).toEqual([...LEGAL_TEXT_KINDS].sort())
    for (const kind of LEGAL_TEXT_KINDS) {
      const edition = LEGAL_TEXTS[kind]
      expect(edition.version.length, kind).toBeGreaterThan(0)
      expect(edition.date, kind).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${edition.date}T00:00:00Z`).toISOString().slice(0, 10), kind).toBe(edition.date)
      expect(LEGAL_TEXT_STATUSES, kind).toContain(edition.status)
      expect(edition.sections.length, kind).toBeGreaterThan(0)
      expect(new Set(edition.sections).size, kind).toBe(edition.sections.length)
    }
  })

  test("conditions d'utilisation, règles de la communauté et contact sont présents", () => {
    expect(LEGAL_TEXT_KINDS).toEqual(expect.arrayContaining(["terms", "community", "contact"]))
  })

  test("trois états, du texte à fournir au texte définitif", () => {
    expect(LEGAL_TEXT_STATUSES).toEqual(["missing", "provisional", "final"])
  })

  test("aucun texte n'est définitif : chacun tient fermée la porte de mise en ligne", () => {
    expect(legalTextsBlockingRelease()).toEqual([...LEGAL_TEXT_KINDS])
    for (const kind of LEGAL_TEXT_KINDS) expect(LEGAL_TEXTS[kind].status, kind).not.toBe("final")
  })

  test("les cinq textes sont rédigés et provisoires : plus aucun ne reste à fournir", () => {
    for (const kind of LEGAL_TEXT_KINDS) expect(LEGAL_TEXTS[kind].status, kind).toBe("provisional")
    expect(pendingLegalTexts()).toEqual([])
  })

  test("les mentions légales portent les rubriques qu'impose l'identification de l'éditeur", () => {
    // Ordonnance n° 0011/PR/2026, article 25 : éditeur, directeur de la publication, hébergeur.
    expect(LEGAL_TEXTS.notice.sections).toEqual(expect.arrayContaining(["publisher", "director", "hosting"]))
  })

  test("la confidentialité dit le responsable, les données, les destinataires, les durées, les droits et la réclamation", () => {
    expect(LEGAL_TEXTS.privacy.sections).toEqual(
      expect.arrayContaining(["controller", "data", "purposes", "recipients", "transfers", "retention", "rights", "exercise", "complaint"]),
    )
  })

  test("le registre est figé : aucun écran ne peut le réécrire", () => {
    expect(Object.isFrozen(LEGAL_TEXTS)).toBe(true)
  })
})

describe("règles de la communauté (MD-05)", () => {
  test("leurs rubriques sont les règles, dans l'ordre d'affichage", () => {
    expect(LEGAL_TEXTS.community.sections).toEqual([...COMMUNITY_RULES])
    expect(COMMUNITY_RULES).toEqual(
      expect.arrayContaining(["respect", "scams", "impersonation", "politics", "privacy", "prohibited", "authorship", "integrity", "pages", "measures"]),
    )
    // Signaler et les recours ferment la page : ils s'appliquent à toutes les règles qui précèdent.
    expect(COMMUNITY_RULES.slice(-2)).toEqual(["reporting", "measures"])
  })

  test("reconnaît une règle, refuse tout autre identifiant", () => {
    for (const rule of COMMUNITY_RULES) expect(isCommunityRule(rule), rule).toBe(true)
    expect(isCommunityRule("sanctions")).toBe(false)
    expect(isCommunityRule("")).toBe(false)
  })

  test("un passage « À fournir » nomme une question posée au juriste, sur une rubrique du texte", () => {
    for (const kind of LEGAL_TEXT_KINDS) {
      const edition = LEGAL_TEXTS[kind]
      const entries = Object.entries(edition.awaiting)
      // Seul un texte provisoire a des passages qui attendent : à fournir, tout manque ; définitif, rien.
      if (edition.status !== "provisional") expect(entries, kind).toEqual([])
      for (const [section, questions] of entries) {
        expect(edition.sections, `${kind}.${section}`).toContain(section)
        expect(questions.length, `${kind}.${section}`).toBeGreaterThan(0)
        for (const question of questions) expect(LAWYER_QUESTIONS, `${kind}.${section}`).toContain(question)
      }
    }
  })

  test("plus aucun passage n'attend une réponse : les textes sont rédigés en entier", () => {
    for (const kind of LEGAL_TEXT_KINDS) expect(LEGAL_TEXTS[kind].awaiting, kind).toEqual({})
  })
})
