import { BrandLogo } from "@diaspora-ga/features/brand/logo"
import { mobileStoreLinks, routes } from "@/lib/routes"
import { getAppT } from "@/i18n/server"
import { ConsulateBrowserLink } from "@/components/consulate-browser-link"

export const dynamic = "force-dynamic"

export default async function InstallPage() {
  const { t } = await getAppT()
  const { ios, android } = mobileStoreLinks(process.env.DIASPORA_APPLE_STORE_ID, process.env.DIASPORA_PLAY_STORE_LIVE === "true")
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
    <h1><BrandLogo variant="horizontal" className="w-full max-w-80" /></h1>
    <p>{t("consulateGateway.passage.downloadIntro")}</p>
    <ConsulateBrowserLink />
    <a className="text-center underline" href={routes.consulatePass() + "?secours=idn"}>{t("consulateGateway.arrival.continueIdn")}</a>
    {ios && <a className="underline" href={ios}>{t("consulateGateway.passage.ios")}</a>}
    {android && <a className="underline" href={android}>{t("consulateGateway.passage.android")}</a>}
    {(!ios || !android) && <p className="text-sm">{!ios && !android ? t("consulateGateway.passage.later") : !ios ? t("consulateGateway.passage.laterIos") : t("consulateGateway.passage.laterAndroid")}</p>}
  </main>
}
