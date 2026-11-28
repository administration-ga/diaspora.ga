"use client"

import { api } from "@convex/_generated/api"
import { isResidenceCountry, type CountryCode } from "@diaspora-ga/domain"
import { Card, CountrySwitch, CountryTag, countryName, formatDate, formatNumber, Skeleton, StatCounter } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { useQuery } from "convex/react"
import { AlertTriangleIcon, LockIcon, LockOpenIcon } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import type { CountryRow } from "@/lib/countries"
import { useDecisionLabels } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

export function CountriesSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  return <section aria-labelledby={id} className="flex min-w-0 max-w-3xl flex-col gap-4">
    <h1 id={id} className="font-display text-3xl font-bold">{t("countries.title")}</h1>
    <p className="text-muted-foreground">{t("countries.lead")}</p>
    <SectionBoundary><CountryList /></SectionBoundary>
  </section>
}

function CountryList() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { networkId } = useNetworkAdmin()
  const rows = useQuery(api.modules.diaspora.networkSettings.countries, { networkId })
  const [country, setCountry] = useState<CountryCode | null>(null)
  const selected = rows?.find(row => row.country === country)
  return <>
    <CountrySwitch value={country} onChange={setCountry}
      title={t("countries.choose")} description={t("countries.routingNote")} />
    {rows === undefined ? <div role="status" aria-label={t("section.loading")}><Skeleton className="h-32" /></div> : null}
    {selected ? <ul><CountryCard row={selected} /></ul> : null}
  </>
}

/** Le nom d'un pays dans la langue de l'écran (un code inconnu reste son code). */
function useCountryName() {
  const { locale } = useDiasporaGaT()
  return (code: string) => (isResidenceCountry(code) ? countryName(code, locale) : code)
}

function CountryCard(props: { readonly row: CountryRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: members, locale } = useDiasporaGaT()
  const labels = useDecisionLabels()
  const nameOf = useCountryName()
  const { row } = props
  const name = nameOf(row.country)
  const measured = row.countersComputedAt !== null && !row.counters.dormant
  return (
    <li className="flex min-w-0">
      <Card className="flex w-full min-w-0 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold">
            {isResidenceCountry(row.country) ? <CountryTag country={row.country} /> : <span className="break-words">{name}</span>}
          </h2>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
            {row.open ? <LockOpenIcon aria-hidden="true" className="size-3.5" /> : <LockIcon aria-hidden="true" className="size-3.5" />}
            {t(row.open ? "countries.open" : "countries.closed")}
          </span>
        </div>
        {row.activeModerators === 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{t("countries.anomaly")}</span>
          </p>
        ) : null}
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("countries.teams")}</dt>
          <dd className="min-w-0 break-words">
            {row.teams.length === 0
              ? t("countries.noTeam")
              : row.teams.map((team) => (team.scope === null ? team.name : t("countries.teamWithScope", { name: team.name, surface: labels.surface(team.scope) }))).join(" · ")}
          </dd>
          <dt className="text-muted-foreground">{t("countries.moderators")}</dt>
          <dd className="min-w-0">{t("countries.moderatorsCount", { count: row.activeModerators, shown: formatNumber(row.activeModerators, locale) })}</dd>
        </dl>
        {measured ? (
          <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-3">
            <div className="grid grid-cols-3 gap-3">
              <StatCounter value={row.counters.members} label={members("hub.counters.members")} />
              <StatCounter value={row.counters.associations} label={members("hub.counters.associations")} />
              <StatCounter value={row.counters.companies} label={members("hub.counters.companies")} />
            </div>
            <p className="text-[12px] text-muted-foreground">{t("countries.countedOn", { date: formatDate(row.countersComputedAt ?? 0, locale, { dateStyle: "medium" }) })}</p>
          </div>
        ) : (
          <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">{t("countries.notCounted")}</p>
        )}
      </Card>
    </li>
  )
}
