"use client"

import type { NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { Button, cn, formatDate, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { featureMenuAdditions, MEMBERS_APP_CODE_SWITCH_STATES, MEMBERS_APP_CODE_SWITCHES, type MembersAppCodeSwitch } from "@diaspora-ga/features/navigation"
import { useQuery } from "convex/react"
import { CircleCheck, CircleDashed, ListChecks, LockKeyhole, MonitorSmartphone, Power, PowerOff } from "lucide-react"
import NextLink from "next/link"
import { Component, useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import {
  DECISION_LOOKUP_WINDOW,
  decisionsOf,
  moduleCardState,
  servedFeatures,
  toggleBlockOf,
  type FeatureDecision,
  type FeatureState,
  type ModuleCardState,
  type ToggleBlock,
} from "@/lib/network-features"
import { routes } from "@/lib/routes"

import { MenuChangeList } from "./member-menu-preview"
import { ModuleToggleDialog } from "./module-toggle-dialog"
import { useNetworkAdmin } from "./network-admin-context"

/**
 * Section « Modules » (groupe « Application des membres », fiche CH-815 § 4.2 et § 4.3) : une
 * carte par module que le moteur rend (`modules/networks/features.settings`) — son état, le module
 * qu'il exige, ce qu'il ajoute au menu des membres (dérivé de la règle partagée du menu, jamais
 * recopié), sa dernière décision et son motif quand le journal la porte, la liste des prérequis à
 * relire avant de l'ouvrir. La bascule passe par une fenêtre motivée. Appels, direct et iCom Pro,
 * fermés par le code de l'application des membres, se lisent à part, sans geste.
 */
export function ModulesSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const titleId = useId()
  const rows = useQuery(api.modules.networks.features.settings, { networkId: admin.networkId })
  const [editing, setEditing] = useState<FeatureState | null>(null)
  const served = rows ? servedFeatures(rows) : []

  return (
    <section aria-labelledby={titleId} className="flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("modules.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("modules.lead")}</p>
        <Button asChild variant="secondary" className="self-start">
          <NextLink href={routes.menuPreview()}>
            <MonitorSmartphone aria-hidden="true" />
            {t("modules.previewLink")}
          </NextLink>
        </Button>
      </header>

      {rows === undefined ? (
        <div role="status" className="grid gap-4 min-[1024px]:grid-cols-2">
          <span className="sr-only">{t("modules.loading")}</span>
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("modules.empty")}</p>
      ) : (
        <DecisionsReader networkId={admin.networkId} rows={rows}>
          {(decisions) => <ModuleList rows={rows} served={served} decisions={decisions} onToggle={setEditing} />}
        </DecisionsReader>
      )}

      <CodeSwitches />

      <ModuleToggleDialog networkId={admin.networkId} row={editing} served={served} onClose={() => setEditing(null)} />
    </section>
  )
}

/** Les décisions retrouvées, ou `null` tant que le journal se lit (aucune phrase n'est alors affirmée). */
type Decisions = ReadonlyMap<NetworkFeature, FeatureDecision> | null

const NO_DECISIONS: ReadonlyMap<NetworkFeature, FeatureDecision> = new Map()

interface DecisionsProps {
  readonly networkId: Id<"networks">
  readonly rows: readonly FeatureState[]
  readonly children: (decisions: Decisions) => ReactNode
}

/**
 * Le motif de la dernière décision de chaque module, lu dans le journal du réseau
 * (`modules/platform/audit.paginateNetworkAudit`, ses administrateurs et ses modérateurs), sur
 * ses dernières lignes. Une lecture en échec ne retire rien aux cartes : elles disent la date seule.
 */
function DecisionsReader(props: DecisionsProps) {
  return (
    <QuietBoundary fallback={props.children(NO_DECISIONS)}>
      <DecisionsFromJournal networkId={props.networkId} rows={props.rows}>
        {props.children}
      </DecisionsFromJournal>
    </QuietBoundary>
  )
}

function DecisionsFromJournal(props: DecisionsProps) {
  const journal = useQuery(api.modules.platform.audit.paginateNetworkAudit, { networkId: props.networkId, paginationOpts: { numItems: DECISION_LOOKUP_WINDOW, cursor: null } })
  return <>{props.children(journal === undefined ? null : decisionsOf(props.rows, journal.page))}</>
}

/** Une lecture facultative qui échoue laisse la place à son repli, sans remonter jusqu'à la garde. */
class QuietBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function ModuleList(props: {
  rows: readonly FeatureState[]
  served: readonly NetworkFeature[]
  decisions: Decisions
  onToggle: (row: FeatureState) => void
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display text-xl font-bold">
        {t("modules.listTitle")}
      </h2>
      <ul className="grid min-w-0 gap-4 min-[1024px]:grid-cols-2">
        {props.rows.map((row) => (
          <ModuleCard
            key={row.feature}
            row={row}
            state={moduleCardState(row, props.served)}
            block={toggleBlockOf(row, props.served)}
            decision={props.decisions === null ? undefined : (props.decisions.get(row.feature) ?? null)}
            onToggle={() => props.onToggle(row)}
          />
        ))}
      </ul>
    </section>
  )
}

const STATE_KEYS: Readonly<Record<ModuleCardState, string>> = {
  open: "modules.state.open",
  blocked: "modules.state.blocked",
  closed: "modules.state.closed",
}

/** L'état se lit sans la couleur : une icône et un mot. */
function StateBadge(props: { state: ModuleCardState }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const Icon = props.state === "open" ? CircleCheck : props.state === "blocked" ? LockKeyhole : CircleDashed
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
        props.state === "open" ? "bg-success-soft text-success-ink" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {t(STATE_KEYS[props.state])}
    </span>
  )
}

/** Les prérequis à relire avant d'ouvrir (fiche CH-815 § 4.3, étape 2) : une liste à lire, rien n'est coché ni gardé. */
const PREREQUISITE_KEYS = ["modules.prerequisite.team", "modules.prerequisite.texts", "modules.prerequisite.rehearsal"] as const

/** `decision` : retrouvée au journal, `null` hors de la fenêtre lue, `undefined` pendant la lecture. */
function ModuleCard(props: { row: FeatureState; state: ModuleCardState; block: ToggleBlock | null; decision: FeatureDecision | null | undefined; onToggle: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: members, locale } = useDiasporaGaT()
  const titleId = useId()
  const blockId = useId()
  const { row, decision } = props
  const moduleName = (feature: NetworkFeature) => members(`networkFeatures.names.${feature}`)
  const additions = featureMenuAdditions(row.feature)
  const date = row.updatedAt === null ? null : formatDate(row.updatedAt, locale, { dateStyle: "long", timeStyle: "short" })
  const blockText =
    props.block === null
      ? null
      : props.block.kind === "requiresParent"
        ? t("modules.card.blockedByParent", { module: moduleName(props.block.parent) })
        : t("modules.card.blockedByChildren", { modules: props.block.children.map(moduleName).join(", ") })

  return (
    <li className="min-w-0">
      <article aria-labelledby={titleId} className="flex h-full min-w-0 flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground shadow-card">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <h3 id={titleId} className="min-w-0 break-words font-display text-lg font-bold">
            {moduleName(row.feature)}
          </h3>
          <StateBadge state={props.state} />
        </header>
        <p className="text-sm leading-relaxed text-muted-foreground">{members(`networkFeatures.descriptions.${row.feature}`)}</p>
        {row.requires !== null ? <p className="text-sm">{t("modules.card.requires", { module: moduleName(row.requires) })}</p> : null}

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{t("modules.card.adds")}</h4>
          <MenuChangeList changes={additions} tone="added" />
        </div>

        <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          {date === null ? (
            <p>{t("modules.card.neverDecided")}</p>
          ) : (
            <>
              <p>{decision?.actorName ? t("modules.card.lastDecisionBy", { date, name: decision.actorName }) : t("modules.card.lastDecision", { date })}</p>
              {decision?.viaConsole ? <p>{t("modules.card.viaConsole")}</p> : null}
              {decision === undefined ? null : (
                <p className="break-words">{decision?.reason ? t("modules.card.reason", { reason: decision.reason }) : t("modules.card.reasonInJournal")}</p>
              )}
            </>
          )}
          {row.enabled && !row.open && row.requires !== null ? <p>{t("modules.card.decidedButBlocked", { module: moduleName(row.requires) })}</p> : null}
        </div>

        {!row.open ? (
          <details className="group rounded-lg bg-muted px-3 py-2 text-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
              <ListChecks aria-hidden="true" className="size-4 shrink-0" />
              {t("modules.card.prerequisites")}
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-relaxed">
              {row.requires !== null ? <li>{t("modules.prerequisite.parentOpen", { module: moduleName(row.requires) })}</li> : null}
              {PREREQUISITE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="mt-auto flex flex-col gap-2">
          {blockText !== null ? (
            <p id={blockId} className="text-[13px] text-muted-foreground">
              {blockText}
            </p>
          ) : null}
          <Button
            variant={row.enabled ? "outline" : "secondary"}
            className="self-start"
            aria-haspopup="dialog"
            aria-describedby={blockText !== null ? `${titleId} ${blockId}` : titleId}
            disabled={props.block !== null}
            onClick={props.onToggle}
          >
            {row.enabled ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {t(row.enabled ? "modules.card.close" : "modules.card.open")}
          </Button>
        </div>
      </article>
    </li>
  )
}

const CODE_SWITCH_KEYS: Readonly<Record<MembersAppCodeSwitch, { readonly name: string; readonly description: string }>> = {
  calls: { name: "modules.code.names.calls", description: "modules.code.descriptions.calls" },
  live: { name: "modules.code.names.live", description: "modules.code.descriptions.live" },
  icomPro: { name: "modules.code.names.icomPro", description: "modules.code.descriptions.icomPro" },
}

/** Appels, direct et iCom Pro : des interrupteurs du code de l'application des membres, lus ici sans aucun geste. */
function CodeSwitches() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-xl font-bold">
        {t("modules.code.title")}
      </h2>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("modules.code.lead")}</p>
      <ul className="grid min-w-0 gap-3 min-[1024px]:grid-cols-3">
        {MEMBERS_APP_CODE_SWITCHES.map((key) => (
          <li key={key} className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{t(CODE_SWITCH_KEYS[key].name)}</h3>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
                {t(MEMBERS_APP_CODE_SWITCH_STATES[key] === "open" ? "modules.code.openByCode" : "modules.code.closedByCode")}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(CODE_SWITCH_KEYS[key].description)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
