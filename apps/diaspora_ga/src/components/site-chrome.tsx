"use client"

import { LEGAL_TEXT_KINDS } from "@diaspora-ga/domain"
import { Button, DemoBanner, DemoChip, cn } from "@diaspora-ga/features"
import { useDataSource, useOptionalDataSource } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import NextLink from "next/link"
import type { ReactNode } from "react"

import { LEGAL_TEXT_LABELS, LEGAL_TEXT_ROUTES } from "@/lib/legal-texts"
import { routes } from "@/lib/routes"

import { useDismissal, useFloatingCard } from "./floating-cards"
import { LanguageSwitch } from "./preferences"
import { Wordmark } from "./wordmark"

/** Lien d'action d'une carte flottante : le bleu des liens, souligné au survol. */
export const floatingLinkClass =
  "inline-flex min-h-8 items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:shadow-focus"

const DEMO_CARD = { id: "diaspora-ga-demonstration", dismissKey: "diaspora-ga:carte:demonstration" } as const

/**
 * La carte flottante de la démonstration, avec l'accès aux comptes fictifs.
 * Montée une fois pour toute l'application (providers) : elle ne se rejoue pas
 * d'une page à l'autre. Écartée, elle le reste pour la session ; le repère
 * « Démo » de l'en-tête (`AppDemoChip`), lui, ne part jamais.
 */
export function DemoFloatingCard() {
  const { t, locale } = useDiasporaGaT()
  const source = useDataSource()
  useFloatingCard({
    ...DEMO_CARD,
    store: "session",
    version: locale,
    content:
      source.kind === "demo"
        ? (dismiss) => (
            <DemoBanner
              onDismiss={dismiss}
              action={
                <NextLink href={routes.demo()} className={floatingLinkClass}>
                  {t("demo.accountsLink")}
                </NextLink>
              }
            />
          )
        : null,
  })
  return null
}

/**
 * Le repère permanent du mode démonstration ; un clic rouvre la carte qui l'explique. Sans
 * source de données (arrivée directe sur un texte du site, sur le moteur), il n'y a rien à dire.
 */
export function AppDemoChip() {
  const source = useOptionalDataSource()
  const { restore } = useDismissal(DEMO_CARD.dismissKey, "session")
  if (source?.kind !== "demo") return null
  return <DemoChip onClick={restore} />
}

/**
 * Chrome des pages publiques (vitrine, entrée, textes) : mot-symbole, langue, entrée.
 *
 * `layout="view"` (« une page = une vue », décision du 24/11/2026) : dans une fenêtre d'au moins
 * 600 px de haut, la coque tient l'écran et son contenu (un `ViewFrame`) prend la hauteur qui
 * reste ; le document ne défile plus. Pas de grand pied de page : la vue porte sa propre
 * navigation (les onglets des textes) ; la langue, que seul le pied offrait au téléphone, passe
 * sous l'en-tête.
 */
export function PublicShell(props: { children: ReactNode; hideEnter?: boolean; layout?: "document" | "view" }) {
  const { t } = useDiasporaGaT()
  const view = props.layout === "view"
  return (
    <div className={cn("flex min-h-dvh flex-col", view && "tall:h-dvh tall:min-h-0")}>
      <header className="mx-auto flex w-full max-w-[1120px] shrink-0 items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <NextLink href={routes.home()} aria-label={t("nav.home")} className="rounded-md focus-visible:shadow-focus">
            <Wordmark />
          </NextLink>
          <AppDemoChip />
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch className="hidden sm:inline-flex" />
          {props.hideEnter ? null : (
            <Button asChild size="md">
              <NextLink href={routes.enter()}>{t("nav.enter")}</NextLink>
            </Button>
          )}
        </div>
      </header>
      {view ? (
        <div className="mx-auto w-full max-w-[1120px] shrink-0 px-4 pb-2 sm:hidden">
          <LanguageSwitch />
        </div>
      ) : null}
      <main id="contenu" className={cn("flex-1", view && "flex min-w-0 flex-col tall:min-h-0")}>
        {props.children}
      </main>
      {view ? null : <SiteFooter />}
    </div>
  )
}

export function SiteFooter(props: { compact?: boolean } = {}) {
  const { t } = useDiasporaGaT()
  return (
    <footer className={cn("border-t border-border", props.compact ? "bg-card" : "mt-16")}>
      <div className={cn("mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-8 md:flex-row md:items-start md:justify-between", props.compact && "gap-4 py-5 max-md:items-center max-md:text-center")}>
        <div className={cn("flex flex-col gap-2", props.compact && "hidden min-[960px]:flex")}>
          <Wordmark textOnly />
          <p className="max-w-sm text-[13px] text-muted-foreground">{t("footer.publisher")}</p>
        </div>
        <nav aria-label={t("footer.label")} className={cn("flex gap-2 text-sm", props.compact ? "flex-wrap justify-center gap-x-5" : "flex-col")}>
          {/* Les textes du site (LX-05) : mentions, confidentialité, conditions, règles de la communauté, contact. */}
          {LEGAL_TEXT_KINDS.map((kind) => (
            <NextLink key={kind} href={LEGAL_TEXT_ROUTES[kind]()} className="inline-flex min-h-11 items-center hover:underline focus-visible:shadow-focus">
              {t(LEGAL_TEXT_LABELS[kind])}
            </NextLink>
          ))}
          {/* Les droits personnels, adhésion facultative (EA-05) : la connexion est demandée si besoin. */}
          <NextLink href={routes.myData()} className="inline-flex min-h-11 items-center hover:underline focus-visible:shadow-focus">
            {t("footer.myData")}
          </NextLink>
          <NextLink href={routes.charte()} className="inline-flex min-h-11 items-center hover:underline focus-visible:shadow-focus">
            {t("footer.charte")}
          </NextLink>
        </nav>
        {/* La langue seule : l'apparence se règle dans les préférences (et par le bouton de la porte). */}
        <div className="flex flex-col gap-2">
          <LanguageSwitch />
        </div>
      </div>
    </footer>
  )
}
