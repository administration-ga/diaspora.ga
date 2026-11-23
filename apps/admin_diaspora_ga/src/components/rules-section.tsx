"use client"

/**
 * Section « Règles » (groupe Confiance, fiche CH-815 § 4.2 et lot A6) — déménagée de l'onglet
 * « Réglages » du bureau de diaspora.ga (`moderation-desk-settings.tsx`, MD-04 sur MC-02 du
 * moteur), qui ne décide plus (D5).
 *
 *  · ce qui vaut sans règle : les défauts du moteur, lus dans sa réponse (jamais un nombre écrit
 *    dans un texte), puis les contenus de DIASPORA.GA relus d'office ;
 *  · par rubrique : relecture avant publication, plafond de liens, cadence ; une règle se pose ou
 *    se change dans une feuille, motif obligatoire ; elle ne se retire pas ;
 *  · les mots bloqués : la liste par fenêtres, l'ajout et le retrait motivés.
 * Chaque geste passe par `moderation/networkAdmin` (`setPolicy`, `setBlockedTerm`), qui le
 * journalise à titre de `network_admin`. Aucune valeur n'est posée d'office.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { api } from "@convex/_generated/api"
import { Button, Card, Checkbox, EmptyState, Field, Input, Label, Sheet, SheetContent, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import { BanIcon, SlidersHorizontalIcon } from "lucide-react"
import { useCallback, useId, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText, invalidFieldOf } from "@/lib/engine-errors"
import {
  admissibleTerm,
  BLOCKED_TERM_BOUNDS,
  BLOCKED_TERMS_MAX,
  BLOCKED_TERMS_PAGE,
  DECISION_REASON_BOUNDS,
  heldContentOf,
  HELD_CONTENTS,
  POLICY_BOUNDS,
  POLICY_SURFACES,
  WINDOW_MINUTES,
  windowMinutesOf,
  windowMsOf,
  windowUnit,
  type BlockedTermRow,
  type HeldContent,
  type PoliciesRow,
  type PolicyValues,
  type SurfacePolicyRow,
} from "@/lib/moderation-rules"

import { CursorPager } from "./cursor-pager"
import { dateTime, ReasonField, ReasonForm, reasonSchema, RefusalLine, useDecisionLabels, useMounted } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

/** Les bornes que citent les phrases des règles et des mots bloqués (celles du moteur). */
export const RULE_VALUES = {
  linksMin: POLICY_BOUNDS.maxLinks.min,
  linksMax: POLICY_BOUNDS.maxLinks.max,
  writesMin: POLICY_BOUNDS.maxWrites.min,
  writesMax: POLICY_BOUNDS.maxWrites.max,
  windowMin: WINDOW_MINUTES.min,
  windowMax: WINDOW_MINUTES.max,
  termMin: BLOCKED_TERM_BOUNDS.min,
  termMax: BLOCKED_TERM_BOUNDS.max,
  termsMax: BLOCKED_TERMS_MAX,
} as const

/** Les contenus relus d'office, dits en clair (`HELD_CONTENTS`). */
const HELD_LABELS: Readonly<Record<HeldContent, string>> = {
  associationEvents: "rules.held.associationEvents",
  reviews: "rules.held.reviews",
  reviewReplies: "rules.held.reviewReplies",
  eventGallery: "rules.held.eventGallery",
}

/** Sur la ligne d'une rubrique aux défauts du moteur qui porte pourtant un contenu relu d'office, ce contenu dit à part. */
const HELD_NOTES: Readonly<Partial<Record<HeldContent, string>>> = {
  associationEvents: "rules.heldNote.associationEvents",
  eventGallery: "rules.heldNote.eventGallery",
}

/** Ce qu'une règle posée sur la rubrique soumet à cette règle, quand elle porte un contenu relu d'office. */
const LIFTS_HELD: Readonly<Record<HeldContent, string>> = {
  associationEvents: "rules.sheet.liftsHeld.associationEvents",
  reviews: "rules.sheet.liftsHeld.reviews",
  reviewReplies: "rules.sheet.liftsHeld.reviewReplies",
  eventGallery: "rules.sheet.liftsHeld.eventGallery",
}

/** La règle d'une rubrique sans règle posée, dite par la projection du moteur. */
const WITHOUT_LABELS: Readonly<Record<SurfacePolicyRow["withoutPolicy"], string>> = {
  defaults: "rules.without.defaults",
  held: "rules.without.held",
  unchecked: "rules.without.unchecked",
}

const WINDOW_LABELS = {
  hours: "rules.window.hours",
  minutes: "rules.window.minutes",
  seconds: "rules.window.seconds",
} as const

/** Le champ hors bornes, nommé par le moteur ou par le formulaire, dit par sa phrase. */
const FIELD_REFUSALS = {
  maxLinks: "rules.refusal.links",
  maxWrites: "rules.refusal.writes",
  windowMs: "rules.refusal.window",
} as const

const LINKS = FIELD_REFUSALS.maxLinks
const WRITES = FIELD_REFUSALS.maxWrites
const WINDOW = FIELD_REFUSALS.windowMs

const policySchema = z.object({
  preReview: z.boolean(),
  maxLinks: z.number({ invalid_type_error: LINKS }).int(LINKS).min(POLICY_BOUNDS.maxLinks.min, LINKS).max(POLICY_BOUNDS.maxLinks.max, LINKS),
  maxWrites: z.number({ invalid_type_error: WRITES }).int(WRITES).min(POLICY_BOUNDS.maxWrites.min, WRITES).max(POLICY_BOUNDS.maxWrites.max, WRITES),
  windowMinutes: z.number({ invalid_type_error: WINDOW }).int(WINDOW).min(WINDOW_MINUTES.min, WINDOW).max(WINDOW_MINUTES.max, WINDOW),
  reason: reasonSchema,
})
type PolicyFormValues = z.infer<typeof policySchema>

const termSchema = z.object({
  term: z.string().superRefine((raw, context) => {
    if (admissibleTerm(raw) === null) context.addIssue({ code: z.ZodIssueCode.custom, message: "rules.refusal.termLength" })
  }),
  reason: reasonSchema,
})
type TermFormValues = z.infer<typeof termSchema>

type Translate = ReturnType<typeof useTranslation>["t"]

/** Un refus d'une règle : le champ hors bornes nommé par le moteur, sinon la traduction partagée. */
export function policyRefusal(error: unknown, t: Translate): string {
  const field = invalidFieldOf(error)
  if (field === "maxLinks" || field === "maxWrites" || field === "windowMs") return t(FIELD_REFUSALS[field], RULE_VALUES)
  return engineErrorText(error, t, "rules.failed")
}

/** Un refus d'un mot bloqué : mot hors bornes, plafond des mots actifs atteint, sinon la traduction partagée. */
export function blockedTermRefusal(error: unknown, t: Translate): string {
  if (invalidFieldOf(error) === "term") return t("rules.refusal.termLength", RULE_VALUES)
  if (engineErrorCode(error) === "policyRefused") return t("rules.refusal.termsFull", RULE_VALUES)
  return engineErrorText(error, t, "rules.failed")
}

/** Une fenêtre de cadence dite dans l'unité la plus ronde (« 1 minute », « 2 heures »). */
function useWindowLabel(): (windowMs: number) => string {
  const { t } = useTranslation(APP_NAMESPACE)
  return (windowMs) => {
    const { unit, count } = windowUnit(windowMs)
    return t(WINDOW_LABELS[unit], { count })
  }
}

export function RulesSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("rules.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("rules.lead")}</p>
      </header>
      <SectionBoundary>
        <Policies />
      </SectionBoundary>
      <SectionBoundary>
        <BlockedTerms />
      </SectionBoundary>
    </section>
  )
}

function Policies() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const settings = useQuery(api.modules.moderation.networkAdmin.policies, { networkId: admin.networkId })
  const [editing, setEditing] = useState<SurfacePolicyRow | null>(null)
  if (settings === undefined) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{t("rules.loading")}</span>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  return (
    <>
      <WithoutRules defaults={settings.defaults} />
      <SurfaceRules settings={settings} onEdit={setEditing} />
      <PolicySheet defaults={settings.defaults} row={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/** Ce qui vaut sans règle : les défauts du moteur, puis les contenus relus d'office. */
function WithoutRules(props: { readonly defaults: PolicyValues }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const windowLabel = useWindowLabel()
  const { defaults } = props
  return (
    <div className="grid min-w-0 gap-3 min-[1024px]:grid-cols-2">
      <Card className="flex min-w-0 flex-col gap-2 p-4">
        <h2 className="font-semibold">{t("rules.defaults.title")}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          <li>{t(defaults.preReview ? "rules.defaults.preReviewOn" : "rules.defaults.preReviewOff")}</li>
          <li>{t("rules.defaults.links", { count: defaults.maxLinks })}</li>
          <li>{t("rules.defaults.writes", { count: defaults.maxWrites, window: windowLabel(defaults.windowMs) })}</li>
          <li>{t("rules.defaults.terms")}</li>
        </ul>
        <p className="text-[13px] leading-snug text-muted-foreground">{t("rules.defaults.source")}</p>
      </Card>
      <Card className="flex min-w-0 flex-col gap-2 p-4">
        <h2 className="font-semibold">{t("rules.held.title")}</h2>
        <p className="text-sm leading-relaxed">{t("rules.held.lead")}</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {HELD_CONTENTS.map((row) => (
            <li key={row.content}>{t(HELD_LABELS[row.content])}</li>
          ))}
        </ul>
        <p className="text-[13px] leading-snug text-muted-foreground">{t("rules.held.note")}</p>
      </Card>
    </div>
  )
}

/** Les rubriques de DIASPORA.GA, une ligne chacune : la règle posée, ou la règle sans réglage. */
function SurfaceRules(props: { readonly settings: PoliciesRow; readonly onEdit: (row: SurfacePolicyRow) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const rows = POLICY_SURFACES.flatMap((surface) => props.settings.surfaces.find((row) => row.surface === surface) ?? [])
  return (
    <section aria-labelledby={`${id}-rubriques`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-rubriques`} className="font-display text-xl font-bold">
          {t("rules.surfaces.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("rules.surfaces.lead")}</p>
      </div>
      <ul className="grid min-w-0 gap-2 min-[1024px]:grid-cols-2">
        {rows.map((row) => (
          <SurfaceLine key={row.surface} row={row} onEdit={() => props.onEdit(row)} />
        ))}
      </ul>
    </section>
  )
}

function SurfaceLine(props: { readonly row: SurfacePolicyRow; readonly onEdit: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const labels = useDecisionLabels()
  const windowLabel = useWindowLabel()
  const titleId = useId()
  const { row } = props
  const held = heldContentOf(row.surface as ModerationSurface)
  const heldNote = held === null ? undefined : HELD_NOTES[held]
  return (
    <li className="min-w-0">
      <Card className="flex h-full min-w-0 flex-col gap-2 p-4">
        <h3 id={titleId} className="min-w-0 break-words font-semibold">
          {labels.surface(row.surface)}
        </h3>
        {row.policy ? (
          <>
            <p className="text-xs text-muted-foreground">{t("rules.policy.since", { date: dateTime(row.policy.updatedAt, locale) })}</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              <li>{t(row.policy.preReview ? "rules.policy.preReviewOn" : "rules.policy.preReviewOff")}</li>
              <li>{t("rules.policy.links", { count: row.policy.maxLinks })}</li>
              <li>{t("rules.policy.writes", { count: row.policy.maxWrites, window: windowLabel(row.policy.windowMs) })}</li>
            </ul>
          </>
        ) : (
          <>
            <p className="text-sm">{t(WITHOUT_LABELS[row.withoutPolicy])}</p>
            {heldNote !== undefined && row.withoutPolicy === "defaults" ? <p className="text-[13px] leading-snug text-muted-foreground">{t(heldNote)}</p> : null}
          </>
        )}
        <Button variant="outline" size="sm" className="mt-auto self-start" aria-describedby={titleId} aria-haspopup="dialog" onClick={props.onEdit}>
          <SlidersHorizontalIcon aria-hidden="true" />
          {t(row.policy ? "rules.policy.change" : "rules.policy.set")}
        </Button>
      </Card>
    </li>
  )
}

/** Poser ou changer la règle d'une rubrique : relecture, liens, cadence, motif. */
function PolicySheet(props: { readonly defaults: PolicyValues; readonly row: SurfacePolicyRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const labels = useDecisionLabels()
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
        <SheetContent title={t("rules.sheet.title", { surface: labels.surface(row.surface) })} description={t("rules.sheet.description")} closeLabel={t("decision.close")}>
          <PolicyForm
            key={row.surface}
            defaults={props.defaults}
            row={row}
            onBusyChange={(value) => {
              busy.current = value
            }}
            onDone={props.onClose}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

function PolicyForm(props: { readonly defaults: PolicyValues; readonly row: SurfacePolicyRow; readonly onBusyChange: (busy: boolean) => void; readonly onDone: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setPolicy = useMutation(api.modules.moderation.networkAdmin.setPolicy)
  const labels = useDecisionLabels()
  const id = useId()
  const mounted = useMounted()
  const locked = useRef(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const { row } = props
  // La règle posée, sinon celle qui s'applique aujourd'hui : relecture de tout pour une rubrique relue d'office, défauts du moteur sinon.
  const start = row.policy ?? { ...props.defaults, preReview: row.withoutPolicy === "held" }
  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: { preReview: start.preReview, maxLinks: start.maxLinks, maxWrites: start.maxWrites, windowMinutes: windowMinutesOf(start.windowMs), reason: "" },
  })
  const errors = form.formState.errors
  const busy = form.formState.isSubmitting
  const held = row.policy === null ? heldContentOf(row.surface as ModerationSurface) : null
  const fieldError = (key: string | undefined) => (key ? t(key, RULE_VALUES) : undefined)

  const save = async (values: PolicyFormValues) => {
    if (locked.current) return
    locked.current = true
    props.onBusyChange(true)
    setRefusal(null)
    try {
      await setPolicy({
        networkId: admin.networkId,
        surface: row.surface,
        preReview: values.preReview,
        maxLinks: values.maxLinks,
        maxWrites: values.maxWrites,
        windowMs: windowMsOf(values.windowMinutes),
        reason: values.reason.trim(),
      })
      toast.success(t("rules.sheet.saved", { surface: labels.surface(row.surface) }))
      props.onBusyChange(false)
      props.onDone()
    } catch (error) {
      if (mounted.current) setRefusal(policyRefusal(error, t))
    } finally {
      locked.current = false
      props.onBusyChange(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(save)(event)} className="flex min-w-0 flex-col gap-4">
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="preReview"
            render={({ field }) => (
              <Checkbox id={`${id}-relecture`} checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} aria-describedby={`${id}-relecture-aide`} className="mt-0.5" />
            )}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor={`${id}-relecture`} className="leading-snug">
              {t("rules.sheet.preReview")}
            </Label>
            <p id={`${id}-relecture-aide`} className="text-[13px] leading-snug text-muted-foreground">
              {t("rules.sheet.preReviewHint")}
            </p>
          </div>
        </div>
        <Field id={`${id}-liens`} label={t("rules.sheet.maxLinks")} hint={t("rules.sheet.maxLinksHint", RULE_VALUES)} error={fieldError(errors.maxLinks?.message)}>
          {(field) => (
            <Input
              id={field.id}
              type="number"
              inputMode="numeric"
              min={POLICY_BOUNDS.maxLinks.min}
              max={POLICY_BOUNDS.maxLinks.max}
              step={1}
              aria-describedby={field.describedBy}
              aria-invalid={field.invalid || undefined}
              {...form.register("maxLinks", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field id={`${id}-ecritures`} label={t("rules.sheet.maxWrites")} hint={t("rules.sheet.maxWritesHint", RULE_VALUES)} error={fieldError(errors.maxWrites?.message)}>
          {(field) => (
            <Input
              id={field.id}
              type="number"
              inputMode="numeric"
              min={POLICY_BOUNDS.maxWrites.min}
              max={POLICY_BOUNDS.maxWrites.max}
              step={1}
              aria-describedby={field.describedBy}
              aria-invalid={field.invalid || undefined}
              {...form.register("maxWrites", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field id={`${id}-fenetre`} label={t("rules.sheet.window")} hint={t("rules.sheet.windowHint", RULE_VALUES)} error={fieldError(errors.windowMinutes?.message)}>
          {(field) => (
            <Input
              id={field.id}
              type="number"
              inputMode="numeric"
              min={WINDOW_MINUTES.min}
              max={WINDOW_MINUTES.max}
              step={1}
              aria-describedby={field.describedBy}
              aria-invalid={field.invalid || undefined}
              {...form.register("windowMinutes", { valueAsNumber: true })}
            />
          )}
        </Field>
        {held !== null ? <p className="rounded-xl bg-muted p-3 text-sm leading-relaxed">{t(LIFTS_HELD[held])}</p> : null}
        <p className="text-[13px] leading-snug text-muted-foreground">{t("rules.sheet.permanent")}</p>
        <ReasonField id={`${id}-motif`} hint={t("rules.sheet.reasonHint", DECISION_REASON_BOUNDS)} error={errors.reason?.message} disabled={busy} registration={form.register("reason")} />
      </fieldset>
      <RefusalLine text={refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("decision.pending") : t("rules.sheet.submit")}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={props.onDone}>
          {t("decision.cancel")}
        </Button>
      </div>
    </form>
  )
}

/** La fenêtre des mots bloqués, telle que le moteur la rend (pagination du moteur). */
const termsWindow = (result: FunctionReturnType<typeof api.modules.moderation.networkAdmin.blockedTermsPage>) => ({
  items: result.page,
  isDone: result.isDone,
  continueCursor: result.isDone ? null : result.continueCursor,
})

/** Les mots bloqués du réseau : la liste par fenêtres, l'ajout motivé, le retrait motivé. */
function BlockedTerms() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setBlockedTerm = useMutation(api.modules.moderation.networkAdmin.setBlockedTerm)
  const id = useId()
  const [removing, setRemoving] = useState<BlockedTermRow | null>(null)
  const busy = useRef(false)
  const args = useCallback((cursor: string | null) => ({ networkId: admin.networkId, paginationOpts: { cursor, numItems: BLOCKED_TERMS_PAGE } }), [admin.networkId])
  return (
    <section aria-labelledby={`${id}-mots`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-mots`} className="font-display text-xl font-bold">
          {t("rules.terms.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("rules.terms.lead", RULE_VALUES)}</p>
        <p className="text-[13px] leading-snug text-muted-foreground">{t("rules.terms.waveNote")}</p>
      </div>
      <CursorPager
        query={api.modules.moderation.networkAdmin.blockedTermsPage}
        args={args}
        windowOf={termsWindow}
        keyOf={(row) => row.termId}
        empty={<EmptyState icon={<BanIcon />} title={t("rules.terms.emptyTitle")} description={t("rules.terms.emptyBody")} />}
      >
        {(rows) => (
          <ul className="flex min-w-0 flex-col gap-2">
            {rows.map((row) => (
              <TermLine key={row.termId} row={row} onRemove={() => setRemoving(row)} />
            ))}
          </ul>
        )}
      </CursorPager>
      <AddTerm />
      <Sheet
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy.current) setRemoving(null)
        }}
      >
        {removing ? (
          <SheetContent title={t("rules.terms.removeTitle", { term: removing.term })} description={t("rules.terms.removeBody")} closeLabel={t("decision.close")}>
            <ReasonForm
              submitLabel={t("rules.terms.removeConfirm")}
              onBusyChange={(value) => {
                busy.current = value
              }}
              onCancel={() => setRemoving(null)}
              onSubmit={async (reason) => {
                try {
                  await setBlockedTerm({ networkId: admin.networkId, term: removing.term, active: false, reason })
                } catch (error) {
                  return blockedTermRefusal(error, t)
                }
                toast.success(t("rules.terms.removed", { term: removing.term }))
                busy.current = false
                setRemoving(null)
                return null
              }}
            />
          </SheetContent>
        ) : null}
      </Sheet>
    </section>
  )
}

function TermLine(props: { readonly row: BlockedTermRow; readonly onRemove: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const termId = useId()
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p id={termId} className="break-words font-medium">
          {props.row.term}
        </p>
        <p className="text-xs text-muted-foreground">{t("rules.terms.since", { date: dateTime(props.row.updatedAt, locale) })}</p>
      </div>
      <Button variant="ghost" size="sm" aria-describedby={termId} aria-haspopup="dialog" onClick={props.onRemove}>
        {t("rules.terms.remove")}
      </Button>
    </li>
  )
}

function AddTerm() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setBlockedTerm = useMutation(api.modules.moderation.networkAdmin.setBlockedTerm)
  const id = useId()
  const mounted = useMounted()
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<TermFormValues>({ resolver: zodResolver(termSchema), defaultValues: { term: "", reason: "" } })
  const busy = form.formState.isSubmitting
  const errors = form.formState.errors

  const add = async (values: TermFormValues) => {
    setRefusal(null)
    const term = values.term.trim()
    try {
      await setBlockedTerm({ networkId: admin.networkId, term, active: true, reason: values.reason.trim() })
    } catch (error) {
      if (mounted.current) setRefusal(blockedTermRefusal(error, t))
      return
    }
    toast.success(t("rules.terms.added", { term: admissibleTerm(term) ?? term }))
    if (mounted.current) form.reset()
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <h3 className="font-semibold">{t("rules.terms.addTitle")}</h3>
      <form noValidate onSubmit={(event) => void form.handleSubmit(add)(event)} className="flex min-w-0 flex-col gap-3">
        <Field id={`${id}-mot`} label={t("rules.terms.term")} hint={t("rules.terms.termHint", RULE_VALUES)} error={errors.term?.message ? t(errors.term.message, RULE_VALUES) : undefined}>
          {(field) => (
            <Input
              id={field.id}
              aria-describedby={field.describedBy}
              aria-invalid={field.invalid || undefined}
              autoComplete="off"
              maxLength={BLOCKED_TERM_BOUNDS.max}
              disabled={busy}
              {...form.register("term")}
            />
          )}
        </Field>
        <ReasonField id={`${id}-motif`} hint={t("rules.terms.reasonHint", DECISION_REASON_BOUNDS)} error={errors.reason?.message} disabled={busy} registration={form.register("reason")} />
        <RefusalLine text={refusal} />
        <Button type="submit" className="self-start" disabled={busy}>
          {busy ? t("decision.pending") : t("rules.terms.add")}
        </Button>
      </form>
    </Card>
  )
}
