"use client"

import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import { NETWORK_FEATURE_REASON_MIN, networkFeatureChildren, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { Button, Field, Sheet, SheetContent, Textarea } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { gatewayOfFeature, MEMBER_MENU_WIDEST_SITUATION, memberMenu, menuDifference, type MemberGatewayId } from "@diaspora-ga/features/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { Power, PowerOff } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"
import type { FeatureState } from "@/lib/network-features"

import { MenuChangeList } from "./member-menu-preview"

/** Les bornes du motif, celles du moteur : dix caractères au moins, la borne du journal au plus. */
const REASON_BOUNDS = { min: NETWORK_FEATURE_REASON_MIN, max: DECISION_REASON_MAX } as const

const reasonSchema = z.object({
  reason: z.string().trim().min(REASON_BOUNDS.min, "modules.dialog.reasonLength").max(REASON_BOUNDS.max, "modules.dialog.reasonLength"),
})
type ReasonValues = z.infer<typeof reasonSchema>

/** Ce que la fenêtre annonce pour un module ordinaire : son menu, et les pages que le moteur sert ou refuse. */
const DESCRIPTION_KEYS = { open: "modules.dialog.openDescription", close: "modules.dialog.closeDescription" } as const

/**
 * … et pour un module qui règle une passerelle (CH-863) : une entrée du menu du compte vers une
 * autre application. Le moteur ne sert aucune page pour elle : la fenêtre ne l'affirme pas.
 */
const GATEWAY_DESCRIPTION_KEYS: Readonly<Record<MemberGatewayId, { readonly open: string; readonly close: string }>> = {
  consulate: { open: "modules.dialog.openConsulateDescription", close: "modules.dialog.closeConsulateDescription" },
}

/**
 * Ouvrir ou fermer un module (fiche CH-815 § 4.3, étapes 4 et 7) : ce que la bascule change au
 * menu des membres dans l'état actuel, les dépendances rappelées, le motif (dix caractères au
 * moins, React Hook Form et Zod), puis le geste — `modules/networks/features.setFeature`, que le
 * moteur garde (administrateur en session prouvée), rejuge (motif, dépendances) et inscrit au
 * journal. Un refus se dit par la traduction partagée des codes du moteur ; un succès, par un avis.
 */
export function ModuleToggleDialog(props: { networkId: Id<"networks">; row: FeatureState | null; served: readonly NetworkFeature[]; onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const busy = useRef(false)
  const { row } = props
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) props.onClose()
      }}
    >
      {row ? (
        <ToggleContent
          key={`${row.feature}:${String(row.enabled)}`}
          networkId={props.networkId}
          row={row}
          served={props.served}
          onBusyChange={(value) => {
            busy.current = value
          }}
          onClose={props.onClose}
          closeLabel={t("modules.dialog.close")}
        />
      ) : null}
    </Sheet>
  )
}

function ToggleContent(props: {
  networkId: Id<"networks">
  row: FeatureState
  served: readonly NetworkFeature[]
  onBusyChange: (busy: boolean) => void
  onClose: () => void
  closeLabel: string
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  const members = useDiasporaGaT().t
  const id = useId()
  const setFeature = useMutation(api.modules.networks.features.setFeature)
  const locked = useRef(false)
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: "" } })
  const pending = form.formState.isSubmitting
  const { row, served } = props
  const opening = !row.enabled
  const name = members(`networkFeatures.names.${row.feature}`)

  // Ce que la bascule change au menu, dans l'état actuel du réseau, pour tout public touché.
  const without = served.filter((feature) => feature !== row.feature)
  const changes = opening
    ? menuDifference(memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: served }), memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: [...served, row.feature] }))
    : menuDifference(memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: without }), memberMenu({ ...MEMBER_MENU_WIDEST_SITUATION, openFeatures: served }))
  const children = networkFeatureChildren(row.feature)
  const gateway = gatewayOfFeature(row.feature)
  const description = (gateway === null ? DESCRIPTION_KEYS : GATEWAY_DESCRIPTION_KEYS[gateway])[opening ? "open" : "close"]

  const submit = async (values: ReasonValues) => {
    if (locked.current) return
    locked.current = true
    props.onBusyChange(true)
    setFailure(null)
    try {
      const result = await setFeature({ networkId: props.networkId, feature: row.feature, enabled: opening, reason: values.reason })
      const done = !result.changed ? "modules.dialog.unchanged" : opening ? "modules.dialog.opened" : "modules.dialog.closed"
      toast.success(t(done, { module: name }))
      props.onBusyChange(false)
      props.onClose()
    } catch (error) {
      setFailure(engineErrorText(error, t, "modules.dialog.failed"))
      props.onBusyChange(false)
    } finally {
      locked.current = false
    }
  }

  const reasonError = form.formState.errors.reason?.message
  return (
    <SheetContent
      title={t(opening ? "modules.dialog.openTitle" : "modules.dialog.closeTitle", { module: name })}
      description={t(description)}
      closeLabel={props.closeLabel}
    >
      <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby={`${id}-effet`} className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <h3 id={`${id}-effet`} className="text-sm font-semibold">
            {t(opening ? "modules.dialog.effectAdded" : "modules.dialog.effectRemoved")}
          </h3>
          {changes.length > 0 ? <MenuChangeList changes={changes} tone={opening ? "added" : "removed"} /> : <p className="text-sm text-muted-foreground">{t("modules.dialog.effectNone")}</p>}
        </section>
        {opening && row.requires !== null ? (
          <p className="text-sm">{t("modules.dialog.requires", { module: members(`networkFeatures.names.${row.requires}`) })}</p>
        ) : null}
        {!opening && children.length > 0 ? (
          <p className="text-sm">{t("modules.dialog.childrenClosed", { modules: children.map((child) => members(`networkFeatures.names.${child}`)).join(", ") })}</p>
        ) : null}
        <Field id={`${id}-motif`} label={t("modules.dialog.reason")} hint={t("modules.dialog.reasonHint", REASON_BOUNDS)} error={reasonError ? t(reasonError, REASON_BOUNDS) : undefined}>
          {(control) => (
            <Textarea
              id={control.id}
              aria-describedby={control.describedBy}
              aria-invalid={control.invalid || undefined}
              disabled={pending}
              maxLength={REASON_BOUNDS.max}
              {...form.register("reason")}
            />
          )}
        </Field>
        {failure !== null ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {failure}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={opening ? "primary" : "destructive"} disabled={pending}>
            {opening ? <Power aria-hidden="true" /> : <PowerOff aria-hidden="true" />}
            {pending ? t("modules.dialog.pending") : t(opening ? "modules.dialog.confirmOpen" : "modules.dialog.confirmClose")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={props.onClose}>
            {t("modules.dialog.cancel")}
          </Button>
        </div>
      </form>
    </SheetContent>
  )
}
