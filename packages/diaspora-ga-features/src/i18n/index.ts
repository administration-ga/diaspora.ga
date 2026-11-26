/**
 * i18n de DIASPORA.GA — l'instance i18next du MOTEUR (`@antsia/social-features/i18n`),
 * à laquelle DIASPORA.GA fournit son espace de noms `diaspora-ga`. L'application
 * reçoit en plus les espaces du moteur (`social`, codes serveur `errors` et
 * `rules`) : rien à recâbler quand les surfaces du moteur arrivent (PD4).
 *
 * Aucune chaîne d'interface hors des fichiers de locale (cliquet
 * `no-hardcoded-strings`) ; le français et l'anglais portent les mêmes clés et
 * les mêmes `{{variables}}` (cliquet `i18n-locales`).
 */
import {
  createAppI18n as createEngineI18n,
  DEFAULT_LOCALE,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  type AppResources,
  type Locale,
} from "@antsia/social-features/i18n"
import { PAGE_SLEEP_DAYS } from "@antsia/social-domain/pages"
import { PUBLISHER_TEXT_VARIABLES } from "@diaspora-ga/domain"
import type { i18n as I18nInstance } from "i18next"

import { DIASPORA_GA_ENGINE_RESOURCES } from "./engine-overrides"
import { registerFrenchFormats } from "./french-elision"
import { MEDIA_LIMIT_VARIABLES } from "./media-limits"
import { DIASPORA_GA_LOCALES } from "./resources"

export { DEFAULT_LOCALE, isSupportedLocale, SUPPORTED_LOCALES, type AppResources, type Locale }
export { DIASPORA_GA_LOCALES, LOCALE_PARTS, mergeLocaleParts, type LocaleTree } from "./resources"
export { formatNames, MEDIA_LIMIT_VARIABLES, megabytes } from "./media-limits"

/** Cookie de langue : lu par le rendu serveur, posé par le sélecteur de langue. */
export const LOCALE_COOKIE = "diaspora-ga-langue"

export const DIASPORA_GA_NAMESPACE = "diaspora-ga"

/** La marque, variable `{{brand}}` des textes du moteur. */
export const DIASPORA_GA_BRAND = "DIASPORA.GA"

/**
 * AS-11a : la durée du sommeil d'une page, celle du moteur, dite par un refus que l'écran
 * traduit sans paramètre (`errors.page_sleep_expired`). Un nom propre, jamais `days` : une
 * phrase qui oublierait de passer ses jours ne recevrait pas trente en silence.
 */
export const PAGE_RULE_VARIABLES = { pageSleepDays: String(PAGE_SLEEP_DAYS) } as const satisfies Record<string, string>

/** Les ressources de l'espace de noms `diaspora-ga`, par langue (fichier principal et fragments fusionnés). */
export const diasporaGaResources: AppResources = {
  fr: { [DIASPORA_GA_NAMESPACE]: DIASPORA_GA_LOCALES.fr },
  en: { [DIASPORA_GA_NAMESPACE]: DIASPORA_GA_LOCALES.en },
}

/**
 * Instance i18next ISOLÉE (une par requête côté serveur, une par arbre côté
 * client), construite par le moteur : ressources en mémoire, initialisation
 * synchrone, aucun écart d'hydratation. Les bornes des médias y entrent comme
 * variables par défaut, tirées du domaine du moteur (`MEDIA_LIMIT_VARIABLES`) ;
 * l'élision de « de » devant un nom, comme format (`{{name, de}}`, `french-elision`).
 *
 * Les espaces de noms du moteur que DIASPORA.GA dit autrement (le « live » plutôt que la
 * « conférence », `engine-overrides`) passent avant ceux de l'application : le moteur les reçoit
 * recomposés et les sert à ses surfaces (création d'un live, page du live, carte flottante).
 */
export function createAppI18n(options: { locale: Locale; appResources?: AppResources; defaultNS?: string }): I18nInstance {
  const appResources = {} as AppResources
  for (const locale of SUPPORTED_LOCALES) {
    appResources[locale] = { ...DIASPORA_GA_ENGINE_RESOURCES[locale], ...diasporaGaResources[locale], ...options.appResources?.[locale] }
  }
  // Le format `de` des phrases françaises (« au nom d’Amicale ») : inscrit sur chaque instance.
  return registerFrenchFormats(createEngineI18n({
    locale: options.locale,
    appResources,
    defaultNS: options.defaultNS ?? DIASPORA_GA_NAMESPACE,
    // L'identité de l'éditeur (`{{publisherRccm}}`…) : un fait du domaine, cité par les textes du site.
    defaultVariables: { brand: DIASPORA_GA_BRAND, ...MEDIA_LIMIT_VARIABLES, ...PAGE_RULE_VARIABLES, ...PUBLISHER_TEXT_VARIABLES },
  }))
}

/** Traduction hors React (serveur, métadonnées, tests). */
export function getFixedT(locale: Locale) {
  return createAppI18n({ locale }).getFixedT(locale, DIASPORA_GA_NAMESPACE)
}
