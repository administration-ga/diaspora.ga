import type { Metadata } from "next"

import { JournalSection } from "@/components/journal-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.journal") }
}

/** Journal (groupe Pilotage) : qui a décidé quoi, quand, à quel titre et avec quel motif ; filtre par action. */
export default function JournalPage() {
  return <JournalSection />
}
