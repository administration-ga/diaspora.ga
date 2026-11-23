"use client"

/**
 * Section « Journal » (groupe Pilotage, fiche CH-815 § 4.2 et lot A7) : qui a décidé quoi, quand,
 * à quel titre et avec quel motif, dans le journal des décisions du réseau
 * (`platform/audit.paginateNetworkAdminAudit`, la plus récente d'abord). Le filtre par action
 * s'applique à chaque fenêtre lue par le moteur : une fenêtre filtrée peut revenir vide et annoncer
 * sa suite — la section propose alors de charger la suite, sans jamais dire « aucun résultat »
 * tant que le journal n'est pas lu jusqu'au bout. L'auteur est cité par son profil PUBLIÉ, comme
 * le moteur le rend ; une action que l'écran ne nomme pas reçoit un libellé neutre.
 */
import { api } from "@convex/_generated/api"
import { EmptyState } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import type { FunctionReturnType } from "convex/server"
import { ScrollTextIcon } from "lucide-react"
import { useCallback, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import {
  JOURNAL_ACTION_LABEL_KEYS,
  JOURNAL_CAPACITY_LABEL_KEYS,
  JOURNAL_FILTER_ACTIONS,
  JOURNAL_PAGE,
  JOURNAL_UNKNOWN_ACTION_KEY,
  journalActionLabelKey,
  journalDetailOf,
  journalFilterOf,
  type JournalAction,
  type JournalDetail,
  type JournalEntry,
} from "@/lib/journal"

import { CursorPager } from "./cursor-pager"
import { dateTime, SELECT_CLASS } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

type Translate = ReturnType<typeof useTranslation>["t"]

const journalWindow = (result: FunctionReturnType<typeof api.modules.platform.audit.paginateNetworkAdminAudit>) => ({
  items: result.page,
  isDone: result.isDone,
  continueCursor: result.continueCursor,
})

/** Le libellé d'une action : le sien, sinon le libellé neutre avec le code fermé du moteur. */
export function journalActionLabel(action: string, t: Translate): string {
  const key = journalActionLabelKey(action)
  return key === null ? t(JOURNAL_UNKNOWN_ACTION_KEY, { code: action }) : t(key)
}

export function JournalSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  const id = useId()
  const [action, setAction] = useState<JournalAction | null>(null)
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("journal.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("journal.lead")}</p>
      </header>
      <div className="flex min-w-0 max-w-md flex-col gap-1.5">
        <label htmlFor={`${id}-action`} className="text-sm font-medium">
          {t("journal.filter")}
        </label>
        <select id={`${id}-action`} className={SELECT_CLASS} value={action ?? ""} onChange={(event) => setAction(journalFilterOf(event.target.value))}>
          <option value="">{t("journal.filterAll")}</option>
          {JOURNAL_FILTER_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {t(JOURNAL_ACTION_LABEL_KEYS[value])}
            </option>
          ))}
        </select>
      </div>
      <SectionBoundary key={action ?? "*"}>
        <JournalList action={action} />
      </SectionBoundary>
    </section>
  )
}

function JournalList(props: { readonly action: JournalAction | null }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const { action } = props
  const args = useCallback(
    (cursor: string | null) => ({ networkId: admin.networkId, ...(action ? { action } : {}), paginationOpts: { cursor, numItems: JOURNAL_PAGE } }),
    [admin.networkId, action],
  )
  return (
    <CursorPager
      query={api.modules.platform.audit.paginateNetworkAdminAudit}
      args={args}
      windowOf={journalWindow}
      keyOf={(entry) => entry.auditId}
      loadMoreLabel={t("journal.loadMore")}
      pending={<p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("journal.scanning")}</p>}
      empty={
        <EmptyState
          icon={<ScrollTextIcon />}
          title={t(action ? "journal.emptyFilteredTitle" : "journal.emptyTitle")}
          description={t(action ? "journal.emptyFilteredBody" : "journal.emptyBody")}
        />
      }
    >
      {(entries) => (
        <ol className="flex min-w-0 flex-col gap-3">
          {entries.map((entry) => (
            <JournalLine key={entry.auditId} entry={entry} />
          ))}
        </ol>
      )}
    </CursorPager>
  )
}

/** L'auteur d'une ligne : son nom publié, sinon son identifiant public, sinon un nom neutre ; aucun pour un acte du système. */
export function journalActorName(entry: Pick<JournalEntry, "actor" | "capacity">, t: Translate): string {
  if (entry.actor === null) return t("journal.systemActor")
  if (entry.actor.displayName) return entry.actor.displayName
  if (entry.actor.handle) return `@${entry.actor.handle}`
  return t("journal.neutralActor")
}

function JournalLine(props: { readonly entry: JournalEntry }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const { entry } = props
  const detail = journalDetailOf(entry)
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-semibold">{journalActionLabel(entry.action, t)}</p>
        <p className="shrink-0 text-[13px] text-muted-foreground">
          <time dateTime={new Date(entry.at).toISOString()}>{dateTime(entry.at, locale)}</time>
        </p>
      </div>
      {detail ? <JournalDetailLine detail={detail} /> : null}
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("journal.by")}</dt>
        <dd className="min-w-0 break-words">{journalActorName(entry, t)}</dd>
        <dt className="text-muted-foreground">{t("journal.capacityLabel")}</dt>
        <dd className="min-w-0 break-words">{t(JOURNAL_CAPACITY_LABEL_KEYS[entry.capacity])}</dd>
        {entry.reason !== null ? (
          <>
            <dt className="text-muted-foreground">{t("journal.reason")}</dt>
            <dd className="min-w-0 whitespace-pre-line break-words">{entry.reason}</dd>
          </>
        ) : null}
      </dl>
    </li>
  )
}

function JournalDetailLine(props: { readonly detail: JournalDetail }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: members, locale } = useDiasporaGaT()
  const { detail } = props
  const roleLabel = (role: string) => t(role === "network_admin" ? "responsibles.role.network_admin" : role === "network_moderator" ? "responsibles.role.network_moderator" : "journal.detail.roleMember")
  const text = (() => {
    switch (detail.kind) {
      case "feature":
        return t(detail.enabled ? "journal.detail.featureOpened" : "journal.detail.featureClosed", { module: members(`networkFeatures.names.${detail.feature}`) })
      case "seniorityWaiver":
        return t("journal.detail.seniorityWaiver")
      case "appeal":
        return t(detail.overturn ? "journal.detail.appealOverturned" : "journal.detail.appealUpheld")
      case "teamMember":
        return t(detail.active ? "journal.detail.teamMemberAdded" : "journal.detail.teamMemberRemoved")
      case "sleepUntil":
        return t("journal.detail.sleepUntil", { date: dateTime(detail.until, locale) })
      case "role":
        return t("journal.detail.role", { from: roleLabel(detail.from), to: roleLabel(detail.to) })
    }
  })()
  return <p className="min-w-0 break-words text-sm">{text}</p>
}
