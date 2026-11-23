import type { Metadata } from "next"

import { TeamSection } from "@/components/team-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.team") }
}

/** Équipe et responsables (groupe Confiance) : les responsables du réseau et les équipes de modération. */
export default function TeamPage() {
  return <TeamSection />
}
