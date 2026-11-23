import type { Metadata } from "next"

import { ModulesSection } from "@/components/modules-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.modules") }
}

/** Modules (groupe Application des membres) : ouvrir ou fermer les volets du menu des membres, motif à l'appui. */
export default function ModulesPage() {
  return <ModulesSection />
}
