"use client"

import { ViewFrame, ViewPane } from "@diaspora-ga/features"
import type { MembershipView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ArrowLeftIcon } from "lucide-react"
import NextLink from "next/link"

import { DataRightsSettings } from "@/components/data-rights-settings"
import { Gate } from "@/components/gate"
import { PublicShell } from "@/components/site-chrome"
import { LEGAL_TEXT_LABELS, LEGAL_TEXT_ROUTES } from "@/lib/legal-texts"
import { routes } from "@/lib/routes"

/**
 * `/mes-donnees` — les droits personnels HORS de la coque de membre (NP-02, EA-05) :
 * exporter ses données, demander puis annuler l'effacement, lire ses décisions de
 * modération et former un recours, suivre ses signalements.
 *
 * Ouverte à toute personne connectée, adhésion facultative (garde `person`) : qui n'est
 * jamais entré dans DIASPORA.GA, qui l'a quitté, qui est suspendu, et le membre. Les portes
 * du moteur appelées ne lisent aucune adhésion ; la page n'en lit que pour choisir le
 * retour (réglages ou accueil) et pour proposer « Quitter DIASPORA.GA » à qui peut encore
 * partir. Aucune surface sociale n'y est montée : ni coque de membre, ni cloche, ni fil.
 *
 * « Une page = une vue » (lot 2b) : la page tient l'écran (`layout="view"`). Le retour en tête,
 * un seul volet nommé « Mes données » (ses deux onglets en tête), un pied d'une ligne
 * (confidentialité, contact) : la coque publique en vue n'a pas de pied de page.
 */
export function MyDataScreen() {
  return (
    <PublicShell hideEnter layout="view">
      <Gate require="person">{(session) => <MyData personId={session.account.id} membership={session.membership} />}</Gate>
    </PublicShell>
  )
}

function MyData(props: { personId: string; membership: MembershipView | null }) {
  const { t } = useDiasporaGaT()
  const member = props.membership !== null && props.membership.status !== "partie"
  return (
    <ViewFrame
      className="mx-auto w-full max-w-[792px] gap-3 px-4 pb-4 pt-1 md:pt-3"
      header={
        <NextLink
          href={member ? routes.settings() : routes.welcome()}
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t(member ? "myData.backToSettings" : "myData.backToWelcome")}
        </NextLink>
      }
      footer={
        <p className="flex flex-wrap gap-x-5 text-[13px]">
          {(["privacy", "contact"] as const).map((kind) => (
            <NextLink key={kind} href={LEGAL_TEXT_ROUTES[kind]()} className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground hover:underline focus-visible:shadow-focus">
              {t(LEGAL_TEXT_LABELS[kind])}
            </NextLink>
          ))}
        </p>
      }
    >
      <ViewPane label={t("settings.data")}>
        <DataRightsSettings
          key={props.personId}
          heading="h1"
          person={{ personId: props.personId, handle: props.membership?.handle ?? null, canLeave: member }}
        />
      </ViewPane>
    </ViewFrame>
  )
}
