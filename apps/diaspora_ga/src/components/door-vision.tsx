"use client"

import { Button, cn } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import {
  BadgeCheckIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarDaysIcon,
  ConciergeBellIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandHeartIcon,
  LockIcon,
  LuggageIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UserPlusIcon,
  UserSearchIcon,
  type LucideIcon,
} from "lucide-react"
import NextLink from "next/link"

import { announcedOfferCards, CONSULAR_ATTESTATION_ANNOUNCED, type OfferCardId } from "@/lib/public-offer"
import { routes } from "@/lib/routes"


/**
 * La vision de DIASPORA.GA, sous la porte de l'accueil et de /entrer : ce qu'est le
 * réseau, ce qu'on y trouve, ses principes de confiance et comment y entrer
 * (cahier des charges §1–2, étude 13, accueils 11). La porte reste la première
 * action : cette section vient APRÈS la carte d'accès, au téléphone comme au bureau.
 *
 * Communication publique : aucun chiffre, aucune promesse d'audit, d'hébergement ni
 * de disponibilité ; on décrit, sans annoncer de volume. Les clés sont citées en
 * entier (cliquet des clés i18n).
 *
 * N'est annoncé que ce qui est ouvert (CH-816) : les cartes de l'offre suivent la
 * déclaration de l'application (`lib/public-offer.ts`), la carte « vérifié » et la
 * dernière étape suivent la vérification consulaire annoncée. Les cartes des modules
 * fermés restent écrites ici et dans les textes, sans être rendues.
 */
type VisionItem = { readonly icon: LucideIcon; readonly title: string; readonly body: string }

/** Le contenu de chaque carte de l'offre ; `lib/public-offer.ts` dit lesquelles se montrent, et dans quel ordre. */
const OFFER_CONTENT: Readonly<Record<OfferCardId, VisionItem>> = {
  country: { icon: GlobeIcon, title: "landing.vision.offer.country.title", body: "landing.vision.offer.country.body" },
  people: { icon: UserSearchIcon, title: "landing.vision.offer.people.title", body: "landing.vision.offer.people.body" },
  pages: { icon: Building2Icon, title: "landing.vision.offer.pages.title", body: "landing.vision.offer.pages.body" },
  groupsAndEvents: { icon: CalendarDaysIcon, title: "landing.vision.offer.groupsAndEvents.title", body: "landing.vision.offer.groupsAndEvents.body" },
  services: { icon: ConciergeBellIcon, title: "landing.vision.offer.services.title", body: "landing.vision.offer.services.body" },
  jobs: { icon: BriefcaseIcon, title: "landing.vision.offer.jobs.title", body: "landing.vision.offer.jobs.body" },
  mutualAid: { icon: HandHeartIcon, title: "landing.vision.offer.mutualAid.title", body: "landing.vision.offer.mutualAid.body" },
  mentoring: { icon: GraduationCapIcon, title: "landing.vision.offer.mentoring.title", body: "landing.vision.offer.mentoring.body" },
  arrivalKit: { icon: LuggageIcon, title: "landing.vision.offer.arrivalKit.title", body: "landing.vision.offer.arrivalKit.body" },
  contact: { icon: MessageCircleIcon, title: "landing.vision.offer.contact.title", body: "landing.vision.offer.contact.body" },
}

/** « Vérifié » : disponible par consulat.ga, ou annoncé comme à venir tant que l'attestation n'est pas en service. */
const VERIFIED: VisionItem = { icon: ShieldCheckIcon, title: "landing.vision.trust.verified.title", body: "landing.vision.trust.verified.body" }
const VERIFIED_SOON: VisionItem = { icon: ShieldCheckIcon, title: "landing.vision.trust.verifiedSoon.title", body: "landing.vision.trust.verifiedSoon.body" }

/** Les repères de confiance ; la déclaration est lue au rendu (un essai peut la remplacer). */
function trustItems(consularAnnounced: boolean): readonly VisionItem[] {
  return [
    { icon: LockIcon, title: "landing.vision.trust.closed.title", body: "landing.vision.trust.closed.body" },
    { icon: BadgeCheckIcon, title: "landing.vision.trust.speaker.title", body: "landing.vision.trust.speaker.body" },
    consularAnnounced ? VERIFIED : VERIFIED_SOON,
    { icon: UserPlusIcon, title: "landing.vision.trust.sponsored.title", body: "landing.vision.trust.sponsored.body" },
    { icon: SlidersHorizontalIcon, title: "landing.vision.trust.data.title", body: "landing.vision.trust.data.body" },
    { icon: GiftIcon, title: "landing.vision.trust.free.title", body: "landing.vision.trust.free.body" },
  ]
}

/** Les étapes ; sans vérification consulaire, on publie après un parrainage seulement. */
function steps(consularAnnounced: boolean): readonly string[] {
  return [
    "landing.vision.steps.account",
    "landing.vision.steps.residence",
    consularAnnounced ? "landing.vision.steps.publish" : "landing.vision.steps.publishSponsored",
  ]
}

/** `showJoin` : l'appel à rejoindre, sauf sur la carte d'inscription elle-même. */
export function DoorVision(props: { showJoin: boolean }) {
  const { t } = useDiasporaGaT()
  const offer = announcedOfferCards().map((card) => OFFER_CONTENT[card.id])
  const consularAnnounced = CONSULAR_ATTESTATION_ANNOUNCED
  return (
    <section aria-labelledby="vision-titre" className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-10 px-5 py-12 min-[960px]:gap-12 min-[960px]:py-16">
        <header className="max-w-[640px]">
          <h2 id="vision-titre" className="text-2xl font-semibold tracking-tight min-[960px]:text-3xl">
            {t("landing.vision.title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground min-[960px]:text-lg">{t("landing.vision.lead")}</p>
        </header>

        <VisionGroup id="vision-offre" title={t("landing.vision.offerTitle")} items={offer} />

        <VisionGroup id="vision-confiance" title={t("landing.vision.trustTitle")} items={trustItems(consularAnnounced)} />

        <section aria-labelledby="vision-etapes" className="flex flex-col gap-4">
          <h3 id="vision-etapes" className="text-lg font-semibold">
            {t("landing.vision.stepsTitle")}
          </h3>
          <ol className="flex flex-col gap-3">
            {steps(consularAnnounced).map((key, index) => (
              <li key={key} className="flex items-start gap-3">
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{t(key)}</span>
              </li>
            ))}
          </ol>
          {props.showJoin ? (
            <div>
              <Button asChild size="lg" variant="outline" className="text-primary">
                <NextLink href={routes.register()}>{t("landing.vision.join")}</NextLink>
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}

/**
 * Les colonnes au bureau : trois, sauf quand la dernière carte resterait seule sur sa ligne
 * (4 cartes → 2 × 2, 10 → 5 × 2) ; deux sur tablette, une au téléphone.
 */
function desktopColumns(count: number): string {
  return count % 3 === 1 ? "min-[960px]:grid-cols-2" : "min-[960px]:grid-cols-3"
}

function VisionGroup(props: { id: string; title: string; items: readonly VisionItem[] }) {
  const { t } = useDiasporaGaT()
  return (
    <section aria-labelledby={props.id} className="flex flex-col gap-4">
      <h3 id={props.id} className="text-lg font-semibold">
        {props.title}
      </h3>
      <ul className={cn("grid gap-3 sm:grid-cols-2", desktopColumns(props.items.length))}>
        {props.items.map((item) => (
          <li key={item.title} className="flex gap-3 rounded-xl border border-border bg-background p-4">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
              <item.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{t(item.title)}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(item.body)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
