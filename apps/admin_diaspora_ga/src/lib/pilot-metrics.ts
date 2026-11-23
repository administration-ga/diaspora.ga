/**
 * La mesure du pilote telle que la section « Mesure » la lit (DG-027 · G11 ; fiche CH-815 § 4.2
 * et lot A6) — module PUR, déménagé de diaspora.ga (port `pilot-metrics-port.ts` et adaptateur
 * `engine-pilot-metrics.ts`), qui ne la sert plus. Le moteur la sert sous `networkAdminQuery`,
 * gardée par la clé `pilotMetrics` (`modules/diaspora/pilotMetrics`) ; la réponse est recopiée
 * champ par champ dans les formes fermées du domaine : un compte sous le seuil reste « moins
 * de », un taux garde sa base, une part trop proche de sa base reste masquée. Rien n'est compté ici.
 */
import type { api } from "@convex/_generated/api"
import {
  isResidenceCountry,
  parsePilotWindowDays,
  PILOT_DEFAULT_WINDOW_DAYS,
  type CountryCode,
  type PilotCount,
  type PilotHours,
  type PilotIndicator,
  type PilotPart,
  type PilotWindowDays,
} from "@diaspora-ga/domain"
import type { FunctionReturnType } from "convex/server"

type PilotMetricsDto = FunctionReturnType<typeof api.modules.diaspora.pilotMetrics.pilotMetrics>
type IndicatorDto = Extract<PilotMetricsDto, { measured: true }>["indicators"][number]

type CountDto = { readonly kind: "value"; readonly value: number } | { readonly kind: "below_threshold"; readonly threshold: number }
type PartDto = CountDto | { readonly kind: "complement_below_threshold"; readonly threshold: number }
type HoursDto = { readonly kind: "at_most"; readonly hours: number } | { readonly kind: "above"; readonly hours: number } | { readonly kind: "withheld" }

interface PilotMetricsViewBase {
  readonly country: CountryCode | null
  readonly days: PilotWindowDays
  /** Le seuil de publication des comptes. */
  readonly threshold: number
}

/** La mesure d'une portée sur une période ; `measured: false` tant qu'aucun passage n'a écrit. */
export type PilotMetricsView =
  | (PilotMetricsViewBase & { readonly measured: false })
  | (PilotMetricsViewBase & {
      readonly measured: true
      /** Jours UTC de la période : début inclus, fin exclue. */
      readonly windowStartAt: number
      readonly windowEndAt: number
      /** Le plus ancien passage parmi les jours lus. */
      readonly computedAt: number
      /** Jours effectivement mesurés dans la période (moins que `days` : mesure partielle). */
      readonly daysMeasured: number
      /** Dans l'ordre fermé des indicateurs du domaine. */
      readonly indicators: readonly PilotIndicator[]
    })

function toCount(count: CountDto): PilotCount {
  return count.kind === "value" ? { kind: "value", value: count.value } : { kind: "below_threshold", threshold: count.threshold }
}

function toPart(part: PartDto): PilotPart {
  return part.kind === "complement_below_threshold" ? { kind: "complement_below_threshold", threshold: part.threshold } : toCount(part)
}

function toHours(hours: HoursDto): PilotHours {
  switch (hours.kind) {
    case "at_most":
      return { kind: "at_most", hours: hours.hours }
    case "above":
      return { kind: "above", hours: hours.hours }
    case "withheld":
      return { kind: "withheld" }
  }
}

/** Un indicateur du moteur, recopié dans la forme fermée du domaine. */
export function toPilotIndicator(row: IndicatorDto): PilotIndicator {
  switch (row.kind) {
    case "snapshot":
      return { id: row.id, group: row.group, kind: "snapshot", value: toCount(row.value) }
    case "count":
      return { id: row.id, group: row.group, kind: "count", value: toCount(row.value) }
    case "ratio":
      return {
        id: row.id,
        group: row.group,
        kind: "ratio",
        value: toPart(row.value),
        denominatorId: row.denominatorId,
        denominator: toCount(row.denominator),
        rate: row.rate.kind === "value" ? { kind: "value", percent: row.rate.percent } : { kind: "withheld" },
      }
    case "duration":
      return { id: row.id, group: row.group, kind: "duration", sample: toCount(row.sample), median: toHours(row.median), p75: toHours(row.p75) }
  }
}

/** La mesure du moteur, recopiée champ par champ. */
export function toPilotMetricsView(dto: PilotMetricsDto): PilotMetricsView {
  const country = dto.country !== null && isResidenceCountry(dto.country) ? dto.country : null
  const parsed = parsePilotWindowDays(dto.days)
  const days = parsed.ok ? parsed.value : PILOT_DEFAULT_WINDOW_DAYS
  if (!dto.measured) return { measured: false, country, days, threshold: dto.threshold }
  return {
    measured: true,
    country,
    days,
    threshold: dto.threshold,
    windowStartAt: dto.windowStartAt,
    windowEndAt: dto.windowEndAt,
    computedAt: dto.computedAt,
    daysMeasured: dto.daysMeasured,
    indicators: dto.indicators.map(toPilotIndicator),
  }
}
