"use client"

/**
 * Section « Mesure » (groupe Pilotage, fiche CH-815 § 4.2, § 8 et lot A6) — déménagée de l'écran
 * `/pilote` de diaspora.ga (`pilot-metrics-screen.tsx`), qui est retiré : la mesure n'est plus lue
 * par les membres, modérateurs compris.
 *
 * Des comptes agrégés par jour et par pays, matérialisés par le passage nocturne du moteur, sans
 * contenu privé (`diaspora/pilotMetrics.pilotMetrics`, sous `networkAdminQuery` gardée par la clé
 * `pilotMetrics`) :
 *   · un compte sous le seuil se dit « moins de », jamais le chiffre ;
 *   · chaque taux garde sa base et n'est publié qu'avec une part et un écart au-dessus du seuil ;
 *   · le délai de première réponse se donne par classe d'heures.
 * Tant que le module « Mesure » est fermé, le moteur refuse la lecture : la section le dit et
 * renvoie à la section « Modules », sans jamais afficher un chiffre à la place.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import {
  DAY_MS,
  parsePilotScope,
  PILOT_DEFAULT_WINDOW_DAYS,
  PILOT_DISPLAY_THRESHOLD,
  PILOT_METRIC_GROUPS,
  PILOT_WINDOW_DAYS,
  type CountryCode,
  type PilotCount,
  type PilotHours,
  type PilotIndicator,
  type PilotMetricGroup,
  type PilotMetricId,
  type PilotPart,
  type PilotWindowDays,
} from "@diaspora-ga/domain"
import { Button, Card, countryName, EmptyState, Field, formatDate, formatNumber, RadioCard, RadioGroup, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useQuery } from "convex/react"
import { BlocksIcon, ClockIcon, LockIcon, ShieldCheckIcon } from "lucide-react"
import NextLink from "next/link"
import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { toPilotMetricsView, type PilotMetricsView } from "@/lib/pilot-metrics"
import { routes } from "@/lib/routes"

import { SELECT_CLASS } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary, SectionFailure } from "./section-boundary"

type Translate = ReturnType<typeof useTranslation>["t"]
type MeasuredView = Extract<PilotMetricsView, { measured: true }>
type RatioIndicator = Extract<PilotIndicator, { kind: "ratio" }>

/** La clé du module qui garde la mesure (ADR-0041 du moteur). */
const METRICS_FEATURE = "pilotMetrics"

/** Les bornes d'une période sont des jours UTC : elles se lisent en UTC, quel que soit le fuseau du lecteur. */
const UTC_DAY: Intl.DateTimeFormatOptions = { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }
const PASS_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }

export function MetricsSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("metrics.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("metrics.lead")}</p>
        <p className="flex items-start gap-2 text-sm font-medium">
          <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{t("metrics.privacyBadge")}</span>
        </p>
      </header>
      <SectionBoundary>
        <MetricsGate />
      </SectionBoundary>
    </section>
  )
}

/** Le module « Mesure » ouvert ou fermé, selon le moteur ; fermé, aucune lecture de la mesure ne part. */
function MetricsGate() {
  const admin = useNetworkAdmin()
  const rows = useQuery(api.modules.networks.features.settings, { networkId: admin.networkId })
  if (rows === undefined) return <MetricsSkeleton />
  const open = rows.some((row) => row.feature === METRICS_FEATURE && row.open)
  if (!open) return <ClosedModule />
  return (
    // La clé a pu se refermer entre-temps : le refus de la lecture se dit comme un module fermé.
    <SectionBoundary fallback={(error, retry) => (engineErrorCode(error) === "notFound" ? <ClosedModule /> : <SectionFailure error={error} retry={retry} />)}>
      <MetricsDashboard />
      <MetricsNotes />
    </SectionBoundary>
  )
}

/** Le module « Mesure » est fermé : une explication neutre et le chemin pour l'ouvrir, jamais un chiffre. */
function ClosedModule() {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Card className="flex min-w-0 flex-col items-start gap-3 p-5">
      <div className="flex min-w-0 gap-3">
        <LockIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-semibold">{t("metrics.closed.title")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("metrics.closed.body")}</p>
        </div>
      </div>
      <Button asChild variant="primary">
        <NextLink href={routes.modules()}>
          <BlocksIcon aria-hidden="true" />
          {t("metrics.closed.link")}
        </NextLink>
      </Button>
    </Card>
  )
}

function MetricsDashboard() {
  const admin = useNetworkAdmin()
  const [country, setCountry] = useState<CountryCode | null>(null)
  const [days, setDays] = useState<PilotWindowDays>(PILOT_DEFAULT_WINDOW_DAYS)
  const dto = useQuery(api.modules.diaspora.pilotMetrics.pilotMetrics, { networkId: admin.networkId, country, days })
  const view = useMemo(() => (dto === undefined ? undefined : toPilotMetricsView(dto)), [dto])
  return (
    <>
      <MetricsFilters country={country} days={days} onCountryChange={setCountry} onDaysChange={setDays} />
      <section aria-busy={view === undefined} className="flex min-w-0 flex-col gap-4">
        {view === undefined ? <MetricsSkeleton /> : <MetricsResults view={view} />}
      </section>
    </>
  )
}

function MetricsFilters(props: {
  readonly country: CountryCode | null
  readonly days: PilotWindowDays
  readonly onCountryChange: (country: CountryCode | null) => void
  readonly onDaysChange: (days: PilotWindowDays) => void
}) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const id = useId()
  const hubs = useQuery(api.modules.diaspora.hubs.listOpenCountries, { networkId: admin.networkId })
  const open = (hubs ?? []).flatMap((hub) => {
    const scope = parsePilotScope(hub.country)
    return scope.ok && scope.value !== null ? [scope.value] : []
  })
  // Le pays choisi reste proposé, même si la liste des pays ouverts change entre-temps.
  const choices = props.country !== null && !open.includes(props.country) ? [props.country, ...open] : open
  const chooseCountry = (value: string) => {
    const scope = parsePilotScope(value === "" ? null : value)
    props.onCountryChange(scope.ok ? scope.value : null)
  }
  const chooseDays = (value: string) => {
    const chosen = PILOT_WINDOW_DAYS.find((candidate) => String(candidate) === value)
    if (chosen !== undefined) props.onDaysChange(chosen)
  }
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <h2 className="text-base font-semibold">{t("metrics.filters.title")}</h2>
      <div className="grid min-w-0 gap-4 min-[640px]:grid-cols-2">
        <Field id={`${id}-pays`} label={t("metrics.filters.country")} hint={t("metrics.filters.countryHint")}>
          {(field) => (
            <select id={field.id} aria-describedby={field.describedBy} className={SELECT_CLASS} value={props.country ?? ""} onChange={(event) => chooseCountry(event.target.value)}>
              <option value="">{t("metrics.scope.network")}</option>
              {choices.map((code) => (
                <option key={code} value={code}>
                  {countryName(code, locale)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p id={`${id}-periode`} className="text-sm font-medium">
            {t("metrics.filters.period")}
          </p>
          <RadioGroup aria-labelledby={`${id}-periode`} value={String(props.days)} onValueChange={chooseDays} className="grid grid-cols-3 gap-2">
            {PILOT_WINDOW_DAYS.map((option) => (
              <RadioCard key={option} value={String(option)}>
                {t("metrics.filters.days", { count: option })}
              </RadioCard>
            ))}
          </RadioGroup>
        </div>
      </div>
    </Card>
  )
}

function MetricsResults(props: { readonly view: PilotMetricsView }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { view } = props
  if (!view.measured) return <EmptyState icon={<ClockIcon />} title={t("metrics.notMeasuredTitle")} description={t("metrics.notMeasuredBody")} />
  return (
    <>
      <MetricsSummary view={view} />
      {PILOT_METRIC_GROUPS.map((group) => (
        <GroupTable key={group} group={group} indicators={view.indicators.filter((indicator) => indicator.group === group)} />
      ))}
    </>
  )
}

function MetricsSummary(props: { readonly view: MeasuredView }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const { view } = props
  const scope = view.country === null ? t("metrics.scope.network") : countryName(view.country, locale)
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-4 text-sm">
      <p className="font-semibold">{t("metrics.summary.scope", { scope })}</p>
      <p>{t("metrics.summary.window", { start: formatDate(view.windowStartAt, locale, UTC_DAY), end: formatDate(view.windowEndAt - DAY_MS, locale, UTC_DAY) })}</p>
      <p className="text-muted-foreground">{t("metrics.summary.computedAt", { date: formatDate(view.computedAt, locale, PASS_TIME) })}</p>
      {view.daysMeasured < view.days ? <p className="font-medium">{t("metrics.summary.partial", { count: view.daysMeasured, days: view.days })}</p> : null}
    </Card>
  )
}

function GroupTable(props: { readonly group: PilotMetricGroup; readonly indicators: readonly PilotIndicator[] }) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Card className="min-w-0 overflow-hidden">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="px-4 pt-4 pb-2 text-left text-base font-semibold">{t(`metrics.group.${props.group}`)}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="px-4 pb-2 font-medium">
              {t("metrics.table.indicator")}
            </th>
            <th scope="col" className="w-28 px-4 pb-2 text-right font-medium">
              {t("metrics.table.value")}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.indicators.map((indicator) => (
            <IndicatorRows key={indicator.id} indicator={indicator} />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/**
 * Les textes de chaque délai, cités en toutes lettres (le cliquet des clés les lit) : la première
 * réponse à une demande de service, et (ET-10) à une question d'entraide.
 */
const DURATION_TEXTS = {
  first_response_hours: {
    median: "metrics.duration.median",
    p75: "metrics.duration.p75",
    hint: "metrics.duration.hint",
    sample: "metrics.duration.sample",
    sampleBelow: "metrics.duration.sampleBelow",
  },
  aid_first_answer_hours: {
    median: "metrics.durationAid.median",
    p75: "metrics.durationAid.p75",
    hint: "metrics.durationAid.hint",
    sample: "metrics.durationAid.sample",
    sampleBelow: "metrics.durationAid.sampleBelow",
  },
} as const

function durationTexts(id: PilotMetricId) {
  return id === "aid_first_answer_hours" ? DURATION_TEXTS.aid_first_answer_hours : DURATION_TEXTS.first_response_hours
}

function IndicatorRows(props: { readonly indicator: PilotIndicator }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const { indicator } = props
  if (indicator.kind === "duration") {
    const texts = durationTexts(indicator.id)
    const sample = indicator.sample.kind === "value" ? t(texts.sample, { value: formatNumber(indicator.sample.value, locale) }) : t(texts.sampleBelow, { threshold: indicator.sample.threshold })
    return (
      <>
        <IndicatorRow label={t(texts.median)} hint={t(texts.hint)} detail={sample} value={hoursText(t, indicator.median)} />
        <IndicatorRow label={t(texts.p75)} hint={sample} detail={null} value={hoursText(t, indicator.p75)} />
      </>
    )
  }
  const label = t(`metrics.indicator.${indicator.id}.label`)
  const hint = t(`metrics.indicator.${indicator.id}.hint`)
  if (indicator.kind === "ratio") {
    const base =
      indicator.denominator.kind === "value"
        ? t(`metrics.base.${indicator.denominatorId}`, { value: formatNumber(indicator.denominator.value, locale) })
        : t(`metrics.baseBelow.${indicator.denominatorId}`, { threshold: indicator.denominator.threshold })
    return <IndicatorRow label={label} hint={hint} detail={t("metrics.ratioDetail", { base, rate: rateText(t, locale, indicator) })} value={partText(t, locale, indicator.value)} />
  }
  return <IndicatorRow label={label} hint={hint} detail={null} value={countText(t, locale, indicator.value)} />
}

function IndicatorRow(props: { readonly label: string; readonly hint: string; readonly detail: string | null; readonly value: string }) {
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="px-4 py-3 text-left font-normal">
        <span className="block break-words text-[15px] font-medium">{props.label}</span>
        <span className="mt-0.5 block break-words text-sm text-muted-foreground">{props.hint}</span>
        {props.detail === null ? null : <span className="mt-0.5 block break-words text-sm text-muted-foreground">{props.detail}</span>}
      </th>
      <td className="px-4 py-3 text-right align-top text-[15px] font-semibold tabular-nums break-words">{props.value}</td>
    </tr>
  )
}

function countText(t: Translate, locale: string, count: PilotCount): string {
  return count.kind === "value" ? formatNumber(count.value, locale) : t("metrics.value.belowThreshold", { threshold: count.threshold })
}

function partText(t: Translate, locale: string, part: PilotPart): string {
  return part.kind === "complement_below_threshold" ? t("metrics.value.masked") : countText(t, locale, part)
}

function rateText(t: Translate, locale: string, indicator: RatioIndicator): string {
  if (indicator.rate.kind === "value") return t("metrics.rate.value", { rate: formatNumber(indicator.rate.percent, locale) })
  return indicator.value.kind === "complement_below_threshold" ? t("metrics.rate.complement") : t("metrics.rate.withheld")
}

function hoursText(t: Translate, hours: PilotHours): string {
  switch (hours.kind) {
    case "at_most":
      return t("metrics.hours.atMost", { hours: hours.hours })
    case "above":
      return t("metrics.hours.above", { hours: hours.hours })
    case "withheld":
      return t("metrics.hours.withheld")
  }
}

function MetricsSkeleton() {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <div role="status" className="flex min-w-0 flex-col gap-4">
      <span className="sr-only">{t("metrics.loading")}</span>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

function MetricsNotes() {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4 text-sm">
      <h2 className="text-base font-semibold">{t("metrics.notes.title")}</h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
        <li>{t("metrics.notes.noContent")}</li>
        <li>{t("metrics.notes.noPeople")}</li>
        <li>{t("metrics.notes.threshold", { threshold: PILOT_DISPLAY_THRESHOLD })}</li>
        <li>{t("metrics.notes.cohorts")}</li>
        <li>{t("metrics.notes.notMeasured")}</li>
      </ul>
    </Card>
  )
}
