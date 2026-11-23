"use client"

/**
 * Section « Fondateurs » (groupe Communauté, fiche CH-815 § 4.2 et lot A7) : la cohorte fondatrice
 * de DIASPORA.GA, plafonnée (`diaspora/founders.cohort`, lot A3 du moteur) — qui a été admis, par
 * qui, quand et pourquoi, avec ou sans dispense d'ancienneté pour parrainer ; les admissions
 * retirées et leur cause. L'administration du réseau admet un membre DÉJÀ entré dans le réseau,
 * trouvé par son identifiant public (rien n'est créé d'office), et retire une admission, motif à
 * l'appui ; chaque décision entre au journal à titre de `network_admin`. Cohorte pleine : la
 * section le dit et n'offre plus l'admission ; le refus du moteur se dit de même s'il survient.
 */
import { api } from "@convex/_generated/api"
import { Avatar, Button, Card, Checkbox, EmptyState, formatNumber, normalizeHandle, Sheet, SheetContent, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvex, useMutation, useQuery } from "convex/react"
import { AwardIcon, UserMinusIcon, UserPlusIcon } from "lucide-react"
import { useCallback, useId, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"
import { cohortFull, founderRefusalOf, personName, type Admission, type CohortView } from "@/lib/founders"

import { dateTime, ReasonField, ReasonForm, reasonSchema, RefusalLine, useMounted } from "./decision-parts"
import { MemberPicker, type MemberCandidate } from "./member-picker"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

type Translate = ReturnType<typeof useTranslation>["t"]

/** Un refus d'une décision sur la cohorte : le refus métier du domaine, sinon la traduction partagée. */
export function founderRefusal(error: unknown, t: Translate): string {
  const refusal = founderRefusalOf(error)
  if (refusal !== null) return t(refusal.key, refusal.params)
  return engineErrorText(error, t, "founders.failed")
}

const admitSchema = z.object({ seniorityWaiver: z.boolean(), reason: reasonSchema })
type AdmitValues = z.infer<typeof admitSchema>

export function FoundersSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("founders.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("founders.lead")}</p>
      </header>
      <SectionBoundary>
        <Cohort />
      </SectionBoundary>
    </section>
  )
}

function Cohort() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const id = useId()
  const view = useQuery(api.modules.diaspora.founders.cohort, { networkId: admin.networkId })
  const [withdrawing, setWithdrawing] = useState<Admission | null>(null)
  if (view === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  const full = cohortFull(view)
  return (
    <>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <section aria-labelledby={`${id}-cohorte`} className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <h2 id={`${id}-cohorte`} className="flex items-center gap-2 font-display text-xl font-bold">
              <AwardIcon aria-hidden="true" className="size-5" />
              {t("founders.cohortTitle")}
            </h2>
            <p className="font-mono text-lg font-semibold">
              {t("founders.count", { count: view.activeCount, shown: formatNumber(view.activeCount, locale), max: formatNumber(view.cohortMax, locale) })}
            </p>
          </div>
          {full ? (
            <p role="status" className="rounded-xl bg-muted p-3 text-sm">
              {t("founders.full", { max: formatNumber(view.cohortMax, locale) })}
            </p>
          ) : null}
          {view.active.length === 0 ? (
            <EmptyState icon={<AwardIcon />} title={t("founders.emptyTitle")} description={t("founders.emptyBody")} />
          ) : (
            <ul className="flex min-w-0 flex-col gap-3">
              {view.active.map((admission) => (
                <AdmissionLine key={admission.admissionId} admission={admission} onWithdraw={() => setWithdrawing(admission)} />
              ))}
            </ul>
          )}
          <WithdrawnList view={view} />
        </section>
      </Card>
      {full ? null : <AdmitFounder />}
      <WithdrawSheet admission={withdrawing} onClose={() => setWithdrawing(null)} />
    </>
  )
}

function AdmissionLine(props: { readonly admission: Admission; readonly onWithdraw: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const { admission } = props
  const name = personName(admission.person) ?? t("founders.neutralName")
  const by = admission.admittedBy === null ? t("founders.admittedBySeed") : (personName(admission.admittedBy) ?? t("founders.neutralName"))
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Avatar id={admission.personId} name={name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{name}</p>
          {admission.person.handle && admission.person.displayName ? <p className="break-words text-sm text-muted-foreground">{`@${admission.person.handle}`}</p> : null}
        </div>
        {admission.seniorityWaiver ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t("founders.waiverBadge")}</span>
        ) : null}
      </div>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("founders.admittedOn")}</dt>
        <dd className="min-w-0">{dateTime(admission.admittedAt, locale)}</dd>
        <dt className="text-muted-foreground">{t("founders.admittedBy")}</dt>
        <dd className="min-w-0 break-words">{by}</dd>
        <dt className="text-muted-foreground">{t("founders.reason")}</dt>
        <dd className="min-w-0 whitespace-pre-line break-words">{admission.reason}</dd>
      </dl>
      <Button variant="outline" size="sm" className="self-start" aria-haspopup="dialog" aria-label={t("founders.withdrawFor", { name })} onClick={props.onWithdraw}>
        <UserMinusIcon aria-hidden="true" />
        {t("founders.withdraw")}
      </Button>
    </li>
  )
}

function WithdrawnList(props: { readonly view: CohortView }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  if (props.view.withdrawn.length === 0) return null
  return (
    <details className="min-w-0 border-t border-border pt-4">
      <summary className="cursor-pointer rounded-md font-semibold focus-visible:shadow-focus">{t("founders.withdrawnTitle")}</summary>
      <ul className="mt-3 flex min-w-0 flex-col gap-2">
        {props.view.withdrawn.map((admission) => {
          const name = personName(admission.person) ?? t("founders.neutralName")
          const cause =
            admission.withdrawnBy === "departure"
              ? t("founders.causeDeparture")
              : admission.withdrawnByPerson !== null
                ? t("founders.causeDecisionBy", { name: personName(admission.withdrawnByPerson) ?? t("founders.neutralName") })
                : t("founders.causeDecision")
          return (
            <li key={admission.admissionId} className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted p-3 text-sm">
              <p className="break-words font-medium">{name}</p>
              <p className="break-words text-muted-foreground">
                {admission.withdrawnAt === null ? cause : t("founders.withdrawnOn", { date: dateTime(admission.withdrawnAt, locale), cause })}
              </p>
              {admission.withdrawalReason ? <p className="whitespace-pre-line break-words">{admission.withdrawalReason}</p> : null}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

/** La recherche d'un membre à admettre : un membre actif du réseau, par son identifiant public. */
function useFounderLookup() {
  const convex = useConvex()
  const admin = useNetworkAdmin()
  return useCallback(
    async (handle: string): Promise<MemberCandidate | null> => await convex.query(api.modules.diaspora.founders.candidate, { networkId: admin.networkId, handle: normalizeHandle(handle) }),
    [convex, admin.networkId],
  )
}

function AdmitFounder() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const admit = useMutation(api.modules.diaspora.founders.admit)
  const lookup = useFounderLookup()
  const id = useId()
  const mounted = useMounted()
  const [candidate, setCandidate] = useState<MemberCandidate | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<AdmitValues>({ resolver: zodResolver(admitSchema), defaultValues: { seniorityWaiver: false, reason: "" } })
  const busy = form.formState.isSubmitting

  const submit = async (values: AdmitValues) => {
    if (candidate === null) return
    setRefusal(null)
    try {
      await admit({ networkId: admin.networkId, personId: candidate.personId, reason: values.reason.trim(), seniorityWaiver: values.seniorityWaiver })
      toast.success(t("founders.admitted", { name: candidate.displayName }))
      if (!mounted.current) return
      form.reset()
      setCandidate(null)
    } catch (error) {
      if (mounted.current) setRefusal(founderRefusal(error, t))
    }
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <section aria-labelledby={`${id}-admettre`} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-admettre`} className="flex items-center gap-2 font-display text-xl font-bold">
            <UserPlusIcon aria-hidden="true" className="size-5" />
            {t("founders.admitTitle")}
          </h2>
          <p className="text-[13px] leading-snug text-muted-foreground">{t("founders.admitLead")}</p>
        </div>
        <MemberPicker
          label={t("founders.handle")}
          candidate={candidate}
          onChange={(value) => {
            setCandidate(value)
            setRefusal(null)
          }}
          lookup={lookup}
          disabled={busy}
        />
        {candidate !== null ? (
          <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
            <Controller
              control={form.control}
              name="seniorityWaiver"
              render={({ field }) => (
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    id={`${id}-dispense`}
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(value === true)}
                    disabled={busy}
                    aria-describedby={`${id}-dispense-aide`}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <label htmlFor={`${id}-dispense`} className="text-sm font-medium leading-snug">
                      {t("founders.waiver")}
                    </label>
                    <p id={`${id}-dispense-aide`} className="text-[13px] leading-snug text-muted-foreground">
                      {t("founders.waiverHint")}
                    </p>
                  </div>
                </div>
              )}
            />
            <ReasonField id={`${id}-motif`} error={form.formState.errors.reason?.message} disabled={busy} registration={form.register("reason")} />
            <RefusalLine text={refusal} />
            <Button type="submit" className="self-start" disabled={busy}>
              {busy ? t("decision.pending") : t("founders.admitConfirm")}
            </Button>
          </form>
        ) : null}
      </section>
    </Card>
  )
}

function WithdrawSheet(props: { readonly admission: Admission | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const withdraw = useMutation(api.modules.diaspora.founders.withdraw)
  const busy = useRef(false)
  const { admission } = props
  const name = admission ? (personName(admission.person) ?? t("founders.neutralName")) : ""
  return (
    <Sheet
      open={admission !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) props.onClose()
      }}
    >
      {admission ? (
        <SheetContent title={t("founders.withdrawTitle", { name })} description={t("founders.withdrawBody")} closeLabel={t("decision.close")}>
          <ReasonForm
            key={admission.admissionId}
            submitLabel={t("founders.withdrawConfirm")}
            destructive
            onBusyChange={(value) => {
              busy.current = value
            }}
            onSubmit={async (reason) => {
              try {
                await withdraw({ networkId: admin.networkId, personId: admission.personId, reason })
                toast.success(t("founders.withdrawn", { name }))
                busy.current = false
                props.onClose()
                return null
              } catch (error) {
                return founderRefusal(error, t)
              }
            }}
            onCancel={props.onClose}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
