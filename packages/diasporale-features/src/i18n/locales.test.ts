// @vitest-environment node
import { describe, expect, it } from "vitest"

import { ELIDABLE_WORDS } from "./french-elision"
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

/** Un mot élidable écrit tel quel devant un nom inséré (« de {{name}} », « que {{page}} ») : il doit passer par son format. */
const UNELIDED = new RegExp(`(?<!\\p{L})(?:${ELIDABLE_WORDS.join("|")}) \\{\\{\\s*(?:${NAME_VARIABLES})\\s*\\}\\}`, "iu")

/** Une variable qui emploie un format d'élision (`{{name, de}}`, `{{name, de(capital: true)}}`). */
const ELISION_FORMAT = new RegExp(`\\{\\{\\s*\\w+\\s*,\\s*(?:${ELIDABLE_WORDS.join("|")})(?:\\(|\\s*\\}\\})`, "u")

/** Une alternative de mots entiers (les lettres accentuées comprises, que `\\b` ignore). */
const word = (alternatives: string) => `(?<!\\p{L})(?:${alternatives})(?!\\p{L})`

/** Les noms de rôle accordés, dans les deux genres (les noms épicènes — membre, signataire, responsable — n'ont pas d'accord). */
const ROLE_NOUNS = "administrat(?:eur|rice)s?|édit(?:eur|rice)s?|modérat(?:eur|rice)s?|animat(?:eur|rice)s?|aut(?:eur|eure|rice)s?|rédact(?:eur|rice)s?|adhérente?s?|parrains?|marraines?"

/** Les verbes attributifs : être, devenir, rester, demeurer, passer, voilà. */
const ATTRIBUTIVE_VERBS = "êtes|est|es|suis|sera|serez|seras|serait|seriez|était|étiez|devient|devenez|deviens|deviendra|deviendrez|deviendrait|reste|restez|restes|restera|resterez|demeure|demeurez|passe|passez|voilà"

/** Entre le verbe et le rôle : négation, adverbes, participe de nomination. */
const BETWEEN = "(?:\\s+(?:pas|plus|désormais|maintenant|aussi|toujours|déjà|encore|bien|ici|seule?))*(?:\\s+(?:nommée?|désignée?|promue?|choisie?))?"

/** Avant le rôle : un adjectif de rang, et « propriétaire ou » (« êtes propriétaire ou modérateur »). */
const BEFORE_ROLE = `(?:(?:seule?|dernière?|dernier|nouvel|nouvelle|nouveau|premier|première)\\s+)?(?:\\p{L}+\\s+ou\\s+)?${word(ROLE_NOUNS)}`

const NEGATION_AND_CLITIC = "(?:(?:ne\\s+|n['’]))?(?:(?:en|y)\\s+)?"

const GENDERED_ATTRIBUTES = [
  // « vous êtes éditeur », « {{name}} est nommé administrateur », « vous en êtes l'administrateur », « la personne deviendra administrateur »
  new RegExp(`${word("vous|la personne|cette personne|\\{\\{\\s*\\w+\\s*\\}\\}")}\\s+${NEGATION_AND_CLITIC}${word(ATTRIBUTIVE_VERBS)}${BETWEEN}\\s+(?:(?:le|la|les|un|une|des)\\s+|l['’])?${BEFORE_ROLE}`, "iu"),
  // « il devient administrateur », « elle ne devient administratrice » ; l'article indéfini reste à l'impersonnel (« il reste un administrateur »)
  new RegExp(`${word("il|elle")}\\s+${NEGATION_AND_CLITIC}${word(ATTRIBUTIVE_VERBS)}${BETWEEN}\\s+(?:(?:le|la)\\s+|l['’])?${BEFORE_ROLE}`, "iu"),
  // l'apposition : « Administrateur de la page, vous… »
  new RegExp(`^(?:${ROLE_NOUNS})(?!\\p{L})[^.]{0,40}, vous(?!\\p{L})`, "iu"),
  // « vous » complément d'un participe accordé : « les responsables vous ont exclu »
  new RegExp(`${word("vous")}\\s+(?:a|ont)\\s+${word("exclue?|nommée?|invitée?|désignée?")}`, "iu"),
]

const isGenderedAttribute = (text: string) => GENDERED_ATTRIBUTES.some((pattern) => pattern.test(text))

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

  it("français : un mot élidable s'élide devant un nom inséré, par son format (« au nom d’Amicale », « qu’Amina »)", () => {
    const faults = [...FR].filter(([, text]) => UNELIDED.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
    expect(variables("Publier au nom {{name, de}}")).toEqual(["name"])
    expect(variables("Publier au nom {{name, de(capital: true)}}")).toEqual(["name"])
    for (const sample of ["Publier au nom de {{name}}", "J’accepte que {{name}} voie", "Jusque {{page}}", "Que {{name}} accepte"]) expect(UNELIDED.test(sample), sample).toBe(true)
    for (const sample of ["Publier au nom {{name, de}}", "J’accepte {{name, que}} voie", "le {{date}}", "de {{min}} à {{max}}"]) expect(UNELIDED.test(sample), sample).toBe(false)
  })

  it("français : une phrase qui emploie un format d'élision n'a que des apostrophes typographiques", () => {
    const faults = [...FR].filter(([, text]) => ELISION_FORMAT.test(text) && text.includes("'"))
    expect(faults.map(([key]) => key)).toEqual([])
    expect(ELISION_FORMAT.test("l’équipe {{name, de(capital: true)}}")).toBe(true)
  })

  it("les formats d'élision n'existent qu'en français", () => {
    const faults = [...EN].filter(([, text]) => ELISION_FORMAT.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
  })

  it("français : un rôle ne s'accorde jamais à une personne dont on ignore le genre", () => {
    // Recette moteur du 20/11/2026 : « Béatrice MOUSSAVOU est administrateur dès maintenant. »
    // Les NOMS de rôle restent des étiquettes (« Administrateur », « Éditeur ») ; attribués à une
    // personne (« vous », un nom inséré, « il », « elle »), ils passent par un verbe ou une tournure neutre.
    const faults = [...FR].filter(([, text]) => isGenderedAttribute(text))
    expect(faults.map(([key]) => key)).toEqual([])
    for (const sample of [
      "{{name}} est administrateur dès maintenant.",
      "{{name}} est nommé administrateur.",
      "Vous êtes éditeur de cette page.",
      "Vous êtes administratrice de la page.",
      "Vous voilà administrateur.",
      "Page inscrite : vous en êtes l'administrateur.",
      "Vous êtes le dernier administrateur.",
      "Vous n’êtes plus modératrice du groupe.",
      "Vous êtes propriétaire ou modérateur du groupe.",
      "Il devient administrateur immédiatement.",
      "Elle ne devient administratrice qu’après l’avoir acceptée.",
      "La personne deviendra administrateur en l’acceptant.",
      "Administrateur de la page, vous traitez les demandes.",
      "Les responsables vous ont exclu de cette association.",
    ]) expect(isGenderedAttribute(sample), sample).toBe(true)
    for (const sample of [
      "Ce fichier est exclu de l’export.",
      "Le rôle reste modérateur.",
      "Seul un administrateur peut demander la vérification.",
      "S’il reste un administrateur, la page continue.",
      "Administrateur",
      "Vous administrez la page.",
      "{{name}} administre la page dès maintenant.",
      "Vous êtes membre de l’équipe de cette page.",
      "Vous êtes signataire de cette page.",
    ]) expect(isGenderedAttribute(sample), sample).toBe(false)
  })

  it("anglais : aucune espace avant la ponctuation haute", () => {
    const faults = [...EN].filter(([, text]) => /[  ][:;?!]/.test(text))
    expect(faults.map(([key]) => key)).toEqual([])
  })
})
