"use client"

import { NETWORK_FEATURE_PARENTS, networkFeatureChildren, networkFeatureToggleRefusal, openNetworkFeatures, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { api } from "@convex/_generated/api"
import { Button, Checkbox, Label, RadioCard, RadioGroup, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { MEMBER_MENU_WIDEST_SITUATION, memberMenu, menuDifference } from "@diaspora-ga/features/navigation"
import { useQuery } from "convex/react"
import { Blocks, RotateCcw } from "lucide-react"
import NextLink from "next/link"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import {
  DEFAULT_PREVIEW_PERSON,
  PREVIEW_HOLDINGS,
  PREVIEW_MEMBERSHIPS,
  previewSituation,
  servedFeatures,
  type FeatureState,
  type PreviewHolding,
  type PreviewMembership,
  type PreviewPerson,
} from "@/lib/network-features"
import { routes } from "@/lib/routes"

import { MemberMenuPreview, MenuChangeList } from "./member-menu-preview"
import { useNetworkAdmin } from "./network-admin-context"

/**
 * Section « Aperçu du menu » (fiche CH-815 § 4.2 et § 4.3, étape 3) : cocher des modules pour
 * voir le menu EXACT des membres avant de les ouvrir — rail du bureau, barre du téléphone, menu
 * du compte —, calculé par la même fonction que la coque de diaspora.ga (« l'aperçu ne peut pas
 * mentir », § 5). On part de l'état courant du réseau ; RIEN n'est écrit, nulle part : aucune
 * fonction d'écriture n'est même branchée ici. Les cases suivent la règle d'ordre du moteur
 * (un module qui vit sur les pages exige les pages ; les pages ne se décochent qu'une fois
 * leurs modules décochés).
 */
export function MenuPreviewSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const titleId = useId()
  const rows = useQuery(api.modules.networks.features.settings, { networkId: admin.networkId })
  return (
    <section aria-labelledby={titleId} className="flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("preview.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("preview.lead")}</p>
        <Button asChild variant="secondary" className="self-start">
          <NextLink href={routes.modules()}>
            <Blocks aria-hidden="true" />
            {t("preview.modulesLink")}
          </NextLink>
        </Button>
      </header>
      {rows === undefined ? (
        <div role="status" className="grid gap-4 min-[1024px]:grid-cols-[320px_minmax(0,1fr)]">
          <span className="sr-only">{t("preview.loading")}</span>
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <PreviewWorkbench rows={rows} />
      )}
    </section>
  )
}

function PreviewWorkbench(props: { rows: readonly FeatureState[] }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const current = servedFeatures(props.rows)
  // L'état de départ : les modules servis aujourd'hui (des cases d'aperçu, pas un consentement).
  const [ticked, setTicked] = useState<readonly NetworkFeature[]>(current)
  const [person, setPerson] = useState<PreviewPerson>(DEFAULT_PREVIEW_PERSON)
  const keys = props.rows.map((row) => row.feature)
  const served = openNetworkFeatures(ticked.map((feature) => ({ feature, enabled: true })))
  const situation = previewSituation(person)
  const menu = memberMenu({ ...situation, openFeatures: served })
  // Ce qui change par rapport au menu servi aujourd'hui, pour tout public touché.
  const before = memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: current })
  const after = memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: served })
  const added = menuDifference(before, after)
  const removed = menuDifference(after, before)
  const pristine = served.length === current.length && served.every((feature) => current.includes(feature))
  const comparisonId = useId()

  return (
    <div className="grid min-w-0 gap-6 min-[1024px]:grid-cols-[320px_minmax(0,1fr)] min-[1024px]:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <ModulesFieldset keys={keys} ticked={served} current={current} onChange={setTicked} />
        {pristine ? null : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setTicked(current)}>
            <RotateCcw aria-hidden="true" />
            {t("preview.reset")}
          </Button>
        )}
        <PersonFieldset person={person} onChange={setPerson} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-live="polite" aria-labelledby={`${comparisonId}-titre`} className="flex flex-col gap-3 rounded-xl bg-muted p-4">
          <h2 id={`${comparisonId}-titre`} className="font-display text-lg font-bold">
            {t("preview.comparison")}
          </h2>
          {added.length === 0 && removed.length === 0 ? <p className="text-sm text-muted-foreground">{t("preview.noChange")}</p> : null}
          {added.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{t("preview.added")}</h3>
              <MenuChangeList changes={added} tone="added" />
            </div>
          ) : null}
          {removed.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{t("preview.removed")}</h3>
              <MenuChangeList changes={removed} tone="removed" />
            </div>
          ) : null}
        </section>
        <h2 className="font-display text-lg font-bold">{t("preview.menuTitle")}</h2>
        <MemberMenuPreview menu={menu} />
      </div>
    </div>
  )
}

/** Les modules à cocher, dans l'ordre du moteur ; une case que la règle d'ordre refuse est grisée, et dit pourquoi. */
function ModulesFieldset(props: { keys: readonly NetworkFeature[]; ticked: readonly NetworkFeature[]; current: readonly NetworkFeature[]; onChange: (next: readonly NetworkFeature[]) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const members = useDiasporaGaT().t
  const id = useId()
  const name = (feature: NetworkFeature) => members(`networkFeatures.names.${feature}`)
  return (
    <div role="group" aria-labelledby={`${id}-titre`} aria-describedby={`${id}-aide`} className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-card">
      <h2 id={`${id}-titre`} className="font-display text-base font-bold">
        {t("preview.modulesLegend")}
      </h2>
      <p id={`${id}-aide`} className="text-[13px] text-muted-foreground">
        {t("preview.modulesHint")}
      </p>
      <ul className="flex flex-col gap-2">
        {props.keys.map((feature) => {
          const checked = props.ticked.includes(feature)
          const refusal = networkFeatureToggleRefusal({ feature, enabled: !checked, open: props.ticked })
          const parent = NETWORK_FEATURE_PARENTS[feature]
          const reason =
            refusal === "NETWORK_FEATURE_REQUIRES_PARENT" && parent !== null
              ? t("preview.requiresParent", { module: name(parent) })
              : refusal === "NETWORK_FEATURE_HAS_OPEN_CHILDREN"
                ? t("preview.hasChildren", { modules: networkFeatureChildren(feature).filter((child) => props.ticked.includes(child)).map(name).join(", ") })
                : null
          const controlId = `${id}-${feature}`
          return (
            <li key={feature} className="flex min-w-0 items-start gap-3">
              <Checkbox
                id={controlId}
                checked={checked}
                disabled={reason !== null}
                aria-describedby={reason !== null ? `${controlId}-raison` : undefined}
                onCheckedChange={(value) => props.onChange(value === true ? [...props.ticked, feature] : props.ticked.filter((key) => key !== feature))}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <Label htmlFor={controlId} className="leading-snug">
                  {name(feature)}
                </Label>
                {props.current.includes(feature) ? <p className="text-[13px] text-muted-foreground">{t("preview.currentlyOpen")}</p> : null}
                {reason !== null ? (
                  <p id={`${controlId}-raison`} className="text-[13px] text-muted-foreground">
                    {reason}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const MEMBERSHIP_KEYS: Readonly<Record<PreviewMembership, string>> = {
  active: "preview.membership.active",
  pending: "preview.membership.pending",
  suspended: "preview.membership.suspended",
}

const HOLDING_KEYS: Readonly<Record<PreviewHolding, string>> = {
  holdsPageRole: "preview.holding.holdsPageRole",
  holdsAssociation: "preview.holding.holdsAssociation",
  moderator: "preview.holding.moderator",
  pilotReader: "preview.holding.pilotReader",
}

function isPreviewMembership(value: string): value is PreviewMembership {
  return (PREVIEW_MEMBERSHIPS as readonly string[]).includes(value)
}

/** Le membre que l'on regarde : son adhésion, puis ce qu'il tient (des entrées n'apparaissent qu'avec un contenu ou un rôle). */
function PersonFieldset(props: { person: PreviewPerson; onChange: (next: PreviewPerson) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  return (
    <div role="group" aria-labelledby={`${id}-titre`} className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-card">
      <h2 id={`${id}-titre`} className="font-display text-base font-bold">
        {t("preview.personLegend")}
      </h2>
      <p id={`${id}-adhesion`} className="text-sm font-medium">
        {t("preview.membership.label")}
      </p>
      <RadioGroup
        aria-labelledby={`${id}-adhesion`}
        value={props.person.membership}
        onValueChange={(value) => {
          if (isPreviewMembership(value)) props.onChange({ ...props.person, membership: value })
        }}
      >
        {PREVIEW_MEMBERSHIPS.map((membership) => (
          <RadioCard key={membership} value={membership}>
            <span className="text-sm">{t(MEMBERSHIP_KEYS[membership])}</span>
          </RadioCard>
        ))}
      </RadioGroup>
      <ul className="flex flex-col gap-2 border-t border-border pt-3">
        {PREVIEW_HOLDINGS.map((holding) => {
          const controlId = `${id}-${holding}`
          return (
            <li key={holding} className="flex min-w-0 items-start gap-3">
              <Checkbox
                id={controlId}
                checked={props.person.holdings[holding]}
                onCheckedChange={(value) => props.onChange({ ...props.person, holdings: { ...props.person.holdings, [holding]: value === true } })}
                className="mt-0.5"
              />
              <Label htmlFor={controlId} className="leading-snug">
                {t(HOLDING_KEYS[holding])}
              </Label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
