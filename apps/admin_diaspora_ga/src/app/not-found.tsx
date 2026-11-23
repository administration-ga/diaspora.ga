import type { Metadata } from "next"
import NextLink from "next/link"

import { getAppT } from "@/i18n/server"
import { anchors, routes } from "@/lib/routes"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("notFound.title") }
}

/** Adresse inconnue : une phrase, et le chemin du tableau de bord (la garde y relit les droits). */
export default async function NotFound() {
  const { t } = await getAppT()
  return (
    <main id={anchors.contentId} className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl font-bold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.lead")}</p>
      <NextLink className="inline-flex min-h-11 items-center self-start rounded-md text-primary underline underline-offset-4 focus-visible:shadow-focus" href={routes.dashboard()}>
        {t("notFound.back")}
      </NextLink>
    </main>
  )
}
