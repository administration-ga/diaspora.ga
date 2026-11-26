"use client"

import { Button, Sheet, SheetContent } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { ArrowUpRightIcon } from "lucide-react"
import { useId, type ReactNode } from "react"

import { CONSULATE_LINK_ATTRIBUTES, type ConsulateGatewayLinks, type ConsulateGatewayState } from "@/lib/consulate-gateway"

/** Les trois étapes d'un compte léger, dans l'ordre : identité numérique, inscription, accès. */
const STEPS = [
  { titleKey: "consulateGateway.sheet.steps.identityTitle", bodyKey: "consulateGateway.sheet.steps.identityBody" },
  { titleKey: "consulateGateway.sheet.steps.registrationTitle", bodyKey: "consulateGateway.sheet.steps.registrationBody" },
  { titleKey: "consulateGateway.sheet.steps.accessTitle", bodyKey: "consulateGateway.sheet.steps.accessBody" },
] as const

/**
 * La feuille d'information de la passerelle « consulat.ga » (CH-863, lot D1), sur le patron de la
 * page flottante « Informations » : feuille basse au téléphone, panneau centré au bureau, montée
 * à l'ouverture seulement. La coque l'ouvre au PREMIER clic simple sur l'entrée « consulat.ga » ;
 * ensuite, l'entrée mène directement à consulat.ga.
 *
 * Elle dit d'abord, en une phrase, que consulat.ga est une autre application, avec sa propre
 * connexion, et que DIASPORA.GA ne lui transmet rien. Puis, selon la personne :
 *  · `idn` (compte relié à identite.ga) : « Ouvrir mon espace consulat.ga », puis « M'inscrire au
 *    consulat » ;
 *  · `light` (compte léger ou en attente) : les trois étapes, « M'inscrire au consulat » (ce
 *    parcours crée l'identité numérique en chemin), « J'ai déjà un compte », et identite.ga quand
 *    son adresse est configurée.
 * Chaque action est un vrai lien, dans le même onglet, sans ouvreur ni référent. Le focus va sur
 * le titre à l'ouverture et revient, à la fermeture, à ce qui l'a ouverte (l'avatar du menu du
 * compte, ou le lien du rail).
 */
export function ConsulateGatewaySheet(props: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly links: ConsulateGatewayLinks
  readonly state: Exclude<ConsulateGatewayState, "attested">
  /** Le portail identite.ga (`publicEnv.idnPortalUrl`) ; absent, aucun lien vers lui. */
  readonly idnPortalUrl: string | null
  readonly returnFocus: () => HTMLElement | null
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <ConsulateGatewayPanel {...props} /> : null}
    </Sheet>
  )
}

function ConsulateGatewayPanel(props: {
  readonly links: ConsulateGatewayLinks
  readonly state: Exclude<ConsulateGatewayState, "attested">
  readonly idnPortalUrl: string | null
  readonly returnFocus: () => HTMLElement | null
}) {
  const { t } = useDiasporaGaT()
  const contentId = useId()
  const stepsId = useId()
  const titleElement = () => document.getElementById(contentId)?.querySelector<HTMLElement>('[data-slot="sheet-title"]') ?? null
  const { links } = props

  return (
    <SheetContent
      id={contentId}
      title={t("consulateGateway.sheet.title")}
      description={t("consulateGateway.sheet.separate")}
      closeLabel={t("consulateGateway.sheet.close")}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleElement()?.focus()
      }}
      onCloseAutoFocus={(event) => {
        // Ouverte depuis un menu ou un lien qui n'en est pas le déclencheur : le focus revient à lui.
        event.preventDefault()
        props.returnFocus()?.focus()
      }}
    >
      {props.state === "idn" ? (
        <p className="text-sm leading-relaxed">{t("consulateGateway.sheet.idnLead")}</p>
      ) : (
        <>
          <p id={stepsId} className="text-sm font-semibold leading-relaxed">
            {t("consulateGateway.sheet.stepsLead")}
          </p>
          <ol aria-labelledby={stepsId} className="mt-3 flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <li key={step.titleKey} className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--esp-accent-soft)] text-[13px] font-semibold tabular-nums text-[var(--esp-accent-deep)]"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug">{t(step.titleKey)}</h3>
                  <p className="text-sm leading-snug text-muted-foreground">{t(step.bodyKey)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("consulateGateway.sheet.registerCreatesIdentity")}</p>
        </>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {props.state === "idn" ? (
          <>
            <OutboundAction href={links.mySpace} variant="primary">
              {t("consulateGateway.sheet.openMySpace")}
            </OutboundAction>
            <OutboundAction href={links.register} variant="outline">
              {t("consulateGateway.sheet.register")}
            </OutboundAction>
          </>
        ) : (
          <>
            <OutboundAction href={links.register} variant="primary">
              {t("consulateGateway.sheet.register")}
            </OutboundAction>
            <OutboundAction href={links.mySpace} variant="outline">
              {t("consulateGateway.sheet.alreadyRegistered")}
            </OutboundAction>
            {props.idnPortalUrl ? (
              <OutboundAction href={props.idnPortalUrl} variant="ghost">
                {t("consulateGateway.sheet.idnPortal")}
              </OutboundAction>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">{t("consulateGateway.sheet.sameTab")}</p>
    </SheetContent>
  )
}

/** Une action qui quitte DIASPORA.GA : un vrai lien, dans le même onglet, sans ouvreur ni référent. */
function OutboundAction(props: { readonly href: string; readonly variant: "primary" | "outline" | "ghost"; readonly children: ReactNode }) {
  return (
    <Button asChild variant={props.variant} className="w-full">
      <a href={props.href} {...CONSULATE_LINK_ATTRIBUTES}>
        {props.children}
        <ArrowUpRightIcon aria-hidden className="size-4" />
      </a>
    </Button>
  )
}
