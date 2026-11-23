import type { Metadata } from "next"

import { FoundersSection } from "@/components/founders-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.founders") }
}

/** Fondateurs (groupe Communauté) : la cohorte plafonnée, admettre un membre déjà entré, retirer une admission. */
export default function FoundersPage() {
  return <FoundersSection />
}
