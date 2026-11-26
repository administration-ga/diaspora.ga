import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getAppT } from "@/i18n/server"
import { publicEnv } from "@/lib/env"
import { conferenceRouteServed, conferenceSessionId } from "@/lib/live"
import { ConferenceScreen } from "@/screens/icom-screens"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("live.title") }
}

/**
 * `routes.conference` — la page d'un direct (conférences du moteur, CH-817). Servie depuis
 * l'ouverture de l'interrupteur du direct (`lib/live.ts`, 26/11/2026) ; introuvable s'il est
 * refermé, et toujours avec la démonstration de ce navigateur, qui n'a ni serveur vidéo ni
 * session : rien n'y mène, rien n'y répond.
 */
export default async function ConferencePage(props: { params: Promise<{ id: string }> }) {
  if (!conferenceRouteServed(publicEnv.dataSource)) notFound()
  const sessionId = conferenceSessionId((await props.params).id)
  if (sessionId === null) notFound()
  return <ConferenceScreen sessionId={sessionId} />
}
