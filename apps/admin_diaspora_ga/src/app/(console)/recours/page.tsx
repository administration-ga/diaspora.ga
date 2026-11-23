import type { Metadata } from "next"

import { AppealsSection } from "@/components/appeals-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.appeals") }
}

/** Recours (groupe Confiance) : les recours montés au réseau, jugés motif à l'appui. */
export default function AppealsPage() {
  return <AppealsSection />
}
