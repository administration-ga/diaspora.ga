import type { Metadata } from "next"

import { SignInScreen } from "@/components/sign-in-screen"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  return { title: t("signIn.title") }
}

/** Connexion par identité numérique seule (D3), hors du gabarit gardé. */
export default function SignInPage() {
  return <SignInScreen />
}
