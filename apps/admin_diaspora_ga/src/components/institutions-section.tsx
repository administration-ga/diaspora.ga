"use client"

/**
 * Section « Institutions et pages officielles » (groupe Communauté, fiche CH-815 § 4.2 et lot A7) :
 * les pages d'institution « Officiel » DE CE RÉSEAU, leur signataire et leur état
 * (`pages/networkAdmin.officialPages`, lot A2 du moteur), et les gestes de l'administration du
 * réseau, chacun motivé et inscrit au journal à titre de `network_admin` :
 *  · créer une page officielle (nom, adresse si le nom n'en donne pas une valable, pays facultatif,
 *    signataire choisi par son identifiant public) — le badge ne vaut que dans ce réseau ;
 *  · désigner ou remplacer le signataire d'une page active (invitation : le signataire accepte de
 *    son côté, identité vérifiée exigée par le moteur) ;
 *  · mettre une page en sommeil, ou la réveiller, après confirmation.
 * Le module « Pages » fermé, le moteur refuse les lectures : la section le dit et renvoie aux
 * modules. Le retrait du badge reste à la plateforme.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import { isResidenceCountry } from "@diaspora-ga/domain"
import { Button, Card, Checkbox, CountryTag, EmptyState, Field, Input, normalizeHandle, residenceCountryOptions, Sheet, SheetContent, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvex, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { BadgeCheckIcon, LandmarkIcon, MoonIcon, SunIcon, UserRoundCheckIcon } from "lucide-react"
import { useCallback, useId, useRef, useState, type ReactNode, type RefObject } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText, invalidFieldOf } from "@/lib/engine-errors"
import {
  OFFICIAL_PAGES_PAGE,
  OFFICIAL_PAGES_STATUSES,
  PAGE_HANDLE_BOUNDS,
  PAGE_NAME_BOUNDS,
  PAGES_FEATURE,
  proposedPageHandle,
  signatoryName,
  SLEEP_DAYS,
  type OfficialPageRow,
  type OfficialPagesStatus,
} from "@/lib/official-pages"

import { CursorPager } from "./cursor-pager"
import { dateTime, ReasonField, ReasonForm, reasonSchema, RefusalLine, SELECT_CLASS, useMounted } from "./decision-parts"
import { MemberPicker, type MemberCandidate } from "./member-picker"
import { ModuleClosedNotice } from "./module-closed-notice"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary, SectionFailure } from "./section-boundary"

type Translate = ReturnType<typeof useTranslation>["t"]

const pagesWindow = (result: FunctionReturnType<typeof api.modules.pages.networkAdmin.officialPages>) => ({
  items: result.page,
  isDone: result.isDone,
  continueCursor: result.continueCursor,
})

/**
 * Un refus d'un geste sur une page officielle : l'identité du signataire, l'adresse prise, le même
 * signataire, l'état changé entre-temps, la mesure du juge ; sinon la traduction partagée.
 */
export function officialPageRefusal(error: unknown, t: Translate): string {
  if (engineErrorRule(error)?.rule === "PAGE_SIGNATORY_IDENTITY_REQUIRED") return t("institutions.refusal.signatoryIdentity")
  const code = engineErrorCode(error)
  if (code === "handleUnavailable") return t("institutions.refusal.handleTaken")
  if (invalidFieldOf(error) === "replacesPersonId") return t("institutions.refusal.sameSignatory")
  if (code === "notFound") return t("institutions.refusal.notFound")
  if (code === "conflict") return t("institutions.refusal.conflict")
  return engineErrorText(error, t, "institutions.failed")
}

/** La recherche d'un signataire : un membre actif du réseau, par son identifiant public. */
function useSignatoryLookup() {
  const convex = useConvex()
  const admin = useNetworkAdmin()
  return useCallback(
    async (handle: string): Promise<MemberCandidate | null> =>
      await convex.query(api.modules.pages.networkAdmin.signatoryCandidate, { networkId: admin.networkId, handle: normalizeHandle(handle) }),
    [convex, admin.networkId],
  )
}

export function InstitutionsSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("institutions.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("institutions.lead")}</p>
      </header>
      <SectionBoundary>
        <PagesGate />
      </SectionBoundary>
    </section>
  )
}

/** Le module « Pages » ouvert ou fermé, selon le moteur ; fermé, aucune lecture des pages ne part. */
function PagesGate() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const rows = useQuery(api.modules.networks.features.settings, { networkId: admin.networkId })
  if (rows === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  const closed = <ModuleClosedNotice title={t("institutions.closed.title")} body={t("institutions.closed.body")} linkLabel={t("institutions.closed.link")} />
  if (!rows.some((row) => row.feature === PAGES_FEATURE && row.open)) return closed
  return (
    // La clé a pu se refermer entre-temps : le refus de la lecture se dit comme un module fermé.
    <SectionBoundary fallback={(error, retry) => (engineErrorCode(error) === "notFound" ? closed : <SectionFailure error={error} retry={retry} />)}>
      <OfficialPages />
      <CreateOfficialPage />
    </SectionBoundary>
  )
}

type PendingAction = { readonly kind: "designate" | "sleep" | "wake"; readonly page: OfficialPageRow }

function OfficialPages() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const id = useId()
  const [status, setStatus] = useState<OfficialPagesStatus>("active")
  const [pending, setPending] = useState<PendingAction | null>(null)
  const args = useCallback(
    (cursor: string | null) => ({ networkId: admin.networkId, status, paginationOpts: { cursor, numItems: OFFICIAL_PAGES_PAGE } }),
    [admin.networkId, status],
  )
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <section aria-labelledby={`${id}-titre`} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <h2 id={`${id}-titre`} className="flex items-center gap-2 font-display text-xl font-bold">
            <LandmarkIcon aria-hidden="true" className="size-5" />
            {t("institutions.listTitle")}
          </h2>
          <div className="flex min-w-0 flex-col gap-1.5 min-[640px]:w-72">
            <label htmlFor={`${id}-etat`} className="text-sm font-medium">
              {t("institutions.statusFilter")}
            </label>
            <select
              id={`${id}-etat`}
              className={SELECT_CLASS}
              value={status}
              onChange={(event) => setStatus(OFFICIAL_PAGES_STATUSES.find((value) => value === event.target.value) ?? "active")}
            >
              <option value="active">{t("institutions.statusActive")}</option>
              <option value="inactive">{t("institutions.statusInactive")}</option>
            </select>
          </div>
        </div>
        {/* Le refus indistinct d'une fenêtre (module refermé entre-temps) remonte à la garde de la section. */}
        <SectionBoundary key={status} fallback={(error, retry) => (engineErrorCode(error) === "notFound" ? <Rethrow error={error} /> : <SectionFailure error={error} retry={retry} />)}>
          <CursorPager
            query={api.modules.pages.networkAdmin.officialPages}
            args={args}
            windowOf={pagesWindow}
            keyOf={(row) => row.pageId}
            empty={
              <EmptyState
                icon={<LandmarkIcon />}
                title={t(status === "active" ? "institutions.emptyActiveTitle" : "institutions.emptyInactiveTitle")}
                description={t(status === "active" ? "institutions.emptyActiveBody" : "institutions.emptyInactiveBody")}
              />
            }
          >
            {(rows) => (
              <ul className="flex min-w-0 flex-col gap-3">
                {rows.map((row) => (
                  <PageLine key={row.pageId} page={row} onAction={(kind) => setPending({ kind, page: row })} />
                ))}
              </ul>
            )}
          </CursorPager>
        </SectionBoundary>
      </section>
      <DesignateSheet page={pending?.kind === "designate" ? pending.page : null} onClose={() => setPending(null)} />
      <SleepSheet page={pending?.kind === "sleep" ? pending.page : null} onClose={() => setPending(null)} />
      <WakeSheet page={pending?.kind === "wake" ? pending.page : null} onClose={() => setPending(null)} />
    </Card>
  )
}

/** Rend l'erreur à la garde englobante (le module fermé se dit pour toute la section). */
function Rethrow(props: { readonly error: unknown }): never {
  throw props.error
}

function StateBadge(props: { readonly page: OfficialPageRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const label =
    props.page.state === "active"
      ? t("institutions.state.active")
      : props.page.state === "asleep"
        ? t("institutions.state.asleep")
        : props.page.state === "expired"
          ? t("institutions.state.expired")
          : t("institutions.state.withdrawn")
  return <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{label}</span>
}

function PageLine(props: { readonly page: OfficialPageRow; readonly onAction: (kind: PendingAction["kind"]) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const { page } = props
  const signatory = page.signatory
  const signatoryLabel = signatory === null ? null : (signatoryName(signatory) ?? t("institutions.neutralName"))
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
            <BadgeCheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{page.name}</span>
          </p>
          <p className="break-words text-sm text-muted-foreground">{`@${page.handle}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {page.country !== null && isResidenceCountry(page.country) ? <CountryTag country={page.country} /> : null}
          <StateBadge page={page} />
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("institutions.signatory")}</dt>
        <dd className="min-w-0 break-words">
          {signatory === null ? (
            <span className="text-destructive">{t("institutions.noSignatory")}</span>
          ) : signatory.accepted ? (
            signatoryLabel
          ) : (
            t("institutions.invitationPending", { name: signatoryLabel })
          )}
        </dd>
        <dt className="text-muted-foreground">{t("institutions.createdAt")}</dt>
        <dd className="min-w-0">{dateTime(page.createdAt, locale)}</dd>
        {page.sleepEndsAt !== null && (page.state === "asleep" || page.state === "expired") ? (
          <>
            <dt className="text-muted-foreground">{t("institutions.sleep")}</dt>
            <dd className="min-w-0">
              {t(page.state === "asleep" ? "institutions.sleepUntil" : "institutions.sleepExpired", { date: dateTime(page.sleepEndsAt, locale) })}
            </dd>
          </>
        ) : null}
      </dl>
      {page.state === "withdrawn" ? <p className="text-[13px] leading-snug text-muted-foreground">{t("institutions.withdrawnNote")}</p> : null}
      {page.state === "active" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t(signatory === null ? "institutions.designateFor" : "institutions.replaceFor", { name: page.name })} onClick={() => props.onAction("designate")}>
            <UserRoundCheckIcon aria-hidden="true" />
            {t(signatory === null ? "institutions.designate" : "institutions.replace")}
          </Button>
          <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t("institutions.sleepFor", { name: page.name })} onClick={() => props.onAction("sleep")}>
            <MoonIcon aria-hidden="true" />
            {t("institutions.sleepAction")}
          </Button>
        </div>
      ) : null}
      {page.state === "asleep" || page.state === "expired" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t("institutions.wakeFor", { name: page.name })} onClick={() => props.onAction("wake")}>
            <SunIcon aria-hidden="true" />
            {t("institutions.wakeAction")}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/** Une fenêtre de décision : fermée pendant l'envoi, jamais par un clic au dehors. */
function DecisionSheet(props: { readonly open: boolean; readonly busy: RefObject<boolean>; readonly title: string; readonly description: string; readonly onClose: () => void; readonly children: ReactNode }) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.busy.current) props.onClose()
      }}
    >
      {props.open ? (
        <SheetContent title={props.title} description={props.description} closeLabel={t("decision.close")}>
          {props.children}
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

function DesignateSheet(props: { readonly page: OfficialPageRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const designate = useMutation(api.modules.pages.networkAdmin.designateSignatory)
  const lookup = useSignatoryLookup()
  const busy = useRef(false)
  const id = useId()
  const [candidate, setCandidate] = useState<MemberCandidate | null>(null)
  const [replace, setReplace] = useState(false)
  const { page } = props
  const current = page?.signatory ?? null
  const currentName = current === null ? null : (signatoryName(current) ?? t("institutions.neutralName"))
  const close = () => {
    setCandidate(null)
    setReplace(false)
    props.onClose()
  }
  return (
    <DecisionSheet
      open={page !== null}
      busy={busy}
      title={page ? t("institutions.designateTitle", { name: page.name }) : ""}
      description={t("institutions.designateBody")}
      onClose={close}
    >
      {page ? (
        <div className="flex min-w-0 flex-col gap-4">
          <MemberPicker label={t("institutions.signatoryHandle")} candidate={candidate} onChange={setCandidate} lookup={lookup} />
          {current !== null ? (
            <div className="flex min-w-0 items-start gap-3">
              <Checkbox id={`${id}-remplacer`} checked={replace} onCheckedChange={(value) => setReplace(value === true)} />
              <label htmlFor={`${id}-remplacer`} className="min-w-0 text-sm leading-snug">
                {t("institutions.replaceCurrent", { name: currentName })}
              </label>
            </div>
          ) : null}
          {candidate !== null ? (
            <ReasonForm
              key={candidate.personId}
              submitLabel={t("institutions.designateConfirm")}
              onBusyChange={(value) => {
                busy.current = value
              }}
              onSubmit={async (reason) => {
                try {
                  const result = await designate({
                    networkId: admin.networkId,
                    pageId: page.pageId,
                    personId: candidate.personId,
                    ...(replace && current !== null ? { replacesPersonId: current.personId } : {}),
                    reason,
                  })
                  if (result.invited) toast.success(t("institutions.invited", { name: candidate.displayName, page: page.name }))
                  else if (result.replaced) toast.success(t("institutions.replaced", { name: currentName, page: page.name }))
                  else toast.success(t("institutions.unchanged", { name: candidate.displayName }))
                  busy.current = false
                  close()
                  return null
                } catch (error) {
                  return officialPageRefusal(error, t)
                }
              }}
              onCancel={close}
            />
          ) : null}
        </div>
      ) : null}
    </DecisionSheet>
  )
}

function SleepSheet(props: { readonly page: OfficialPageRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const sleep = useMutation(api.modules.pages.networkAdmin.sleepOfficialPage)
  const busy = useRef(false)
  const { page } = props
  return (
    <DecisionSheet
      open={page !== null}
      busy={busy}
      title={page ? t("institutions.sleepTitle", { name: page.name }) : ""}
      description={t("institutions.sleepBody", { days: SLEEP_DAYS })}
      onClose={props.onClose}
    >
      {page ? (
        <ReasonForm
          key={page.pageId}
          submitLabel={t("institutions.sleepConfirm")}
          destructive
          onBusyChange={(value) => {
            busy.current = value
          }}
          onSubmit={async (reason) => {
            try {
              const result = await sleep({ networkId: admin.networkId, pageId: page.pageId, reason })
              toast.success(t("institutions.slept", { name: page.name, date: dateTime(result.sleepEndsAt, locale) }))
              busy.current = false
              props.onClose()
              return null
            } catch (error) {
              return officialPageRefusal(error, t)
            }
          }}
          onCancel={props.onClose}
        />
      ) : null}
    </DecisionSheet>
  )
}

function WakeSheet(props: { readonly page: OfficialPageRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const wake = useMutation(api.modules.pages.networkAdmin.wakeOfficialPage)
  const busy = useRef(false)
  const { page } = props
  return (
    <DecisionSheet open={page !== null} busy={busy} title={page ? t("institutions.wakeTitle", { name: page.name }) : ""} description={t("institutions.wakeBody")} onClose={props.onClose}>
      {page ? (
        <ReasonForm
          key={page.pageId}
          submitLabel={t("institutions.wakeConfirm")}
          onBusyChange={(value) => {
            busy.current = value
          }}
          onSubmit={async (reason) => {
            try {
              await wake({ networkId: admin.networkId, pageId: page.pageId, reason })
              toast.success(t("institutions.woken", { name: page.name }))
              busy.current = false
              props.onClose()
              return null
            } catch (error) {
              return officialPageRefusal(error, t)
            }
          }}
          onCancel={props.onClose}
        />
      ) : null}
    </DecisionSheet>
  )
}

const createSchema = z
  .object({
    name: z.string().trim().min(1, "institutions.nameLength").max(PAGE_NAME_BOUNDS.max, "institutions.nameLength"),
    handle: z.string(),
    country: z.string(),
    reason: reasonSchema,
  })
  .superRefine((values, context) => {
    if (values.name.trim().length === 0) return
    const proposed = proposedPageHandle(values.name, values.handle)
    if (proposed.problem === null) return
    const message = proposed.fromName ? "institutions.handleRequired" : proposed.problem === "charset" ? "institutions.handleCharset" : "institutions.handleLength"
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["handle"], message })
  })
type CreateValues = z.infer<typeof createSchema>

/** Les bornes que citent les phrases du nom et de l'adresse d'une page. */
const PAGE_VALUES = { nameMax: PAGE_NAME_BOUNDS.max, handleMin: PAGE_HANDLE_BOUNDS.min, handleMax: PAGE_HANDLE_BOUNDS.max } as const

function CreateOfficialPage() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const create = useMutation(api.modules.pages.networkAdmin.createOfficialPage)
  const lookup = useSignatoryLookup()
  const id = useId()
  const mounted = useMounted()
  const [candidate, setCandidate] = useState<MemberCandidate | null>(null)
  const [missingSignatory, setMissingSignatory] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  // Change après une création : le sélecteur est remonté, son champ d'identifiant repart vide.
  const [pickerKey, setPickerKey] = useState(0)
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { name: "", handle: "", country: "", reason: "" } })
  const busy = form.formState.isSubmitting
  const errors = form.formState.errors
  const name = useWatch({ control: form.control, name: "name" })
  const handle = useWatch({ control: form.control, name: "handle" })
  const proposed = proposedPageHandle(name, handle)
  const countries = residenceCountryOptions(locale)

  const submit = async (values: CreateValues) => {
    setRefusal(null)
    if (candidate === null) {
      setMissingSignatory(true)
      return
    }
    const typedHandle = values.handle.trim()
    const country = countries.find((option) => option.code === values.country)?.code
    try {
      const created = await create({
        networkId: admin.networkId,
        name: values.name.trim(),
        ...(typedHandle ? { handle: typedHandle } : {}),
        ...(country ? { country } : {}),
        signatoryPersonId: candidate.personId,
        reason: values.reason.trim(),
      })
      toast.success(t("institutions.created", { name: values.name.trim(), handle: created.handle }))
      if (!mounted.current) return
      // Tout le formulaire repart vide : champs, signataire choisi et avis de signataire manquant.
      form.reset({ name: "", handle: "", country: "", reason: "" })
      setCandidate(null)
      setMissingSignatory(false)
      setRefusal(null)
      setPickerKey((key) => key + 1)
    } catch (error) {
      if (mounted.current) setRefusal(officialPageRefusal(error, t))
    }
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <section aria-labelledby={`${id}-creer`} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-creer`} className="flex items-center gap-2 font-display text-xl font-bold">
            <LandmarkIcon aria-hidden="true" className="size-5" />
            {t("institutions.createTitle")}
          </h2>
          <p className="text-[13px] leading-snug text-muted-foreground">{t("institutions.createLead")}</p>
        </div>
        <MemberPicker
          key={pickerKey}
          label={t("institutions.signatoryHandle")}
          candidate={candidate}
          onChange={(value) => {
            setCandidate(value)
            if (value !== null) setMissingSignatory(false)
          }}
          lookup={lookup}
          disabled={busy}
        />
        {missingSignatory ? <RefusalLine text={t("institutions.signatoryRequired")} /> : null}
        <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
          <Field id={`${id}-nom`} label={t("institutions.name")} error={errors.name?.message ? t(errors.name.message, PAGE_VALUES) : undefined}>
            {(field) => (
              <Input id={field.id} aria-describedby={field.describedBy} aria-invalid={field.invalid || undefined} aria-required maxLength={PAGE_NAME_BOUNDS.max} disabled={busy} {...form.register("name")} />
            )}
          </Field>
          <Field
            id={`${id}-adresse`}
            label={t("institutions.handle")}
            hint={proposed.value !== null ? t("institutions.handlePreview", { handle: proposed.value }) : t("institutions.handleHint", PAGE_VALUES)}
            error={errors.handle?.message ? t(errors.handle.message, PAGE_VALUES) : undefined}
          >
            {(field) => (
              <Input
                id={field.id}
                aria-describedby={field.describedBy}
                aria-invalid={field.invalid || undefined}
                autoComplete="off"
                maxLength={PAGE_HANDLE_BOUNDS.max}
                disabled={busy}
                {...form.register("handle")}
              />
            )}
          </Field>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-pays`} className="text-sm font-medium">
              {t("institutions.country")}
            </label>
            <select id={`${id}-pays`} className={SELECT_CLASS} disabled={busy} {...form.register("country")}>
              <option value="">{t("institutions.countryNone")}</option>
              {countries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <ReasonField id={`${id}-motif`} error={errors.reason?.message} disabled={busy} registration={form.register("reason")} />
          <RefusalLine text={refusal} />
          <Button type="submit" className="self-start" disabled={busy}>
            {busy ? t("decision.pending") : t("institutions.create")}
          </Button>
        </form>
      </section>
    </Card>
  )
}
