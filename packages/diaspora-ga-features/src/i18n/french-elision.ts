/**
 * L'élision d'un mot devant un nom inséré dans une phrase française : « l’équipe d’Amicale de
 * Lyon », « J’accepte qu’Amina… », mais « au nom de Saveurs de Lille » et « de Hôtel… ».
 *
 * UN seul mécanisme pour toutes les phrases : un format i18next par mot élidable, posé sur la
 * variable du nom, bâtit le fragment entier, mot compris. La phrase française l'écrit ainsi :
 * « Publier au nom {{name, de}} », « J’accepte {{name, que}} voie… » ; en début de phrase,
 * « {{name, de(capital: true)}} » rend « De … » ou « D’… ». L'anglais n'emploie jamais ces
 * formats, et une phrase qui en emploie un n'a que des apostrophes typographiques (cliquets de
 * `locales.test.ts`).
 *
 * Règle retenue : le mot s'élide devant une voyelle, accentuée ou non (« Ángela », « Œuvres »),
 * ligatures comprises ; devant « y » suivi d'une consonne (« Yvette »), jamais devant « y » suivi
 * d'une voyelle, qui sonne en consonne (« Yannick », « Yaoundé ») ; jamais devant « h » (muet ou
 * aspiré, on ne le devine pas d'un nom propre). Apostrophe typographique « ’ ».
 */
import type { i18n as I18nInstance } from "i18next"

/** Les mots qui s'élident devant une voyelle ; chacun est le nom de son format (`{{name, que}}`). */
export const ELIDABLE_WORDS = ["de", "que", "jusque", "lorsque", "puisque", "le", "la", "ne", "je", "me", "te", "se"] as const

export type ElidableWord = (typeof ELIDABLE_WORDS)[number]

/** Voyelles sans leurs accents (le nom est décomposé avant le test), et les ligatures. */
const VOWEL = /[aeiouæœ]/u

/** La première lettre décomposée, sans ses signes diacritiques, en minuscule (« Á » → « a »). */
function baseLetter(character: string | undefined): string {
  return (character ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** Le nom commence-t-il par un son voyelle devant lequel le mot s'élide ? */
function elidesBefore(name: string): boolean {
  const [first, second] = Array.from(name)
  const initial = baseLetter(first)
  if (VOWEL.test(initial)) return true
  // « y » suivi d'une consonne se lit en voyelle (« Yvette ») ; suivi d'une voyelle, en consonne (« Yannick »).
  if (initial === "y") {
    const next = baseLetter(second)
    return /\p{L}/u.test(next) && !VOWEL.test(next) && next !== "y"
  }
  return false
}

/** Le fragment « mot nom » ou « m’nom » ; `capital` pour un début de phrase (« De », « Qu’ »). */
export function frenchElide(word: ElidableWord, name: string, options: { readonly capital?: boolean } = {}): string {
  const fragment = elidesBefore(name) ? `${word.slice(0, -1)}’${name}` : `${word} ${name}`
  return options.capital === true ? `${fragment.charAt(0).toUpperCase()}${fragment.slice(1)}` : fragment
}

/** Les options d'un format telles qu'i18next les passe : `capital: true` écrit dans la phrase arrive en booléen. */
interface ElisionFormatOptions {
  readonly capital?: unknown
}

/**
 * Inscrit un format par mot élidable dans une instance i18next initialisée. Les formats ne
 * regardent pas la langue : ils ne sont écrits que dans les phrases françaises. Une instance sans
 * formateur est une erreur de montage, dite tout haut : sans format, « {{name, de}} » rendrait
 * « au nom Amicale » sans que personne ne le voie.
 */
export function registerFrenchFormats(instance: I18nInstance): I18nInstance {
  const formatter = instance.services.formatter
  if (!formatter) throw new Error("i18n : l'instance n'a pas de formateur, les formats d'élision ne peuvent pas s'inscrire.")
  for (const word of ELIDABLE_WORDS) {
    formatter.add(word, (value: unknown, _lng: string | undefined, options: ElisionFormatOptions | undefined) =>
      frenchElide(word, String(value), { capital: options?.capital === true }),
    )
  }
  return instance
}
