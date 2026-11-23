"use client"

import type { RefreshableCrossDomainAuthClient } from "@antsia/api/cross-domain-session-bootstrap"
import { EngineConvexProvider } from "@antsia/api/next-provider"
import { AppearanceProvider } from "@antsia/social-features/shell/appearance"
import { api } from "@convex/_generated/api"
import type { Locale } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Toaster } from "sonner"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { APPEARANCE } from "@/lib/appearance"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/env"

/**
 * La session du moteur : client Convex, session Better Auth par le proxy `/api/auth/*`
 * de cette origine, personne du moteur à la première session (rien n'est recopié ni
 * publié). Sans moteur configuré, les pages restent lisibles (santé) et la garde dit
 * le manque.
 */
function SessionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(APP_NAMESPACE)
  if (!publicEnv.convexUrl) return <>{children}</>
  return (
    <EngineConvexProvider
      convexUrl={publicEnv.convexUrl}
      authClient={authClient as unknown as RefreshableCrossDomainAuthClient}
      ensurePerson={api.modules.people.persons.ensureMyPerson}
      isSessionActive={api.modules.platform.authentication.mySession}
      labels={{ loading: t("session.loading"), failed: t("session.failed"), retry: t("session.retry") }}
    >
      {children}
    </EngineConvexProvider>
  )
}

/** Les avis passagers (sonner), sur les jetons du thème. */
function AdminToaster() {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Toaster
      position="bottom-right"
      closeButton
      containerAriaLabel={t("notice.region")}
      toastOptions={{
        closeButtonAriaLabel: t("notice.close"),
        classNames: {
          toast: "!rounded-xl !border-0 !bg-popover !text-popover-foreground !shadow-float !font-sans",
          description: "!text-muted-foreground",
          closeButton: "min-h-11 min-w-11",
        },
      }}
    />
  )
}

/**
 * Fournisseurs de l'application : apparence du moteur (thème `diaspora-ga`, mode de
 * l'appareil), i18n de DIASPORA.GA avec l'espace `admin`, puis la session du moteur.
 * Aucune source de démonstration (D1) ; l'application n'est inscrite à aucun registre
 * de notifications (D6).
 */
export function Providers(props: { locale: Locale; children: ReactNode }) {
  return (
    <AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes}>
      <I18nProvider locale={props.locale} appResources={appResources} defaultNS={APP_NAMESPACE}>
        <SessionProvider>{props.children}</SessionProvider>
        <AdminToaster />
      </I18nProvider>
    </AppearanceProvider>
  )
}
