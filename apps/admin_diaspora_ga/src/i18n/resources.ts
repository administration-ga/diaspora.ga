import type { AppResources } from "@diaspora-ga/features/i18n"

import enAdmin from "./locales/en/admin.json"
import frAdmin from "./locales/fr/admin.json"

/**
 * L'espace de noms `admin` d'admin.diaspora.ga, servi par l'instance i18n de
 * DIASPORA.GA (`@diaspora-ga/features/i18n` : marque `{{brand}}`, espaces du moteur
 * dont `identity`). Aucune chaîne d'interface hors de ces fichiers ; le français et
 * l'anglais portent les mêmes clés et les mêmes variables (cliquet local des clés).
 */
export const APP_NAMESPACE = "admin"

export const appResources: AppResources = {
  fr: { [APP_NAMESPACE]: frAdmin },
  en: { [APP_NAMESPACE]: enAdmin },
}
