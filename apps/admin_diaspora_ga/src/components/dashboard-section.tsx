"use client"

/**
 * Tableau de bord (groupe Pilotage, fiche CH-815 § 4.2 et lot A7) : l'accueil de l'administrateur,
 * puis ce que le moteur TIENT, et rien d'autre — chaque tuile mène à sa section :
 *  · les compteurs maintenus du réseau (`diaspora/networkSettings.overview`) : modules ouverts
 *    (nommés d'après `networks/features.settings`), cohorte fondatrice, pays ouverts ;
 *  · les équipes de modération vivantes, comptées sur la liste que le moteur rend (`myDesk().teams`) ;
 *  · les dernières décisions du journal (`platform/audit.paginateNetworkAdminAudit`, entrées dans
 *    l'administration écartées) ;
 *  · les liens vers le bureau de modération de diaspora.ga (« File de modération », « Pages à
 *    vérifier »), qui reste aux modérateurs, sans compteur : aucune lecture ne le donne.
 * Les membres par statut, les admissions en attente, les signalements et recours ouverts et les
 * pages à vérifier ne sont comptés par aucun compteur du moteur : la section le dit, aucun
 * chiffre n'est estimé ni affiché à leur place.
 */
import { api } from "@convex/_generated/api"
import { Card, cn, formatNumber, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useQuery } from "convex/react"
import { ArrowRightIcon, AwardIcon, BlocksIcon, ExternalLinkIcon, GlobeIcon, LandmarkIcon, ScaleIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from "lucide-react"
import NextLink from "next/link"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { JOURNAL_PAGE } from "@/lib/journal"
import { membersDeskUrl } from "@/lib/members-site"
import { routes } from "@/lib/routes"

import { dateTime } from "./decision-parts"
import { journalActionLabel, journalActorName } from "./journal-section"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary, SectionFailure } from "./section-boundary"

/** Les décisions montrées au tableau de bord : les plus récentes de la première fenêtre du journal. */
export const DASHBOARD_DECISIONS = 5

/** Une entrée dans l'administration n'est pas une décision : le tableau de bord ne la montre pas. */
const ACCESS_ACTION = "network.admin_access"

const TILE_CLASS =
  "group flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors duration-150 ease-charte hover:bg-muted focus-visible:shadow-focus"

export function DashboardSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-6xl flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {admin.displayName ? t("dashboard.greeting", { name: admin.displayName }) : t("dashboard.greetingWithoutName")}
        </h1>
        <p className="text-muted-foreground">{t("dashboard.lead", { network: admin.networkName })}</p>
      </header>
      <Overview />
      <div className="grid min-w-0 gap-6 min-[1024px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionBoundary>
          <LatestDecisions />
        </SectionBoundary>
        <MembersDesk />
      </div>
      <p className="max-w-3xl text-[13px] leading-snug text-muted-foreground">{t("dashboard.notCounted")}</p>
    </section>
  )
}

function Tile(props: { readonly href: string; readonly icon: ReactNode; readonly title: string; readonly value?: string; readonly children?: ReactNode }) {
  return (
    <li className="flex min-w-0">
      <NextLink href={props.href} className={cn(TILE_CLASS, "w-full")}>
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
          {props.icon}
          <span className="min-w-0 break-words">{props.title}</span>
          <ArrowRightIcon aria-hidden="true" className="ml-auto transition-transform duration-150 ease-charte group-hover:translate-x-0.5" />
        </span>
        {props.value !== undefined ? <span className="font-mono text-2xl font-semibold leading-none tracking-tight">{props.value}</span> : null}
        {props.children ? <span className="text-[13px] leading-snug text-muted-foreground">{props.children}</span> : null}
      </NextLink>
    </li>
  )
}

function Overview() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="font-display text-xl font-bold">
        {t("dashboard.overviewTitle")}
      </h2>
      <ul className="grid min-w-0 gap-3 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3">
        <SectionBoundary fallback={(error, retry) => <TileFailure error={error} retry={retry} />}>
          <CountedTiles />
        </SectionBoundary>
        <SectionBoundary fallback={(error, retry) => <TileFailure error={error} retry={retry} />}>
          <TeamsTile />
        </SectionBoundary>
        <Tile href={routes.appeals()} icon={<ScaleIcon aria-hidden="true" />} title={t("dashboard.tile.appeals")}>
          {t("dashboard.tile.appealsHint")}
        </Tile>
        <Tile href={routes.institutions()} icon={<LandmarkIcon aria-hidden="true" />} title={t("dashboard.tile.institutions")}>
          {t("dashboard.tile.institutionsHint")}
        </Tile>
      </ul>
    </section>
  )
}

function TileSkeleton() {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <li role="status" className="flex min-w-0">
      <span className="sr-only">{t("section.loading")}</span>
      <Skeleton className="h-28 w-full rounded-xl" />
    </li>
  )
}

/** Le refus d'une lecture d'une tuile, dans la grille (un élément de liste), avec « Relire ». */
function TileFailure(props: { readonly error: unknown; readonly retry: () => void }) {
  return (
    <li className="flex min-w-0">
      <SectionFailure error={props.error} retry={props.retry} />
    </li>
  )
}

/** Les compteurs tenus par le moteur : modules ouverts (nommés), cohorte fondatrice, pays ouverts. */
function CountedTiles() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: members, locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const overview = useQuery(api.modules.diaspora.networkSettings.overview, { networkId: admin.networkId })
  const settings = useQuery(api.modules.networks.features.settings, { networkId: admin.networkId })
  if (overview === undefined) return <TileSkeleton />
  const open = (settings ?? []).filter((row) => row.open).map((row) => members(`networkFeatures.names.${row.feature}`))
  return (
    <>
      <Tile
        href={routes.modules()}
        icon={<BlocksIcon aria-hidden="true" />}
        title={t("dashboard.tile.modules")}
        value={t("dashboard.outOf", { value: formatNumber(overview.modules.open, locale), max: formatNumber(overview.modules.total, locale) })}
      >
        {settings === undefined ? null : open.length === 0 ? t("dashboard.tile.modulesNone") : open.join(" · ")}
      </Tile>
      <Tile
        href={routes.founders()}
        icon={<AwardIcon aria-hidden="true" />}
        title={t("dashboard.tile.founders")}
        value={t("dashboard.outOf", { value: formatNumber(overview.founders.active, locale), max: formatNumber(overview.founders.cap, locale) })}
      >
        {t("dashboard.tile.foundersHint")}
      </Tile>
      <Tile href={routes.countries()} icon={<GlobeIcon aria-hidden="true" />} title={t("dashboard.tile.countries")} value={formatNumber(overview.countries.open, locale)}>
        {t("dashboard.tile.countriesHint")}
      </Tile>
    </>
  )
}

/** Les équipes de modération vivantes du réseau, comptées sur la liste que le moteur rend à l'administration. */
function TeamsTile() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const desk = useQuery(api.modules.diaspora.moderationDesk.myDesk, { networkId: admin.networkId, expectedPersonId: admin.personId })
  if (desk === undefined) return <TileSkeleton />
  const teams = desk?.teams ?? []
  return (
    <Tile href={routes.team()} icon={<UsersIcon aria-hidden="true" />} title={t("dashboard.tile.teams")} value={formatNumber(teams.length, locale)}>
      {t("dashboard.tile.teamsHint")}
    </Tile>
  )
}

function LatestDecisions() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const id = useId()
  const journal = useQuery(api.modules.platform.audit.paginateNetworkAdminAudit, { networkId: admin.networkId, paginationOpts: { cursor: null, numItems: JOURNAL_PAGE } })
  const decisions = (journal?.page ?? []).filter((entry) => entry.action !== ACCESS_ACTION).slice(0, DASHBOARD_DECISIONS)
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
        <h2 id={id} className="flex items-center gap-2 font-display text-xl font-bold">
          <ScrollTextIcon aria-hidden="true" className="size-5" />
          {t("dashboard.decisionsTitle")}
        </h2>
        {journal === undefined ? (
          <div role="status">
            <span className="sr-only">{t("section.loading")}</span>
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : decisions.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("dashboard.decisionsEmpty")}</p>
        ) : (
          <ol className="flex min-w-0 flex-col divide-y divide-border">
            {decisions.map((entry) => (
              <li key={entry.auditId} className="flex min-w-0 flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <p className="min-w-0 break-words text-sm font-medium">{journalActionLabel(entry.action, t)}</p>
                <p className="min-w-0 break-words text-[13px] text-muted-foreground">{t("dashboard.decisionBy", { name: journalActorName(entry, t), date: dateTime(entry.at, locale) })}</p>
              </li>
            ))}
          </ol>
        )}
        <NextLink
          href={routes.journal()}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-pill text-sm font-semibold text-primary underline-offset-[3px] hover:underline focus-visible:shadow-focus"
        >
          {t("dashboard.decisionsLink")}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </NextLink>
      </section>
    </Card>
  )
}

/** Le bureau de diaspora.ga, où les modérateurs traitent la file et les pages à vérifier : deux liens, sans compteur. */
function MembersDesk() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const queue = membersDeskUrl("file")
  const pages = membersDeskUrl("pages")
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
        <h2 id={id} className="flex items-center gap-2 font-display text-xl font-bold">
          <ShieldCheckIcon aria-hidden="true" className="size-5" />
          {t("dashboard.desk.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("dashboard.desk.lead")}</p>
        {queue !== null && pages !== null ? (
          <ul className="flex min-w-0 flex-col gap-1">
            <DeskLink href={queue} label={t("dashboard.desk.queue")} />
            <DeskLink href={pages} label={t("dashboard.desk.pages")} />
          </ul>
        ) : (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t("dashboard.desk.unconfigured")}</p>
        )}
      </section>
    </Card>
  )
}

function DeskLink(props: { readonly href: string; readonly label: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <li>
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:shadow-focus"
      >
        <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
        {props.label} <span className="sr-only">{t("shell.newTab")}</span>
      </a>
    </li>
  )
}
