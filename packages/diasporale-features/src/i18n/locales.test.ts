// @vitest-environment node
import { describe, expect, it } from "vitest"

import { DIASPORALE_LOCALES, LOCALE_PARTS, mergeLocaleParts } from "./resources"

/**
 * Cliquet i18n — les deux locales disent la même chose : mêmes clés, mêmes
 * variables, mêmes paires de pluriel. Le français suit la typographie
 * française (espaces insécables), l'anglais la sienne. Les textes sont relus
 * APRÈS fusion du fichier principal et des fragments de chantier.
 */
const fr = DIASPORALE_LOCALES.fr as Tree
const en = DIASPORALE_LOCALES.en as Tree

type Tree = { readonly [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [nested, text] of flatten(value, path)) out.set(nested, text)
  }
  return out
}

/** Les variables d'une phrase, format compris (`{{name, de}}` porte la variable `name`). */
const variables = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*(?:,[^}]*)?\}\}/g)].map((match) => match[1]).sort()

/** Les variables qui portent le nom d'une page ou d'une personne. */
const NAME_VARIABLES = "name|page"

const FR = flatten(fr)
const EN = flatten(en)

describe("fragments de locale", () => {
  it("existent sous le même nom dans chaque langue", () => {
    expect(Object.keys(LOCALE_PARTS.en).sort()).toEqual(Object.keys(LOCALE_PARTS.fr).sort())
  })

  it("refusent une phrase posée deux fois ou un groupe remplacé par une phrase", () => {
    expect(() => mergeLocaleParts({ a: { nav: { feed: "Fil" } }, b: { nav: { feed: "Autre" } } })).toThrow(/nav\.feed/)
    expect(() => mergeLocaleParts({ a: { nav: { feed: "Fil" } }, b: { nav: "Navigation" } })).toThrow(/nav/)
    expect(() => mergeLocaleParts({ a: { nav: "Navigation" }, b: { nav: { feed: "Fil" } } })).toThrow(/nav/)
    expect(mergeLocaleParts({ a: { nav: { feed: "Fil" } }, b: { nav: { explore: "Explorer" } } })).toEqual({ nav: { feed: "Fil", explore: "Explorer" } })
  })
})

describe("locales fr / en", () => {
  it("portent exactement les mêmes clés", () => {
    expect([...EN.keys()].filter((key) => !FR.has(key))).toEqual([])
    expect([...FR.keys()].filter((key) => !EN.has(key))).toEqual([])
  })

  it("portent les mêmes variables {{…}} pour chaque clé", () => {
    const mismatches = [...FR].filter(([key, text]) => variables(text).join() !== variables(EN.get(key) ?? "").join())
    expect(mismatches.map(([key]) => key)).toEqual([])
  })

  it("complètent chaque pluriel (_one ↔ _other) et le dotent de {{count}}", () => {
    for (const locale of [FR, EN]) {
      for (const key of locale.keys()) {
        const plural = /_(one|other)$/.exec(key)
        if (!plural) continue
        const base = key.slice(0, -plural[0].length)
        expect(locale.has(`${base}_one`) && locale.has(`${base}_other`), key).toBe(true)
        expect(variables(locale.get(key) ?? ""), key).toContain("count")
      }
    }
  })

  it("n'ont aucune chaîne vide ni d'espace en bordure", () => {
    for (const locale of [FR, EN]) {
      for (const [key, text] of locale) {
        expect(text.length, key).toBeGreaterThan(0)
        expect(text, key).toBe(text.trim())
      }
    }
  })

  it("français : une espace insécable avant « : ; ? ! », dans les guillemets et devant le tiret", () => {
    const faults = [...FR].filter(([, text]) => / [:;?!»]|« | — /.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
  })

  it("français : « de » s'élide devant un nom inséré, par le format `de` (« au nom d’Amicale »)", () => {
    const unelided = new RegExp(`(^|[^\\p{L}])[dD]e \\{\\{\\s*(?:${NAME_VARIABLES})\\s*\\}\\}`, "u")
    const faults = [...FR].filter(([, text]) => unelided.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
    expect(variables("Publier au nom {{name, de}}")).toEqual(["name"])
    expect(unelided.test("Publier au nom de {{name}}")).toBe(true)
  })

  it("français : un rôle ne s'accorde jamais à une personne dont on ignore le genre", () => {
    // Recette moteur du 20/11/2026 : « Béatrice MOUSSAVOU est administrateur dès maintenant. »
    // Les NOMS de rôle restent des étiquettes (« Administrateur », « Éditeur ») ; appliqués à une
    // personne nommée ou à « vous », ils passent par un verbe ou une tournure neutre.
    const role = "administrateur|éditeur|modérateur|animateur|auteur|invité|exclu"
    const word = (alternatives: string) => `(?<!\\p{L})(?:${alternatives})(?!\\p{L})`
    const gendered = [
      // « vous êtes éditeur », « {{name}} est administrateur », « êtes propriétaire ou modérateur »
      new RegExp(`${word("êtes|est|sera|serez|restez|reste")}\\s+(?:[\\p{L}'’]+\\s+ou\\s+)?(?:le\\s+|l['’]|un\\s+)?(?:seul\\s+|dernier\\s+|nouvel\\s+)?${word(role)}`, "u"),
      // « il devient administrateur », « deviendra administrateur »
      new RegExp(`${word("devien\\p{L}*")}\\s+(?:un\\s+|l['’])?${word(role)}`, "u"),
      // « vous en êtes l'administrateur »
      new RegExp(`${word("en")} êtes l['’]`, "u"),
      // « Administrateur de la page, vous… »
      new RegExp(`^(?:Administrateur|Éditeur|Modérateur|Animateur|Signataire)(?!\\p{L})[^.]{0,40}, vous(?!\\p{L})`, "u"),
      // « vous ont exclu », « vous êtes… ou invité à »
      new RegExp(`vous ont ${word("exclu|nommé|invité")}|, ou ${word("invité")}`, "u"),
      // « fait de son auteur un administrateur »
      new RegExp("fait de son auteur", "u"),
      // une ligne de la liste qui qualifie la personne : « Adhérent depuis le », « Exclu le »
      new RegExp(`^${word("Adhérent|Exclu")}`, "u"),
    ]
    const faults = [...FR].filter(([, text]) => gendered.some((pattern) => pattern.test(text)))
    expect(faults.map(([key]) => key)).toEqual([])
    // Le cliquet sait reconnaître la phrase de la recette, et laisse passer les noms de rôle.
    expect(gendered.some((pattern) => pattern.test("{{name}} est administrateur dès maintenant."))).toBe(true)
    expect(gendered.some((pattern) => pattern.test("Vous êtes éditeur de cette page."))).toBe(true)
    expect(gendered.some((pattern) => pattern.test("Administrateur"))).toBe(false)
    expect(gendered.some((pattern) => pattern.test("Seul un administrateur peut demander la vérification."))).toBe(false)
  })

  it("le format `de` n'existe qu'en français", () => {
    const faults = [...EN].filter(([, text]) => /\{\{[^}]*,\s*de\b/.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
  })

  it("anglais : aucune espace avant la ponctuation haute", () => {
    const faults = [...EN].filter(([, text]) => /[  ][:;?!]/.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
  })
})
