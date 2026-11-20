/**
 * L'élision de « de » devant un nom inséré dans une phrase française : « l'équipe d’Amicale de
 * Lyon », « au nom d’Yvette MBA », mais « au nom de Saveurs de Lille » et « de Hôtel… ».
 *
 * UN seul mécanisme pour toutes les phrases : le format i18next `de`, posé sur la variable du nom
 * (`{{name, de}}`), bâtit le fragment entier, « de » compris. La phrase française l'écrit ainsi :
 * « Publier au nom {{name, de}} » ; en début de phrase, « {{name, de(capital: true)}} » rend
 * « De … » ou « D’… ». L'anglais n'emploie jamais ce format (cliquet `locales.test.ts`).
 *
 * Règle retenue : « de » s'élide devant une voyelle, accentuée ou non, ligatures et « y »
 * compris ; jamais devant « h » (muet ou aspiré, on ne le devine pas d'un nom propre). Apostrophe
 * typographique « ’ », comme les textes de DIASPORALE.
 */
import type { i18n as I18nInstance } from "i18next"

/** Le nom du format, tel que les textes l'écrivent (`{{name, de}}`). */
export const FRENCH_DE_FORMAT = "de"

/** Une initiale devant laquelle « de » s'élide. */
const ELIDING_INITIAL = /^[aeiouyàâäæéèêëîïôöœùûüÿ]/iu

/** Le fragment « de nom » ou « d’nom » ; `capital` pour un début de phrase (« De », « D’ »). */
export function frenchDe(name: string, options: { readonly capital?: boolean } = {}): string {
  const elided = ELIDING_INITIAL.test(name)
  const preposition = elided ? "d’" : "de "
  const fragment = `${preposition}${name}`
  return options.capital === true ? `${fragment.charAt(0).toUpperCase()}${fragment.slice(1)}` : fragment
}

/** Les options du format telles qu'i18next les passe : `capital: true` écrit dans la phrase arrive en booléen. */
interface DeFormatOptions {
  readonly capital?: unknown
}

/**
 * Inscrit le format `de` dans une instance i18next initialisée. Le format ne regarde pas la
 * langue : il n'est écrit que dans les phrases françaises.
 */
export function registerFrenchFormats(instance: I18nInstance): I18nInstance {
  instance.services.formatter?.add(FRENCH_DE_FORMAT, (value: unknown, _lng: string | undefined, options: DeFormatOptions | undefined) =>
    frenchDe(String(value), { capital: options?.capital === true }),
  )
  return instance
}
