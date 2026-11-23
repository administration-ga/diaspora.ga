"use client"

/**
 * Section « Recours » (groupe Confiance, fiche CH-815 § 4.2 et lot A6) — déménagée de l'onglet
 * « Recours » du bureau de diaspora.ga (`moderation-desk-appeals.tsx`), qui ne décide plus (D5).
 *
 * Les recours montés au réseau contre une décision d'équipe, le plus ancien d'abord, filtrés par
 * le pays du contenu et par sa nature (`diaspora/moderationDesk.appealQueue`, sous
 * `networkAdminQuery`). Chaque recours montre la décision contestée et son motif, ses mesures, le
 * motif de la personne qui conteste ; l'examen se fait dans une feuille, motif obligatoire, et
 * l'annulation (mesures levées, contenu rétabli s'il avait été retiré) passe par une confirmation.
 * Le geste : `moderation/networkAdmin.reviewNetworkAppeal`, que le moteur garde, rejuge et inscrit
 * au journal à titre de `network_admin`. L'ancien décideur et la personne qui conteste n'examinent
 * pas le recours : l'écran n'offre pas le geste, le moteur le refuse.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { Button, Card, EmptyState, RadioCard, RadioGroup, Sheet, SheetContent } from "@diaspora-ga/features"
import { deskCountry, deskGround, deskZoneFromKey, type DeskParty, type DeskSurface, type DeskZone } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { ScaleIcon } from "lucide-react"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"
import { APPEALS_PAGE, type AppealRow } from "@/lib/moderation-rules"

import { CursorPager } from "./cursor-pager"
import { ConfirmStep, ContentCountry, dateTime, listOf, ReasonField, reasonSchema, RefusalLine, SurfaceSelect, useDecisionLabels, useMounted, ZoneSelect } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

const appealSchema = z.object({
  outcome: z.enum(["uphold", "overturn"], { errorMap: () => ({ message: "appeals.outcomeRequired" }) }),
  reason: reasonSchema,
})
type AppealValues = z.infer<typeof appealSchema>

type EngineZone = FunctionArgs<typeof api.modules.diaspora.moderationDesk.appealQueue>["zone"]

/** La zone du filtre, telle que le moteur la lit. */
export function engineZone(zone: DeskZone): EngineZone {
  if (zone.kind === "country") return { kind: "country", country: zone.country }
  return zone.kind === "none" ? { kind: "none" } : { kind: "all" }
}

/** La fenêtre de la file des recours, telle que le moteur la rend. */
const appealWindow = (result: FunctionReturnType<typeof api.modules.diaspora.moderationDesk.appealQueue>) => result

/** Un refus de l'examen : déjà tranché entre-temps, sinon la traduction partagée des codes du moteur. */
function appealRefusal(error: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (engineErrorCode(error) === "conflict") return t("appeals.conflict")
  return engineErrorText(error, t, "appeals.failed")
}

export function AppealsSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  const id = useId()
  const statusLine = useRef<HTMLParagraphElement>(null)
  const [zoneKey, setZoneKey] = useState("all")
  const [surface, setSurface] = useState<DeskSurface | null>(null)
  const [opened, setOpened] = useState<AppealRow | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const narrowed = zoneKey !== "all" || surface !== null

  useEffect(() => {
    if (focusRequest === 0) return
    const timer = setTimeout(() => statusLine.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [focusRequest])

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("appeals.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("appeals.lead")}</p>
      </header>
      <div role="group" aria-label={t("filters.label")} className="grid min-w-0 gap-3 min-[640px]:grid-cols-2">
        <ZoneSelect id={`${id}-pays`} value={zoneKey} onChange={setZoneKey} />
        <SurfaceSelect id={`${id}-nature`} value={surface} onChange={setSurface} />
      </div>
      {status !== null ? (
        <p ref={statusLine} tabIndex={-1} role="status" className="rounded-xl bg-muted p-3 text-sm focus-visible:shadow-focus">
          {status}
        </p>
      ) : null}
      <SectionBoundary>
        <AppealList
          key={`${zoneKey}:${surface ?? "*"}`}
          zoneKey={zoneKey}
          surface={surface}
          narrowed={narrowed}
          onOpen={setOpened}
        />
      </SectionBoundary>
      <AppealSheet
        row={opened}
        onClose={() => setOpened(null)}
        onDecided={(overturn) => {
          setOpened(null)
          setStatus(t(overturn ? "appeals.doneOverturned" : "appeals.doneUpheld"))
          setFocusRequest((value) => value + 1)
        }}
      />
    </section>
  )
}

function AppealList(props: { readonly zoneKey: string; readonly surface: DeskSurface | null; readonly narrowed: boolean; readonly onOpen: (row: AppealRow) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const zone = useMemo(() => engineZone(deskZoneFromKey(props.zoneKey)), [props.zoneKey])
  const { surface } = props
  const args = useCallback(
    (cursor: string | null) => ({
      networkId: admin.networkId,
      expectedPersonId: admin.personId,
      zone,
      ...(surface ? { surface } : {}),
      paginationOpts: { cursor, numItems: APPEALS_PAGE },
    }),
    [admin.networkId, admin.personId, zone, surface],
  )
  return (
    <CursorPager
      query={api.modules.diaspora.moderationDesk.appealQueue}
      args={args}
      windowOf={appealWindow}
      keyOf={(row) => row.appealId}
      empty={<EmptyState icon={<ScaleIcon />} title={t(props.narrowed ? "appeals.emptyFilteredTitle" : "appeals.emptyTitle")} description={t("appeals.emptyBody")} />}
    >
      {(rows) => (
        <ul className="flex min-w-0 flex-col gap-3">
          {rows.map((row) => (
            <AppealCard key={row.appealId} row={row} onOpen={() => props.onOpen(row)} />
          ))}
        </ul>
      )}
    </CursorPager>
  )
}

/** La décision contestée, telle que l'équipe l'a motivée. */
function AppealFacts(props: { readonly row: AppealRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const labels = useDecisionLabels()
  const { row } = props
  const measures = row.sanctions.map((sanction) =>
    sanction.until === null ? labels.sanction(sanction.kind) : t("appeals.measureUntil", { measure: labels.sanction(sanction.kind), date: dateTime(sanction.until, locale) }),
  )
  return (
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">{t("appeals.ground")}</dt>
      <dd className="min-w-0 break-words">{labels.ground(deskGround(row.reason))}</dd>
      {row.decidedAt !== null ? (
        <>
          <dt className="text-muted-foreground">{t("appeals.decidedAt")}</dt>
          <dd className="min-w-0">{dateTime(row.decidedAt, locale)}</dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">{t("appeals.decisionReason")}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{row.decisionReason ?? t("appeals.noReason")}</dd>
      <dt className="text-muted-foreground">{t("appeals.measures")}</dt>
      <dd className="min-w-0 break-words">{measures.length > 0 ? listOf(measures, locale) : t("appeals.noMeasure")}</dd>
      <dt className="text-muted-foreground">{t("appeals.appealReason")}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{row.appealReason}</dd>
      <dt className="text-muted-foreground">{t("appeals.filedAt")}</dt>
      <dd className="min-w-0">{dateTime(row.createdAt, locale)}</dd>
    </dl>
  )
}

function AppealCard(props: { readonly row: AppealRow; readonly onOpen: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const labels = useDecisionLabels()
  const titleId = useId()
  const { row } = props
  return (
    <li>
      <Card className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id={titleId} className="min-w-0 break-words font-semibold">
            {labels.surface(row.surface)}
          </h2>
          <ContentCountry country={deskCountry(row.country)} />
        </div>
        <AppealFacts row={row} />
        {row.party !== null ? <p className="break-words text-xs text-muted-foreground">{labels.party(row.party)}</p> : null}
        <Button variant="outline" size="sm" className="self-start" aria-haspopup="dialog" aria-label={t(row.party === null ? "appeals.openFor" : "appeals.viewFor", { surface: labels.surface(row.surface) })} onClick={props.onOpen}>
          {t(row.party === null ? "appeals.open" : "appeals.view")}
        </Button>
      </Card>
    </li>
  )
}

/** Pourquoi l'administrateur n'examine pas ce recours ; aucun formulaire n'est offert. */
function PartyNotice(props: { readonly party: DeskParty }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const labels = useDecisionLabels()
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted p-4 text-sm">
      <p className="font-semibold">{t("appeals.party.title")}</p>
      <p>{labels.party(props.party)}</p>
      <p className="text-muted-foreground">{t("appeals.party.handOver")}</p>
    </div>
  )
}

function AppealSheet(props: { readonly row: AppealRow | null; readonly onClose: () => void; readonly onDecided: (overturn: boolean) => void }) {
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
        <SheetContent title={t("appeals.sheetTitle", { surface: labels.surface(row.surface) })} description={t("appeals.sheetDescription")} closeLabel={t("decision.close")}>
          <div className="flex min-w-0 flex-col gap-4">
            <AppealFacts row={row} />
            {row.party !== null ? (
              <PartyNotice party={row.party} />
            ) : (
              <AppealForm
                key={row.appealId}
                appealId={row.appealId}
                onBusyChange={(value) => {
                  busy.current = value
                }}
                onDecided={props.onDecided}
              />
            )}
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

function AppealForm(props: { readonly appealId: Id<"appeals">; readonly onBusyChange: (busy: boolean) => void; readonly onDecided: (overturn: boolean) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const review = useMutation(api.modules.moderation.networkAdmin.reviewNetworkAppeal)
  const id = useId()
  const mounted = useMounted()
  const locked = useRef(false)
  const refusalLine = useRef<HTMLParagraphElement>(null)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<AppealValues | null>(null)
  const form = useForm<AppealValues>({ resolver: zodResolver(appealSchema), defaultValues: { reason: "" } })
  const errors = form.formState.errors

  useLayoutEffect(() => {
    if (refusal !== null) refusalLine.current?.focus()
  }, [refusal])

  const send = async (values: AppealValues) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    props.onBusyChange(true)
    setRefusal(null)
    const overturn = values.outcome === "overturn"
    try {
      await review({ networkId: admin.networkId, appealId: props.appealId, overturn, reason: values.reason.trim() })
      if (!mounted.current) return
      props.onBusyChange(false)
      props.onDecided(overturn)
    } catch (error) {
      if (!mounted.current) return
      setConfirming(null)
      setRefusal(appealRefusal(error, t))
    } finally {
      locked.current = false
      props.onBusyChange(false)
      if (mounted.current) setBusy(false)
    }
  }

  const submit = async (values: AppealValues) => {
    // Annuler la décision lève ses mesures et rétablit le contenu : une confirmation explicite d'abord.
    if (values.outcome === "overturn") {
      setRefusal(null)
      setConfirming(values)
      return
    }
    await send(values)
  }

  const disabled = busy || confirming !== null
  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-4 border-t border-border pt-4">
      <h3 className="font-semibold">{t("appeals.decisionTitle")}</h3>
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p id={`${id}-issue`} className="text-sm font-medium">
            {t("appeals.outcomeLegend")}
          </p>
          <Controller
            control={form.control}
            name="outcome"
            render={({ field }) => (
              <RadioGroup aria-labelledby={`${id}-issue`} value={field.value ?? ""} onValueChange={(value) => field.onChange(value === "uphold" || value === "overturn" ? value : undefined)}>
                <RadioCard value="uphold">
                  <span className="block font-medium">{t("appeals.uphold")}</span>
                  <span className="block text-[13px] text-muted-foreground">{t("appeals.upholdHint")}</span>
                </RadioCard>
                <RadioCard value="overturn">
                  <span className="block font-medium">{t("appeals.overturn")}</span>
                  <span className="block text-[13px] text-muted-foreground">{t("appeals.overturnHint")}</span>
                </RadioCard>
              </RadioGroup>
            )}
          />
          {errors.outcome?.message ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {t(errors.outcome.message)}
            </p>
          ) : null}
        </div>
        <ReasonField id={`${id}-motif`} hint={t("appeals.reasonHint")} error={errors.reason?.message} disabled={disabled} registration={form.register("reason")} />
      </fieldset>
      <RefusalLine text={refusal} ref={refusalLine} />
      {confirming ? (
        <ConfirmStep title={t("appeals.confirmTitle")} confirmLabel={t("appeals.confirmOverturn")} busy={busy} onConfirm={() => void send(confirming)} onBack={() => setConfirming(null)}>
          <p>{t("appeals.confirmBody")}</p>
        </ConfirmStep>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("decision.pending") : t("appeals.submit")}
          </Button>
        </div>
      )}
    </form>
  )
}
