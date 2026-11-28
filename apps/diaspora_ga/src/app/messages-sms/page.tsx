import type { Metadata } from "next"
import { Suspense } from "react"

import { GateSkeleton } from "@/components/gate"
import { getAppT } from "@/i18n/server"
import { SmsScreen } from "@/screens/sms-screen"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("sms.title"), robots: { index: false, follow: false } }
}

export default function SmsMessagesPage() {
  return <Suspense fallback={<GateSkeleton />}><SmsScreen /></Suspense>
}
