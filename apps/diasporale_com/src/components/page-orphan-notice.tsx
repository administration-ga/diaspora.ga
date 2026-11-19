"use client"

/**
 * AS-11a — le bandeau « Cette page n'a plus de responsable », sur la fiche d'une page,
 * pour tout lecteur. PROPRIÉTAIRE : chantier « gestion des pages ». La fiche (chantier
 * « pages ») le monte quand le fournisseur dit la page sans responsable (`orphan`).
 *
 * Une issue, et une seule :
 *   · page revendicable et gestion des pages servie : « Revendiquer cette page » (le
 *     bouton de l'en-tête s'efface alors, la fiche ne le dit pas deux fois) ; une
 *     revendication déjà en cours se dit à la place, sans second envoi ;
 *   · sinon (page vérifiée, reprise par la console) : écrire à l'équipe de DIASPORALE,
 *     par la route de contact du site.
 * Présentation seulement : `claimable` vient du serveur, le moteur rejuge la revendication.
 */
import { Button } from "@diasporale/features"
import type { PageManagement } from "@diasporale/features/data"
import { useDiasporaleT } from "@diasporale/features/i18n/client"
import { FlagIcon, MailIcon, UserRoundXIcon } from "lucide-react"
import NextLink from "next/link"
import type { ReactNode } from "react"

import { routes } from "@/lib/routes"

import { usePageManagement } from "./page-admin-parts"

export function PageOrphanNotice(props: { readonly pageId: string; readonly handle: string; readonly claimable: boolean }) {
  const management = usePageManagement()
  // Sans gestion des pages, la revendication n'a pas d'écran : le bandeau mène au contact.
  return management && props.claimable
    ? <ClaimableNotice management={management} pageId={props.pageId} handle={props.handle} />
    : <ContactNotice />
}

function ClaimableNotice(props: { readonly management: PageManagement; readonly pageId: string; readonly handle: string }) {
  const { t } = useDiasporaleT()
  const claims = props.management.useMyClaims()
  const pending = claims.status === "ready" && claims.data.some((claim) => claim.page.id === props.pageId && claim.status === "pending")
  if (pending) return <Notice body={t("pageSleep.orphan.pendingBody")} />
  return (
    <Notice body={t("pageSleep.orphan.claimBody")}>
      <Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal">
        <NextLink href={routes.pageClaim(props.handle)}>
          <FlagIcon aria-hidden />
          {t("pageSleep.orphan.claim")}
        </NextLink>
      </Button>
    </Notice>
  )
}

function ContactNotice() {
  const { t } = useDiasporaleT()
  return (
    <Notice body={t("pageSleep.orphan.contactBody")}>
      <Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal">
        <NextLink href={routes.contact()}>
          <MailIcon aria-hidden />
          {t("pageSleep.orphan.contact")}
        </NextLink>
      </Button>
    </Notice>
  )
}

function Notice(props: { readonly body: string; readonly children?: ReactNode }) {
  const { t } = useDiasporaleT()
  return (
    <div role="note" aria-labelledby="page-sans-responsable" data-slot="page-orphan-notice" className="flex flex-col items-start gap-3 rounded-xl bg-muted p-4">
      <p id="page-sans-responsable" className="flex min-w-0 items-start gap-2 font-semibold">
        <UserRoundXIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span className="min-w-0 break-words">{t("pageSleep.orphan.title")}</span>
      </p>
      <p className="min-w-0 break-words text-[15px] leading-relaxed">{props.body}</p>
      {props.children}
    </div>
  )
}
