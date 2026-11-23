import type { Metadata } from "next"

import { MenuPreviewSection } from "@/components/menu-preview-section"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("nav.section.menuPreview") }
}

/** Aperçu du menu (groupe Application des membres) : le menu exact des membres pour des modules cochés, sans rien écrire. */
export default function MenuPreviewPage() {
  return <MenuPreviewSection />
}
