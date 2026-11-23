import type { Metadata } from "next"
import { Suspense } from "react"

import { GateSkeleton } from "@/components/gate"
import { getAppT } from "@/i18n/server"
import { MembersScreen } from "@/screens/members-screen"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("members.title") }
}

/** `/membres` — l'annuaire : la recherche par nom, et le parcours par pays et ville lu dans l'adresse (`?pays=`, `?ville=`). */
export default function MembersPage() {
  return (
    <Suspense fallback={<GateSkeleton />}>
      <MembersScreen />
    </Suspense>
  )
}
