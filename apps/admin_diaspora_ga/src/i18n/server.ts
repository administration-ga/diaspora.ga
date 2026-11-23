import { createAppI18n, DEFAULT_LOCALE, type Locale } from "@diaspora-ga/features/i18n"
import { headers } from "next/headers"

import { localeFromAcceptLanguage } from "./accept-language"
import { APP_NAMESPACE, appResources } from "./resources"

/** La langue de la requête : celle du navigateur si elle est prise en charge, sinon le français. */
export async function getRequestLocale(): Promise<Locale> {
  return localeFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE
}

/**
 * Traduction côté serveur (composants serveur, métadonnées). Une instance par
 * appel : aucune langue ne fuit d'une requête à l'autre.
 */
export async function getAppT() {
  const locale = await getRequestLocale()
  const i18n = createAppI18n({ locale, appResources, defaultNS: APP_NAMESPACE })
  const t = i18n.getFixedT(locale, APP_NAMESPACE)
  return { locale, t: (key: string, options: Record<string, unknown> = {}) => t(key, options) }
}
