"use client"

import { Button, Card, Skeleton, openingDestination, useRouting } from "@diaspora-ga/features"
import { useDataSource, useFeatureGate, useNotificationOpening, type MembershipView, type NotificationOpeningCapability } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import NextLink from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { AppShell } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { hrefServed } from "@/lib/network-features"
import { routes } from "@/lib/routes"

/**
 * `/notifications/ouvrir` — DS-14 (ouverture) : la porte d'une notification poussée, touchée sur
 * l'appareil. La notification ne porte qu'une référence opaque ; la porte la confie au fournisseur,
 * qui relit la destination pour la personne de la session, puis mène à la conversation, à la
 * publication ou à la fiche que l'avis désigne — la même destination que sa ligne dans la cloche.
 *
 * Réservée aux membres (la garde fait passer une personne sans session par l'entrée, puis la
 * ramène ici, référence comprise). Une référence illisible ou inconnue, l'avis d'un autre, un objet
 * qui ne se lit plus ou une rubrique fermée mènent tous à la page des notifications, sans rien dire
 * de plus. Rien n'est marqué lu. Seule une panne se dit, avec de quoi réessayer.
 */
export function NotificationOpenScreen(props: { reference: string | null }) {
  return (
    <Gate require="member">
      {(session) =>
        session.membership ? (
          <AppShell membership={session.membership}>
            <NotificationOpening membership={session.membership} reference={props.reference} />
          </AppShell>
        ) : null
      }
    </Gate>
  )
}

/** Un autre lecteur, une autre source ou une autre référence relit tout : aucune destination n'est réutilisée. */
function NotificationOpening({ membership, reference }: { membership: MembershipView; reference: string | null }) {
  const source = useDataSource()
  const capability = useNotificationOpening()
  const key = JSON.stringify([source.kind, membership.personId, reference])
  // Rien à relire (référence illisible, fournisseur qui ne pousse rien) : la page des notifications.
  if (capability === null || reference === null) return <OpeningRedirect key={key} to={routes.notifications()} />
  return <ResolvedOpening key={key} capability={capability} reference={reference} />
}

/** Remplace l'adresse une seule fois par destination : la porte ne reste pas dans l'historique. */
function useReplaceOnce(to: string | null) {
  const router = useRouter()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (to === null || done.current === to) return
    done.current = to
    router.replace(to)
  }, [to, router])
}

function OpeningRedirect({ to }: { to: string }) {
  useReplaceOnce(to)
  return <OpeningStatus />
}

function ResolvedOpening({ capability, reference }: { capability: NotificationOpeningCapability; reference: string }) {
  const { t } = useDiasporaGaT()
  const { routes: featureRoutes } = useRouting()
  const gate = useFeatureGate()
  const { state, retry } = capability.useOpening(reference)
  const fallback = routes.notifications()
  // Une rubrique fermée sur le réseau ne s'ouvre pas : le même repli. On attend de savoir ce qui est ouvert.
  const target = state.status === "ready" ? openingDestination(state.data, featureRoutes, fallback) : null
  const destination = target === null || !gate.ready ? null : hrefServed(gate, target) ? target : fallback
  useReplaceOnce(destination)

  if (state.status !== "error") return <OpeningStatus />
  return (
    <Card role="alert" className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 p-4">
      <h1 className="text-lg font-semibold">{t("notificationOpen.title")}</h1>
      <p>{t("notificationOpen.error")}</p>
      <Button variant="outline" onClick={retry}>
        {t("notificationsCenter.retry")}
      </Button>
      <NextLink href={fallback} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--esp-accent-deep)] hover:underline focus-visible:shadow-focus">
        {t("bell.seeAll")}
      </NextLink>
    </Card>
  )
}

function OpeningStatus() {
  const { t } = useDiasporaGaT()
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3" aria-busy="true">
      <p role="status" className="text-sm text-muted-foreground">
        {t("notificationOpen.loading")}
      </p>
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  )
}
