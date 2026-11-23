"use client"

/**
 * `/moderation` — le guichet de modération par pays de DIASPORA.GA (PD6 · G9).
 *
 * Des onglets portés par l'adresse (`routes.moderationDesk(tab)`), selon le rôle :
 *   · « File » : en tête, les délais légaux (SU01d du moteur : fondement,
 *     chronomètre, échéance, accusé de réception) ; puis la file ordinaire, les
 *     signalements ouverts et la relecture préalable, filtrés par le pays de la
 *     cible, la nature et l'équipe ; un dossier s'examine dans une feuille
 *     (aperçu borné, décisions antérieures, décision motivée) ;
 *   · « Pages à vérifier » (AS-01) : les revendications de page en attente, par
 *     pays de la page, tranchées par la modération du réseau.
 *
 * Le guichet TRAITE ; il ne décide plus (fiche CH-815, D5, lot A6) : les recours,
 * les équipes et les responsables, les règles de modération et la mesure du pilote
 * se décident dans l'application d'administration du réseau, et le moteur refuse
 * ces gestes à toute session de diaspora.ga, celle de l'administrateur comprise.
 * Les drapeaux `canReviewAppeals`, `canManageTeams` et `canManagePolicy` de `myDesk`
 * décrivent encore le RÔLE : aucun onglet ne se monte d'après eux.
 *
 * L'autorité reste au moteur : seules les équipes HABILITÉES lisent la file ;
 * un membre sans compétence voit « indisponible », exactement comme si la
 * capacité n'était pas servie — aucune équipe, aucun membre, aucun dossier
 * n'est révélé. La démonstration le dit : dossiers fictifs, décisions sans effet.
 * PROPRIÉTAIRE : chantier « modération par pays ».
 */
import { Card, EmptyState, FolderTabsNav, Skeleton } from "@diaspora-ga/features"
import { useFeatureGate, useModerationDesk, type MembershipView, type ModerationDeskCapability, type ModerationDeskView } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { MODERATION_DESK_TABS, type ModerationDeskTab } from "@diaspora-ga/features/navigation"
import { FlaskConicalIcon, ShieldOffIcon } from "lucide-react"
import NextLink from "next/link"
import { useSearchParams } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { ModerationDeskClaims } from "@/components/moderation-desk-claims"
import { DESK_ACCESS_ERRORS, DeskErrorLine, deskList } from "@/components/moderation-desk-parts"
import { ModerationDeskQueue } from "@/components/moderation-desk-queue"
import { routes } from "@/lib/routes"

/** Les onglets du guichet, ceux de `routes.moderationDesk(tab)` (adresse partagée avec admin.diaspora.ga). */
export const DESK_TABS = MODERATION_DESK_TABS
export type DeskTab = ModerationDeskTab

/** L'onglet demandé par l'adresse ; inconnu ou absent : « File ». */
export function parseDeskTab(raw: string | null): DeskTab {
  return DESK_TABS.find((tab) => tab === raw) ?? "file"
}

const TAB_LABELS: Readonly<Record<DeskTab, string>> = {
  file: "moderationDesk.tab.file",
  pages: "moderationDesk.tab.claims",
}

/**
 * Un onglet offert à ce rôle : la file à tout guichet ouvert, les pages à vérifier à qui les instruit selon le moteur (rôle de réseau ou équipe compétente pour les pages).
 * ADR-0041 du moteur : les pages fermées sur le réseau, il n'y a pas de page à vérifier.
 */
function offersTab(tab: DeskTab, view: ModerationDeskView, pagesOpen: boolean): boolean {
  if (tab === "pages") return pagesOpen && view.canReviewClaims
  return true
}

export function ModerationDeskScreen() {
  return (
    <Gate require="member">
      {(session) => (session.membership ? <AppShell membership={session.membership}><ModerationDesk membership={session.membership} /></AppShell> : null)}
    </Gate>
  )
}

export function ModerationDesk(props: { readonly membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const desk = useModerationDesk()
  const params = useSearchParams()
  const tab = parseDeskTab(params.get("onglet"))
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{t("moderationDesk.title")}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t("moderationDesk.lead")}</p>
      </header>
      {desk === null ? (
        <Unavailable />
      ) : (
        <DeskGate key={props.membership.personId} desk={desk} personId={props.membership.personId} tab={tab} />
      )}
    </div>
  )
}

/** Le même message pour une capacité non servie et pour un membre sans compétence : rien n'est révélé. */
function Unavailable() {
  const { t } = useDiasporaGaT()
  return <EmptyState icon={<ShieldOffIcon />} title={t("moderationDesk.unavailable.title")} description={t("moderationDesk.unavailable.body")} />
}

function DeskGate(props: { readonly desk: ModerationDeskCapability; readonly personId: string; readonly tab: DeskTab }) {
  const { t } = useDiasporaGaT()
  const view = props.desk.useDesk(props.personId)
  if (view.status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{t("moderationDesk.loading")}</span>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  if (view.status === "error") {
    if (DESK_ACCESS_ERRORS.has(view.code)) return <Unavailable />
    return (
      <Card role="alert" className="p-4">
        <DeskErrorLine code={view.code} />
      </Card>
    )
  }
  if (view.data === null) return <Unavailable />
  return <DeskBody desk={props.desk} view={view.data} personId={props.personId} tab={props.tab} />
}

function DeskBody(props: { readonly desk: ModerationDeskCapability; readonly view: ModerationDeskView; readonly personId: string; readonly tab: DeskTab }) {
  const { t } = useDiasporaGaT()
  const { view } = props
  const pagesOpen = useFeatureGate().isOpen("pages")
  const tabs = DESK_TABS.filter((tab) => offersTab(tab, view, pagesOpen))
  return (
    <>
      {props.desk.demonstration ? (
        <Card className="flex items-start gap-3 p-4">
          <FlaskConicalIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed">{t("moderationDesk.demoNotice")}</p>
        </Card>
      ) : null}
      <Capacity view={view} />
      <FolderTabsNav
        label={t("moderationDesk.tabsLabel")}
        items={tabs.map((item) => ({ id: item, label: t(TAB_LABELS[item]), href: routes.moderationDesk(item), active: item === props.tab }))}
        renderLink={(item, className, children) => (
          <NextLink key={item.id} href={item.href} className={className} aria-current={item.active ? "page" : undefined}>{children}</NextLink>
        )}
      />
      {props.tab === "pages" ? (
        pagesOpen && view.canReviewClaims
          ? <ModerationDeskClaims desk={props.desk} personId={props.personId} />
          : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("moderationDesk.claims.restricted")}</p>
      ) : (
        <ModerationDeskQueue desk={props.desk} view={view} personId={props.personId} />
      )}
    </>
  )
}

/** Ma capacité : le rôle qui ouvre le guichet, mes équipes ; la couverture par pays n'existe pas encore au moteur. */
function Capacity(props: { readonly view: ModerationDeskView }) {
  const { t, locale } = useDiasporaGaT()
  const { view } = props
  const names = view.teams.filter((team) => team.isMember).map((team) => team.name)
  const teamsLine = names.length > 0 ? t("moderationDesk.capacity.teams", { names: deskList(names, locale) }) : t("moderationDesk.capacity.noTeam")
  return (
    <Card className="flex min-w-0 flex-col gap-1.5 p-4">
      <p className="text-sm font-semibold">{t(`moderationDesk.capacity.role.${view.role}`)}</p>
      <p className="break-words text-sm text-muted-foreground">{teamsLine}</p>
      <p className="text-[13px] leading-snug text-muted-foreground">{t("moderationDesk.capacity.decisions")}</p>
    </Card>
  )
}
