// Dupliqué de apps/diaspora_ga/src/ratchets/i18n-keys.test.ts @ 237b585 — adaptations : espace `admin` d'admin.diaspora.ga, lu dans l'application ; familles dynamiques tirées du registre des sections ; parité fr/en des clés et des variables tenue ici (diaspora.ga la tient dans le paquet de surfaces).
import { describe, expect, it } from "vitest"

import { SECTION_GROUP_KEYS, SECTIONS } from "@/lib/sections"

import { productSources, readLocale, type LocaleTree } from "./sources"

/**
 * Cliquet i18n d'admin.diaspora.ga — chaque clé citée existe, chaque clé existante sert,
 * et le français et l'anglais portent les mêmes clés et les mêmes `{{variables}}`.
 *  · une clé citée en toutes lettres (`t("…")`, objet, ternaire) doit exister ;
 *  · les libellés du menu viennent du registre des sections (groupes et sections) ;
 *  · aucune clé de la locale n'est morte.
 */
function flatten(tree: LocaleTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === "string" ? [[path, value] as [string, string]] : flatten(value, path)
  })
}

const FR = new Map(flatten(readLocale("fr")))
const EN = new Map(flatten(readLocale("en")))
const KEYS = new Set(FR.keys())
const NAMESPACES = new Set([...KEYS].map((key) => key.split(".")[0]))
const exists = (key: string) => KEYS.has(key) || KEYS.has(`${key}_one`)

const code = productSources([".ts", ".tsx"])
  .map((file) => file.text)
  .join("\n")

/** Toute chaîne littérale qui a la forme d'une clé d'un espace connu. */
const literalKeys = new Set(
  [...code.matchAll(/["'`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)["'`]/g)].map((match) => match[1]!).filter((candidate) => NAMESPACES.has(candidate.split(".")[0]!)),
)

/** Les libellés du menu, lus dans le registre (qui les cite aussi en toutes lettres). */
const FAMILIES: string[] = [...Object.values(SECTION_GROUP_KEYS), ...SECTIONS.map((section) => section.labelKey)]

const variables = (sentence: string) => [...sentence.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((match) => match[1]).sort()

describe("cliquet i18n d'admin.diaspora.ga — clés", () => {
  it("relit bien les sources et la locale", () => {
    expect(literalKeys.size).toBeGreaterThan(30)
    expect(KEYS.has("signIn.idn")).toBe(true)
  })

  it("chaque clé citée dans les sources existe dans la locale", () => {
    expect([...literalKeys].filter((key) => !exists(key)).sort()).toEqual([])
  })

  it("chaque libellé du menu existe", () => {
    expect(FAMILIES.filter((key) => !exists(key))).toEqual([])
  })

  it("aucune clé de la locale n'est morte", () => {
    const covered = new Set([...literalKeys, ...FAMILIES])
    expect([...KEYS].filter((key) => !covered.has(key) && !covered.has(key.replace(/_(one|other)$/, "")))).toEqual([])
  })

  it("le français et l'anglais portent les mêmes clés, et chaque phrase les mêmes variables", () => {
    expect([...EN.keys()].sort()).toEqual([...FR.keys()].sort())
    const mismatched = [...FR.entries()].filter(([key, sentence]) => JSON.stringify(variables(sentence)) !== JSON.stringify(variables(EN.get(key) ?? "")))
    expect(mismatched.map(([key]) => key)).toEqual([])
    expect([...EN.values()].filter((sentence) => sentence.trim() === "")).toEqual([])
  })
})
