import type { Metadata } from "next"

import { SignInScreen } from "@/components/sign-in-screen"
import { getAppT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAppT()
  // `absolute` : le titre de la page est déjà le nom de l'application, le gabarit racine ne le redouble pas.
  return { title: { absolute: t("signIn.title") } }
}

/** Connexion par identité numérique seule (D3), hors du gabarit gardé. */
export default function SignInPage() {
  return <SignInScreen />
}
