"use client"

/**
 * Le branchement de diaspora.ga sur le moteur ANTSIA (PD2) : client Convex du
 * moteur, session Better Auth par le proxy `/api/auth/*` de cette origine,
 * création de la personne à la première session (`ensureMyPerson`, rien n'est
 * recopié ni publié), puis la source de données « moteur » pour tout l'arbre.
 */
import type { RefreshableCrossDomainAuthClient } from "@antsia/api/cross-domain-session-bootstrap"
import { EngineConvexProvider } from "@antsia/api/next-provider"
import { api } from "@convex/_generated/api"
import { GatedDataSourceProvider } from "@diaspora-ga/features/data"
import { DEFAULT_LOCALE, isSupportedLocale } from "@diaspora-ga/features/i18n"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useConvex } from "convex/react"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { EngineIcom } from "@/components/icom"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/env"

import { createEngineDataSource } from "./engine-source"

/** La source « moteur », créée une fois, sous le client Convex du moteur, gardée par les fonctionnalités ouvertes. */
function EngineSource(props: { children: ReactNode }) {
  const convex = useConvex()
  // La langue affichée, tenue à jour à chaque rendu : la source, créée une fois, la relit à
  // chaque demande de code. L'objet `i18n` de react-i18next est une copie figée par langue :
  // il ne peut pas servir de lecteur.
  const { locale } = useDiasporaGaT()
  const displayed = useRef(locale)
  useEffect(() => {
    displayed.current = locale
  }, [locale])
  const [source] = useState(() =>
    createEngineDataSource({
      convex,
      authClient,
      locale: () => (isSupportedLocale(displayed.current) ? displayed.current : DEFAULT_LOCALE),
      // CH-817 : l'origine des actions HTTP du moteur, où le navigateur appelle la porte des comptes de démonstration.
      convexSiteUrl: publicEnv.convexSiteUrl,
    }),
  )
  // ADR-0041 du moteur : les fonctionnalités ouvertes lues avant la coque ; les modules fermés n'y sont pas montés.
  return <GatedDataSourceProvider source={source}>{props.children}</GatedDataSourceProvider>
}

export function EngineDataProviders(props: { children: ReactNode }) {
  const { t } = useDiasporaGaT()
  if (!publicEnv.convexUrl) {
    // Moteur non configuré (variable absente) : un avertissement plutôt qu'un écran blanc.
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
        <p role="alert" className="rounded-xl bg-card p-4 text-card-foreground shadow-sm">
          {t("engine.backendMissing")}
        </p>
      </main>
    )
  }
  return (
    <EngineConvexProvider
      convexUrl={publicEnv.convexUrl}
      authClient={authClient as unknown as RefreshableCrossDomainAuthClient}
      ensurePerson={api.modules.people.persons.ensureMyPerson}
      isSessionActive={api.modules.platform.authentication.mySession}
      labels={{ loading: t("engine.sessionLoading"), failed: t("engine.sessionFailed"), retry: t("engine.sessionRetry") }}
    >
      <EngineSource>
        {/* iCom (PD7) : la couche de communication du moteur, montée une fois, à côté des pages. */}
        <EngineIcom>{props.children}</EngineIcom>
      </EngineSource>
    </EngineConvexProvider>
  )
}
