"use client"

import { FloatingNotice } from "@diaspora-ga/features"
import type { MembershipView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { MEMBER_GATEWAY_ICONS } from "@diaspora-ga/features/navigation"
import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { forgetArrival, takeArrival, type ArrivalMark } from "@/lib/arrival"
import { configuredConsulateGateway, CONSULATE_LINK_ATTRIBUTES } from "@/lib/consulate-gateway"

import { useFloatingCard } from "./floating-cards"
import { useSignOutEverywhere } from "./sign-out-settings"
import { floatingLinkClass } from "./site-chrome"

/**
 * La carte d'arrivée (CH-863, lot D1) : la personne est passée par la porte `/entrer?depuis=consulat`
 * puis a atteint le fil (déjà connectée, ou après sa connexion ; le hub de son pays pour un nouveau
 * membre). Une carte flottante le lui dit UNE fois : « Vous arrivez de consulat.ga », le compte
 * sous lequel elle est ici (@identifiant), « Revenir à consulat.ga » (son espace, seulement si
 * l'adresse est configurée) et « Ce n'est pas moi », qui passe par la porte unique de « Se
 * déconnecter partout » et rouvre la porte ordinaire.
 *
 * Le repère de l'onglet (`lib/arrival.ts`) est lu au montage puis oublié : la carte ne revient
 * qu'après un nouveau passage par la porte d'arrivée.
 */
export function ArrivalCard(props: { membership: MembershipView }) {
  const [arrival, setArrival] = useState<ArrivalMark | null>(null)
  // Lu une fois, au client : au rendu serveur, aucune carte flottante n'existe encore. Sans arrivée,
  // rien d'autre n'est monté (ni sortie, ni carte).
  useEffect(() => {
    const taken = takeArrival()
    if (taken !== null) setArrival(taken)
  }, [])
  return arrival === null ? null : <ArrivalFloatingCard arrival={arrival} membership={props.membership} />
}

function ArrivalFloatingCard(props: { arrival: ArrivalMark; membership: MembershipView }) {
  const { t, locale } = useDiasporaGaT()
  const exit = useSignOutEverywhere()
  const links = configuredConsulateGateway()
  const Icon = MEMBER_GATEWAY_ICONS.consulate
  useFloatingCard({
    id: "diaspora-ga-arrivee-consulat",
    // Une arrivée = une carte : écartée, elle ne revient pas ; une nouvelle arrivée a sa propre clé.
    dismissKey: `diaspora-ga:carte:arrivee-consulat:${props.arrival.at}`,
    store: "session",
    version: `${locale}:${props.membership.handle}:${exit.busy ? "sortie" : "repos"}:${exit.failed ? "echec" : "ok"}`,
    content: (dismiss) => (
      <FloatingNotice
        role="status"
        tone="info"
        icon={<Icon />}
        heading={t("consulateGateway.arrival.cardTitle")}
        dismissLabel={t("notice.dismiss")}
        onDismiss={dismiss}
        actions={
          <>
            {links !== null ? (
              <a href={links.mySpace} {...CONSULATE_LINK_ATTRIBUTES} className={floatingLinkClass}>
                {t("consulateGateway.arrival.back")}
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              disabled={exit.busy}
              aria-busy={exit.busy || undefined}
              onClick={() => {
                forgetArrival()
                void exit.signOutEverywhere()
              }}
              className={floatingLinkClass}
            >
              {t(exit.busy ? "settings.signingOut" : "consulateGateway.arrival.notMe")}
            </button>
          </>
        }
      >
        {t("consulateGateway.arrival.cardBody", { handle: props.membership.handle })}
        {exit.failed ? (
          <span role="alert" className="mt-1 block font-medium text-destructive">
            {t("errors.unknown")}
          </span>
        ) : null}
      </FloatingNotice>
    ),
  })
  return null
}
