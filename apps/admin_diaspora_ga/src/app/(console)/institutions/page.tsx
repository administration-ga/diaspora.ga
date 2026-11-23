import type { Metadata } from "next"

import { InstitutionsSection } from "@/components/institutions-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.institutions") }
}

/** Institutions et pages officielles (groupe Communauté) : créer, désigner le signataire, mettre en sommeil ou réveiller, sous la clé « pages ». */
export default function InstitutionsPage() {
  return <InstitutionsSection />
}
