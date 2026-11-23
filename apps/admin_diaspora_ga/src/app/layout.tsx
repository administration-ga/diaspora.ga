import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { AppearanceBootScript } from "@/components/appearance-boot-script"
import { Providers } from "@/components/providers"
import { getAppT } from "@/i18n/server"
import { DEFAULT_CHARTE } from "@/lib/appearance"
import { anchors } from "@/lib/routes"

import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return {
    title: { default: t("meta.title"), template: t("meta.titleTemplate") },
    description: t("meta.description"),
    // Une console d'administration ne s'indexe pas.
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

/**
 * Racine d'admin.diaspora.ga. La charte `diaspora-ga` est posée sur <html> (D6) ; le
 * script d'amorçage y pose, avant le premier affichage, le mode de l'appareil (classe
 * `dark`), que le fournisseur d'apparence tient ensuite. Les portails (feuille du menu,
 * avis) héritent donc des jetons.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getAppT()
  return (
    <html lang={locale} data-charte={DEFAULT_CHARTE} suppressHydrationWarning>
      <head>
        <AppearanceBootScript />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <a
          href={anchors.content}
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-float"
        >
          {t("a11y.skipToContent")}
        </a>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  )
}
