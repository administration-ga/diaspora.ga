import type { Metadata } from "next"

import { MetricsSection } from "@/components/metrics-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.metrics") }
}

/** Mesure (groupe Pilotage) : les indicateurs du pilote, par période et par pays, sous la clé « pilotMetrics ». */
export default function MetricsPage() {
  return <MetricsSection />
}
