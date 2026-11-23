import type { Metadata } from "next"

import { RulesSection } from "@/components/rules-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.rules") }
}

/** Règles (groupe Confiance) : relecture, liens, cadence par rubrique, et mots bloqués. */
export default function RulesPage() {
  return <RulesSection />
}
