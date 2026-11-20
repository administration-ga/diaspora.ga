"use client"

/**
 * « Fonctionnalités du réseau » (ADR-0041 du moteur), dans l'onglet « Réglages » du guichet,
 * réservé à l'administration du réseau : le moteur refuse toute autre personne (refus
 * indistinct), l'onglet n'est offert qu'avec `canManagePolicy`.
 *
 * Le réseau sert d'emblée son socle ; chacun des huit modules s'ouvre ou se ferme ici, motif
 * obligatoire, inscrit au journal des décisions du moteur. Les dépendances se disent avant le
 * geste (ouvrir exige les pages ouvertes ; fermer les pages exige leurs modules fermés) ; le
 * moteur les rejuge. Fermer ne supprime rien. Une bascule remonte l'application sur la
 * nouvelle liste de modules (la source montée suit les clés ouvertes).
 */
import { Button, Card, Sheet, SheetContent, Skeleton } from "@diaspora-ga/features"
import {
  NETWORK_FEATURE_PARENTS,
  useOptionalDataSource,
  type ActionErrorCode,
  type NetworkFeature,
  type NetworkFeaturesCapability,
  type NetworkFeatureState,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { PowerIcon, PowerOffIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { DESK_ACCESS_ERRORS, DeskErrorLine, DeskReasonForm, deskDateTime } from "./moderation-desk-parts"

/** Le refus de dépendance d'une bascule, dit avant le geste ; `null` : la bascule est admise. */
export function featureToggleBlock(row: NetworkFeatureState, open: readonly NetworkFeature[]): "network_feature_requires_parent" | "network_feature_has_open_children" | null {
  if (!row.enabled) {
    const parent = NETWORK_FEATURE_PARENTS[row.feature]
    return parent === null || open.includes(parent) ? null : "network_feature_requires_parent"
  }
  const children = (Object.keys(NETWORK_FEATURE_PARENTS) as NetworkFeature[]).filter((child) => NETWORK_FEATURE_PARENTS[child] === row.feature)
  return children.some((child) => open.includes(child)) ? "network_feature_has_open_children" : null
}

export function NetworkFeaturesSettings() {
  // Facultative : sans source montée (guichet rendu seul), ou sans la capacité, la section se tait.
  const capability = useOptionalDataSource()?.networkFeatures ?? null
  return capability ? <FeaturesSection capability={capability} /> : null
}

function FeaturesSection(props: { readonly capability: NetworkFeaturesCapability }) {
  const { t } = useDiasporaGaT()
  const id = useId()
  const settings = props.capability.useSettings()
  const [editing, setEditing] = useState<NetworkFeatureState | null>(null)

  let body
  if (settings.status === "loading") {
    body = (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{t("networkFeatures.settings.loading")}</span>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  } else if (settings.status === "error") {
    body = DESK_ACCESS_ERRORS.has(settings.code)
      ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("networkFeatures.settings.restricted")}</p>
      : <Card role="alert" className="p-4"><DeskErrorLine code={settings.code} /></Card>
  } else {
    const open = settings.data.filter((row) => row.open).map((row) => row.feature)
    body = (
      <ul className="grid min-w-0 gap-2 lg:grid-cols-2">
        {settings.data.map((row) => <FeatureLine key={row.feature} row={row} block={featureToggleBlock(row, open)} onToggle={() => setEditing(row)} />)}
      </ul>
    )
  }

  return (
    <section aria-labelledby={`${id}-fonctionnalites`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-fonctionnalites`} className="font-display text-lg font-bold">{t("networkFeatures.settings.title")}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("networkFeatures.settings.lead")}</p>
      </div>
      {body}
      <ToggleSheet capability={props.capability} row={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function FeatureLine(props: { readonly row: NetworkFeatureState; readonly block: ActionErrorCode | null; readonly onToggle: () => void }) {
  const { t, locale } = useDiasporaGaT()
  const titleId = useId()
  const blockId = useId()
  const { row } = props
  return (
    <li>
      <Card className="flex h-full min-w-0 flex-col gap-2 p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 id={titleId} className="min-w-0 break-words font-semibold">{t(`networkFeatures.names.${row.feature}`)}</h4>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
            <span aria-hidden className={row.open ? "size-2 rounded-full bg-[var(--success)]" : "size-2 rounded-full bg-muted-foreground"} />
            {t(row.open ? "networkFeatures.settings.open" : "networkFeatures.settings.closed")}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(`networkFeatures.descriptions.${row.feature}`)}</p>
        {row.requires !== null ? <p className="text-[13px] text-muted-foreground">{t("networkFeatures.settings.requires", { feature: t(`networkFeatures.names.${row.requires}`) })}</p> : null}
        {row.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("networkFeatures.settings.since", { date: deskDateTime(row.updatedAt, locale) })}</p> : null}
        {props.block !== null ? <p id={blockId} className="text-[13px] text-muted-foreground">{t(`errors.${props.block}`)}</p> : null}
        <Button
          variant="outline"
          size="sm"
          className="mt-auto self-start"
          aria-describedby={props.block !== null ? `${titleId} ${blockId}` : titleId}
          aria-haspopup="dialog"
          disabled={props.block !== null}
          onClick={props.onToggle}
        >
          {row.enabled ? <PowerOffIcon aria-hidden /> : <PowerIcon aria-hidden />}
          {t(row.enabled ? "networkFeatures.settings.closeAction" : "networkFeatures.settings.openAction")}
        </Button>
      </Card>
    </li>
  )
}

/** Ouvrir ou fermer : ce que la bascule change, le motif, puis le geste. */
function ToggleSheet(props: { readonly capability: NetworkFeaturesCapability; readonly row: NetworkFeatureState | null; readonly onClose: () => void }) {
  const { t } = useDiasporaGaT()
  const busy = useRef(false)
  const { row } = props
  const name = row === null ? "" : t(`networkFeatures.names.${row.feature}`)
  const opening = row !== null && !row.enabled
  return (
    <Sheet open={row !== null} onOpenChange={(open) => { if (!open && !busy.current) props.onClose() }}>
      {row ? (
        <SheetContent
          title={t(opening ? "networkFeatures.settings.sheet.openTitle" : "networkFeatures.settings.sheet.closeTitle", { feature: name })}
          description={t(opening ? "networkFeatures.settings.sheet.openDescription" : "networkFeatures.settings.sheet.closeDescription")}
          closeLabel={t("common.close")}
        >
          <DeskReasonForm
            key={row.feature}
            submitLabel={t(opening ? "networkFeatures.settings.sheet.confirmOpen" : "networkFeatures.settings.sheet.confirmClose")}
            destructive={!opening}
            onBusyChange={(value) => { busy.current = value }}
            onCancel={props.onClose}
            onSubmit={async (reason) => {
              const result = await props.capability.setFeature({ feature: row.feature, enabled: opening, reason })
              if (!result.ok) return result.code
              const done = !result.value.changed ? "networkFeatures.settings.sheet.unchanged" : opening ? "networkFeatures.settings.sheet.opened" : "networkFeatures.settings.sheet.closedDone"
              toast.success(t(done, { feature: name }))
              busy.current = false
              props.onClose()
              return null
            }}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
