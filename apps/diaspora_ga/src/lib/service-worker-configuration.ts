import { getFixedT } from "@diaspora-ga/features/i18n"

import { NOTIFICATION_REFERENCE_PARAM, routes } from "./routes"
import { OFFLINE_CACHE_PREFIX, SERVICE_WORKER_VERSION } from "./service-worker"
import type { ServiceWorkerConfiguration } from "./service-worker-script"

/**
 * La configuration du script de fond (MO-05) : textes de l'i18n (titre de la marque, phrase
 * neutre en français et en anglais), adresses de la table des routes. DS-14 (ouverture) : un clic
 * sur une notification ouvre la porte d'ouverture avec la seule référence opaque du moteur ; sans
 * référence lisible, la page des notifications.
 */
export function serviceWorkerConfiguration(): ServiceWorkerConfiguration {
  const fr = getFixedT("fr")
  const en = getFixedT("en")
  return {
    version: SERVICE_WORKER_VERSION,
    cachePrefix: OFFLINE_CACHE_PREFIX,
    offlinePath: routes.offline(),
    title: fr("brand.name"),
    messages: { fr: fr("installableApp.notificationBody"), en: en("installableApp.notificationBody") },
    tagPrefix: "diaspora-ga-notification-",
    openPath: routes.openNotification(),
    fallbackPath: routes.notifications(),
    referenceParam: NOTIFICATION_REFERENCE_PARAM,
  }
}
