import type { Metadata } from "next"

import { getAppT } from "@/i18n/server"
import { parseNotificationReference } from "@/lib/notification-open"
import { NOTIFICATION_REFERENCE_PARAM } from "@/lib/routes"
import { NotificationOpenScreen } from "@/screens/notification-open-screen"

/** La référence de la notification est dans l'adresse : elle ne part vers aucun autre site. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("notificationOpen.title"), referrer: "no-referrer" }
}

/**
 * DS-14 (ouverture) — la porte d'une notification poussée : le script de fond y mène avec la seule
 * référence opaque du moteur (`?reference=`) ; toute autre forme est écartée avant l'écran.
 */
export default async function NotificationOpenPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams
  return <NotificationOpenScreen reference={parseNotificationReference(params[NOTIFICATION_REFERENCE_PARAM])} />
}
