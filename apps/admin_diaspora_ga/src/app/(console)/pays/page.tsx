import type { Metadata } from "next"

import { CountriesSection } from "@/components/countries-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.countries") }
}

/** Pays ouverts (groupe Communauté) : ouvrir un pays dont l'équipe a un modérateur actif, relais attestés ; fermer. */
export default function CountriesPage() {
  return <CountriesSection />
}
