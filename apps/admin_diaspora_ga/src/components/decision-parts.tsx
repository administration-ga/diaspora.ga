"use client"

/**
 * Briques communes des sections de décision (recours, équipe et responsables, règles) — reprises
 * des briques du bureau de diaspora.ga (`moderation-desk-parts.tsx`) pour ce que le bureau ne
 * décide plus (fiche CH-815, D5) : libellés des valeurs fermées, pays du contenu, filtres, champ
 * et formulaire de motif, étape de confirmation, refus dit en clair. Les libellés des valeurs
 * fermées (natures, motifs, mesures, parties) restent ceux de l'espace `diaspora-ga`, que le
 * bureau lit aussi ; tout le reste est dans l'espace `admin`.
 */
import { api } from "@convex/_generated/api"
import type { CountryCode } from "@diaspora-ga/domain"
import { Button, CountryTag, Field, Textarea, formatDate, handleRefusal, normalizeHandle, residenceCountryOptions } from "@diaspora-ga/features"
import { DESK_SURFACES, type DeskGround, type DeskParty, type DeskSanctionKind, type DeskSurface } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "convex/react"
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { DECISION_REASON_BOUNDS } from "@/lib/moderation-rules"

import { useNetworkAdmin } from "./network-admin-context"

export const SELECT_CLASS = "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-[15px] focus-visible:shadow-focus aria-invalid:border-destructive"

/** Le motif d'une décision, tel que les sections le bornent (clé d'erreur de l'espace `admin`). */
export const reasonSchema = z.string().trim().min(DECISION_REASON_BOUNDS.min, "decision.reasonLength").max(DECISION_REASON_BOUNDS.max, "decision.reasonLength")

const reasonOnlySchema = z.object({ reason: reasonSchema })
type ReasonValues = z.infer<typeof reasonOnlySchema>

/** L'identifiant public d'un membre à chercher (ajout à une équipe, nomination d'un responsable). */
export const handleLookupSchema = z.object({
  handle: z.string().superRefine((raw, context) => {
    const handle = normalizeHandle(raw)
    if (handle.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "lookup.required" })
    else if (handleRefusal(handle)) context.addIssue({ code: z.ZodIssueCode.custom, message: "lookup.invalid" })
  }),
})
export type HandleLookupValues = z.infer<typeof handleLookupSchema>

/** Date et heure d'une décision, dans la langue de l'écran. */
export function dateTime(timestamp: number, locale: string): string {
  return formatDate(timestamp, locale, { dateStyle: "medium", timeStyle: "short" })
}

/** Une énumération lisible (« retrait du contenu et suspension »). */
export function listOf(items: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { type: "conjunction" }).format(items)
  } catch {
    return items.join(", ")
  }
}

/** Les libellés des valeurs fermées de la modération, ceux que le bureau des membres lit aussi. */
export function useDecisionLabels() {
  const { t } = useDiasporaGaT()
  return {
    surface: (surface: DeskSurface) => t(`moderationDesk.surface.${surface}`),
    ground: (ground: DeskGround) => t(`moderationDesk.ground.${ground}`),
    party: (party: DeskParty) => t(`moderationDesk.party.${party}`),
    sanction: (kind: DeskSanctionKind) => t(`moderationDesk.sanction.${kind}`),
  }
}

/** Vrai tant que le composant est monté : une réponse arrivée après lui ne change plus rien. */
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

/** Le pays que porte le contenu, ou « sans pays ». */
export function ContentCountry(props: { readonly country: CountryCode | null }) {
  const { t } = useTranslation(APP_NAMESPACE)
  if (props.country === null) {
    return <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t("filters.noCountry")}</span>
  }
  return <CountryTag country={props.country} />
}

/** Un refus dit en clair, focalisable (`ref`, prop ordinaire de React 19), annoncé. */
export function RefusalLine({ text, ref }: { readonly text: string | null; readonly ref?: Ref<HTMLParagraphElement> }) {
  if (text === null) return null
  return (
    <p ref={ref} tabIndex={-1} role="alert" className="rounded-md text-sm text-destructive focus-visible:shadow-focus">
      {text}
    </p>
  )
}

/** Le sélecteur de pays du contenu : toute la file, sans pays, pays ouverts puis tous les pays. */
export function ZoneSelect(props: { readonly id: string; readonly value: string; readonly onChange: (key: string) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const hubs = useQuery(api.modules.diaspora.hubs.listOpenCountries, { networkId: admin.networkId })
  const open = (hubs ?? []).map((hub) => hub.country)
  const options = residenceCountryOptions(locale)
  const openOptions = options.filter((option) => open.includes(option.code))
  const otherOptions = options.filter((option) => !open.includes(option.code))
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">
        {t("filters.zone")}
      </label>
      <select id={props.id} className={SELECT_CLASS} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="all">{t("filters.zoneAll")}</option>
        <option value="none">{t("filters.zoneNone")}</option>
        {openOptions.length > 0 ? (
          <optgroup label={t("filters.zoneOpen")}>
            {openOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={t("filters.zoneOther")}>
          {otherOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  )
}

/** Le sélecteur de nature du contenu (toutes les natures modérées par le moteur). */
export function SurfaceSelect(props: { readonly id: string; readonly value: DeskSurface | null; readonly onChange: (surface: DeskSurface | null) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const labels = useDecisionLabels()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">
        {t("filters.surface")}
      </label>
      <select id={props.id} className={SELECT_CLASS} value={props.value ?? ""} onChange={(event) => props.onChange(DESK_SURFACES.find((surface) => surface === event.target.value) ?? null)}>
        <option value="">{t("filters.surfaceAll")}</option>
        {DESK_SURFACES.map((surface) => (
          <option key={surface} value={surface}>
            {labels.surface(surface)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Le motif d'une décision : obligatoire, borné ; l'erreur est une clé de l'espace `admin`. */
export function ReasonField(props: {
  readonly id: string
  readonly hint?: string
  readonly error: string | undefined
  readonly disabled: boolean
  readonly registration: UseFormRegisterReturn
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Field id={props.id} label={t("decision.reason")} hint={props.hint ?? t("decision.reasonHint", DECISION_REASON_BOUNDS)} error={props.error ? t(props.error, DECISION_REASON_BOUNDS) : undefined}>
      {(field) => (
        <Textarea
          id={field.id}
          aria-describedby={field.describedBy}
          aria-invalid={field.invalid || undefined}
          aria-required
          maxLength={DECISION_REASON_BOUNDS.max}
          rows={3}
          disabled={props.disabled}
          {...props.registration}
        />
      )}
    </Field>
  )
}

/**
 * L'étape de confirmation d'une décision lourde : ce qui va se produire, puis le geste explicite.
 * Le focus s'y pose à l'ouverture.
 */
export function ConfirmStep(props: { readonly title: string; readonly confirmLabel: string; readonly busy: boolean; readonly onConfirm: () => void; readonly onBack: () => void; readonly children: ReactNode }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-destructive p-4">
      <h4 id={id} ref={heading} tabIndex={-1} className="rounded-md font-semibold focus-visible:shadow-focus">
        {props.title}
      </h4>
      <div className="flex flex-col gap-2 text-sm leading-relaxed">{props.children}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? t("decision.pending") : props.confirmLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onBack}>
          {t("decision.back")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Un motif seul, puis le geste : la confirmation d'un retrait, d'un ajout ou d'un changement de
 * rôle. `onSubmit` rend la phrase du refus, ou `null` quand le geste a abouti.
 */
export function ReasonForm(props: {
  readonly submitLabel: string
  readonly destructive?: boolean
  readonly onBusyChange?: (busy: boolean) => void
  readonly onSubmit: (reason: string) => Promise<string | null>
  readonly onCancel: () => void
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const mounted = useMounted()
  const locked = useRef(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<ReasonValues>({ resolver: zodResolver(reasonOnlySchema), defaultValues: { reason: "" } })
  const busy = form.formState.isSubmitting

  const send = async (values: ReasonValues) => {
    if (locked.current) return
    locked.current = true
    props.onBusyChange?.(true)
    setRefusal(null)
    try {
      const text = await props.onSubmit(values.reason.trim())
      if (mounted.current && text !== null) setRefusal(text)
    } finally {
      locked.current = false
      props.onBusyChange?.(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(send)(event)} className="flex min-w-0 flex-col gap-3">
      <ReasonField id={`${id}-motif`} error={form.formState.errors.reason?.message} disabled={busy} registration={form.register("reason")} />
      <RefusalLine text={refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={props.destructive ? "destructive" : "primary"} disabled={busy}>
          {busy ? t("decision.pending") : props.submitLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={props.onCancel}>
          {t("decision.cancel")}
        </Button>
      </div>
    </form>
  )
}
