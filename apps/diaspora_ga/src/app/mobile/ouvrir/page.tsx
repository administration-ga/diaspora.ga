import { BrandLogo } from "@diaspora-ga/features/brand/logo"
import { getAppT } from "@/i18n/server"
import { ConsulateBrowserLink } from "@/components/consulate-browser-link"

export const dynamic = "force-dynamic"

export default async function InstallPage() {
  const { t } = await getAppT()
  const id = process.env.DIASPORA_APPLE_STORE_ID
  const ios = id && /^[0-9]{6,12}$/.test(id) ? "https://apps.apple.com/app/id" + id : null
  const android = process.env.DIASPORA_PLAY_STORE_LIVE === "true"
    ? "https://play.google.com/store/apps/details?id=ga.diaspora.mobile" : null
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
    <h1><BrandLogo name="DIASPORA" variant="stacked" /></h1>
    <p>{t("consulateGateway.passage.downloadIntro")}</p>
    {ios && <a className="underline" href={ios}>{t("consulateGateway.passage.ios")}</a>}
    {android && <a className="underline" href={android}>{t("consulateGateway.passage.android")}</a>}
    {(!ios || !android) && <p className="text-sm">{!ios && !android ? t("consulateGateway.passage.later") : !ios ? t("consulateGateway.passage.laterIos") : t("consulateGateway.passage.laterAndroid")}</p>}
    <ConsulateBrowserLink />
  </main>
}
