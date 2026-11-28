import { GuestEntry } from "@/components/guest-reader"
import type { Metadata } from "next"

import { getAppT } from "@/i18n/server"
import { PageScreen } from "@/screens/page-screen"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("page.metaTitle") }
}

export default async function OrganizationPage(props: { params: Promise<{ handle: string }> }) {
  const { handle } = await props.params
  return <GuestEntry screen="page" target={handle}><PageScreen handle={handle} /></GuestEntry>
}
