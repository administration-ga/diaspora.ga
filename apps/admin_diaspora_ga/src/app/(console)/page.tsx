import type { Metadata } from "next"

import { DashboardSection } from "@/components/dashboard-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.dashboard") }
}

/** Tableau de bord (groupe Pilotage). */
export default function DashboardPage() {
  return <DashboardSection />
}
