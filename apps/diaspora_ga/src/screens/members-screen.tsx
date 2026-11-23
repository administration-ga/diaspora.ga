"use client"

import { CITY_MAX_LENGTH, hasCapability, parseResidenceCountry, type CountryCode } from "@diaspora-ga/domain"
import { Avatar, Button, Card, CountryTag, EmptyState, Field, FilterBar, Input, Label, MemberSuggestions, Skeleton, Switch, TrustBadges, countryName } from "@diaspora-ga/features"
import {
  MEMBER_SEARCH_MIN_LENGTH,
  useMemberBrowse,
  useMemberSearch,
  useOpenCountries,
  type MemberBrowseCapability,
  type MemberHitView,
  type MembershipView,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { SearchIcon, UsersRoundIcon } from "lucide-react"
import NextLink from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useId, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { AppShell } from "@/components/app-shell"
import { Gate } from "@/components/gate"
import { useEngineNetwork } from "@/components/icom"
import { ServicePager } from "@/components/service-pager"
import { useUrlState } from "@/components/url-state"
import { MEMBERS_VERIFIED_PARAM, routes } from "@/lib/routes"

// ═══════════════════════════════════════════════════════════════
// Membres — l'annuaire opt-in (EXF-DG-19, EXF-DG-46) : le chercher par un nom,
// le parcourir par pays, ville et confiance (CH-816, lot P3)
// ═══════════════════════════════════════════════════════════════

/** Attente après la dernière frappe : une recherche par intention, pas par lettre. */
const SEARCH_DEBOUNCE_MS = 250

const SEARCH_REACHES = ["network", "country"] as const
type SearchReach = (typeof SEARCH_REACHES)[number]

const selectClass = "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-[15px] focus-visible:shadow-focus"

/**
 * `/membres` — les membres qui ont choisi d'être trouvés : on les parcourt par pays (et ville,
 * et confiance), ou l'on cherche un nom ; le contact passe par la messagerie. Les filtres du
 * parcours vivent dans l'adresse (`?pays=`, `?ville=`, `?verifies=1`).
 */
export function MembersScreen() {
  return (
    <Gate require="member">
      {(session) =>
        session.membership ? (
          <AppShell membership={session.membership}>
            <Members key={session.membership.personId} membership={session.membership} />
          </AppShell>
        ) : null
      }
    </Gate>
  )
}

function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/** Le parcours porté par l'adresse : un pays ouvert, une ville saisie (sans GPS), « vérifiés seulement ». */
export interface MemberBrowseView {
  readonly country: CountryCode
  readonly city: string
  readonly verifiedOnly: boolean
}

/**
 * Le parcours lu dans l'adresse. Le pays demandé s'il est ouvert ; sinon le mien s'il l'est ;
 * sinon le premier pays ouvert. Une ville trop longue est coupée, jamais devinée.
 */
export function memberBrowseFromParams(params: Pick<URLSearchParams, "get">, mine: CountryCode, open: readonly CountryCode[]): MemberBrowseView {
  const asked = parseResidenceCountry(params.get("pays"))
  const fallback = open.includes(mine) ? mine : (open[0] ?? mine)
  return {
    country: asked.ok && open.includes(asked.value) ? asked.value : fallback,
    city: (params.get("ville") ?? "").trim().replace(/\s+/g, " ").slice(0, CITY_MAX_LENGTH),
    verifiedOnly: params.get(MEMBERS_VERIFIED_PARAM) === "1",
  }
}

/** L'adresse d'un parcours (table des routes : aucune adresse écrite ici). */
export function membersHrefOf(view: MemberBrowseView): string {
  return routes.members({ country: view.country, ...(view.city ? { city: view.city } : {}), ...(view.verifiedOnly ? { verifiedOnly: true } : {}) })
}

function Members(props: { membership: MembershipView }) {
  const { t, locale } = useDiasporaGaT()
  const network = useEngineNetwork()
  const ids = useId()
  const browse = useMemberBrowse()
  const [query, setQuery] = useState("")
  const [reach, setReach] = useState<SearchReach>("network")
  const settled = useSettled(query.trim(), SEARCH_DEBOUNCE_MS)
  const country = props.membership.facet.countryOfResidence
  const results = useMemberSearch({ query: settled, ...(reach === "country" ? { country } : {}) })
  const searching = settled.length >= MEMBER_SEARCH_MIN_LENGTH
  const level = props.membership.directoryVisibility

  return (
    <>
      <div>
        <h1 className="font-display text-3xl font-bold">{t("members.title")}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("members.lead")}</p>
        {network ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline"><NextLink href={routes.relations()}>{t("nav.relations")}</NextLink></Button>
            <Button asChild variant="outline"><NextLink href={routes.relations("dismissed")}>{t("relations.dismissedTab")}</NextLink></Button>
          </div>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div role="search" className="relative">
          <label htmlFor={`${ids}-q`} className="sr-only">
            {t("members.searchLabel")}
          </label>
          <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${ids}-q`}
            type="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t("members.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        {/* Une recherche par nom porte sur tout le réseau ou sur mon pays ; le parcours a ses propres filtres. */}
        {searching ? (
          <FilterBar
            label={t("members.reachLabel")}
            options={SEARCH_REACHES.map((id) => ({ id, label: id === "network" ? t("members.reachNetwork") : countryName(country, locale) }))}
            selected={[reach]}
            onToggle={setReach}
          />
        ) : null}
      </Card>

      {searching ? (
        <section aria-labelledby={`${ids}-results`} aria-busy={results.status === "loading"}>
          <h2 id={`${ids}-results`} className="sr-only">
            {t("members.resultsLabel")}
          </h2>
          <Results results={results} query={settled} />
        </section>
      ) : (
        <>
          <MemberSuggestions headingId={`${ids}-suggestions`} />
          {browse ? (
            <MemberBrowse capability={browse} membership={props.membership} />
          ) : (
            <EmptyState icon={<UsersRoundIcon />} title={t("members.idleTitle")} description={t("members.idleBody")} />
          )}
        </>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-[14px]">
        <p>{t("members.mine", { level: t(`settings.directoryLevel.${level}`) })}</p>
        <NextLink href={`${routes.settings()}#annuaire`} className="font-semibold text-[var(--esp-accent-deep)] underline-offset-2 hover:underline focus-visible:shadow-focus">
          {t("members.mineAction")}
        </NextLink>
      </Card>
    </>
  )
}

/** Le parcours de l'annuaire : les filtres (dans l'adresse), puis les membres, vingt par fenêtre. */
function MemberBrowse(props: { capability: MemberBrowseCapability; membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const ids = useId()
  const openCountries = useOpenCountries()
  const params = useSearchParams()
  const mine = props.membership.facet.countryOfResidence
  const openKey = openCountries.status === "ready" ? openCountries.data.map((row) => row.country).join(",") : ""
  const open = useMemo(() => (openKey === "" ? [] : (openKey.split(",") as CountryCode[])), [openKey])
  const fromUrl = useMemo(() => memberBrowseFromParams(params, mine, open), [params, mine, open])
  const [view, setView] = useUrlState(fromUrl, membersHrefOf)

  let body
  if (!hasCapability(props.membership.status, "view_directory")) {
    // Un compte en attente lit le réseau ; il ne consulte pas l'annuaire (le refus de la recherche, dit sans reprise).
    body = <p role="status" className="rounded-xl bg-card p-4 text-[15px] shadow-card">{t("memberBrowse.notYet")}</p>
  } else if (openCountries.status === "loading") {
    body = <Skeleton className="h-40 w-full rounded-xl" />
  } else if (openCountries.status === "error") {
    body = <p role="alert" className="rounded-xl bg-card p-4 text-[15px] shadow-card">{t(`errors.${openCountries.code}`)}</p>
  } else if (open.length === 0) {
    body = <p role="status" className="rounded-xl bg-card p-4 text-[15px] shadow-card">{t("memberBrowse.noOpenCountry")}</p>
  } else {
    const href = membersHrefOf(view)
    body = (
      <>
        <BrowseFilters key={href} view={view} open={open} onChange={setView} />
        <BrowseResults key={`resultats:${href}`} capability={props.capability} view={view} />
      </>
    )
  }

  return (
    <section aria-labelledby={`${ids}-parcours`} className="flex min-w-0 flex-col gap-3">
      <h2 id={`${ids}-parcours`} className="font-display text-lg font-bold">{t("memberBrowse.filtersLabel")}</h2>
      {body}
    </section>
  )
}

const browseSchema = z.object({
  country: z.string().refine((value) => parseResidenceCountry(value).ok, { message: "country_unknown" }),
  city: z.string().trim().max(CITY_MAX_LENGTH, "city_too_long"),
  verifiedOnly: z.boolean(),
})

type BrowseValues = z.infer<typeof browseSchema>

/** Le pays et la confiance s'appliquent aussitôt ; la ville, à la validation (« Afficher » ou Entrée). */
function BrowseFilters(props: { view: MemberBrowseView; open: readonly CountryCode[]; onChange: (next: MemberBrowseView) => void }) {
  const { t, locale } = useDiasporaGaT()
  const id = useId()
  const { view, onChange } = props
  const form = useForm<BrowseValues>({
    resolver: zodResolver(browseSchema),
    defaultValues: { country: view.country, city: view.city, verifiedOnly: view.verifiedOnly },
  })
  const cityError = form.formState.errors.city?.message
  const submit = form.handleSubmit((values) => {
    const country = parseResidenceCountry(values.country)
    if (!country.ok) return form.setError("country", { message: "country_unknown" })
    onChange({ country: country.value, city: values.city.replace(/\s+/g, " "), verifiedOnly: values.verifiedOnly })
  })
  return (
    <Card className="p-4">
      <form noValidate aria-label={t("memberBrowse.filtersLabel")} className="flex min-w-0 flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field id={`${id}-pays`} label={t("memberBrowse.country")}>
            {(field) => (
              <select id={field.id} className={selectClass} {...form.register("country", { onChange: () => void submit() })}>
                {props.open.map((code) => (
                  <option key={code} value={code}>{countryName(code, locale)}</option>
                ))}
              </select>
            )}
          </Field>
          <Field id={`${id}-ville`} label={t("memberBrowse.city")} hint={t("memberBrowse.cityHint")} error={cityError ? t(`errors.${cityError}`) : undefined}>
            {(field) => (
              <Input
                id={field.id}
                autoComplete="address-level2"
                maxLength={CITY_MAX_LENGTH}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                {...form.register("city")}
              />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="verifiedOnly"
              render={({ field }) => (
                <Switch
                  id={`${id}-verifies`}
                  aria-describedby={`${id}-verifies-aide`}
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                    void submit()
                  }}
                />
              )}
            />
            <div>
              <Label htmlFor={`${id}-verifies`}>{t("memberBrowse.verifiedOnly")}</Label>
              <p id={`${id}-verifies-aide`} className="text-[13px] leading-snug text-muted-foreground">{t("memberBrowse.verifiedOnlyHint")}</p>
            </div>
          </div>
          <Button type="submit" variant="outline">{t("memberBrowse.apply")}</Button>
        </div>
      </form>
    </Card>
  )
}

/** La ville saisie, pour le titre : sa première lettre en capitale (« bordeaux » → « Bordeaux »), le reste tel quel. */
export function cityTitle(city: string): string {
  const trimmed = city.trim()
  return trimmed.charAt(0).toLocaleUpperCase("fr") + trimmed.slice(1)
}

function BrowseResults(props: { capability: MemberBrowseCapability; view: MemberBrowseView }) {
  const { t, locale } = useDiasporaGaT()
  const ids = useId()
  const { capability } = props
  const { country, city, verifiedOnly } = props.view
  const name = countryName(country, locale)
  const emptyTitle = verifiedOnly ? "memberBrowse.emptyVerifiedTitle" : city ? "memberBrowse.emptyCityTitle" : "memberBrowse.emptyTitle"
  return (
    <section aria-labelledby={`${ids}-membres`} className="flex min-w-0 flex-col gap-3">
      <h3 id={`${ids}-membres`} className="font-semibold">
        {city ? t("memberBrowse.resultsTitleCity", { city: cityTitle(city), country: name }) : t("memberBrowse.resultsTitle", { country: name })}
      </h3>
      <ServicePager
        read={(cursor) => capability.useBrowse({ country, cursor, ...(city ? { city } : {}), ...(verifiedOnly ? { verifiedOnly: true } : {}) })}
        keyOf={(hit) => hit.personId}
        loadMoreLabel={t("memberBrowse.loadMore")}
        empty={<EmptyState icon={<UsersRoundIcon />} title={t(emptyTitle)} description={t("memberBrowse.emptyBody")} />}
      >
        {(hits) => (
          <ul aria-label={t("memberBrowse.resultsLabel")} className="flex flex-col gap-2">
            {hits.map((hit) => (
              <MemberRow key={hit.personId} hit={hit} />
            ))}
          </ul>
        )}
      </ServicePager>
    </section>
  )
}

function Results(props: { results: ReturnType<typeof useMemberSearch>; query: string }) {
  const { t } = useDiasporaGaT()
  const { results } = props
  if (results.status === "loading") {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[72px] w-full rounded-xl" />
      </div>
    )
  }
  if (results.status === "error") {
    return (
      <p role="alert" className="rounded-xl bg-card p-4 text-[15px] shadow-card">
        {t(`errors.${results.code}`)}
      </p>
    )
  }
  const hits = results.data
  return (
    <>
      <p role="status" className="sr-only">
        {t("members.count", { count: hits.length })}
      </p>
      {hits.length === 0 ? (
        <EmptyState icon={<SearchIcon />} title={t("members.emptyTitle", { query: props.query })} description={t("members.emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {hits.map((hit) => (
            <MemberRow key={hit.personId} hit={hit} />
          ))}
        </ul>
      )}
    </>
  )
}

function MemberRow(props: { hit: MemberHitView }) {
  const { hit } = props
  return (
    <li>
      <NextLink
        href={routes.profile(hit.handle)}
        className="flex items-center gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-card transition-colors hover:bg-muted focus-visible:shadow-focus"
      >
        <Avatar id={hit.personId} name={hit.displayName} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{hit.displayName}</span>
            <TrustBadges badges={hit.badges} size="sm" />
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            @{hit.handle}
            {hit.headline ? ` · ${hit.headline}` : null}
          </span>
          {/* Au téléphone, le pays passe sous le nom ; au bureau, il se range à droite. */}
          {hit.facet.countryOfResidence ? (
            <CountryTag country={hit.facet.countryOfResidence} city={hit.facet.city} size="sm" className="mt-1.5 sm:hidden" />
          ) : null}
        </span>
        {hit.facet.countryOfResidence ? (
          <CountryTag country={hit.facet.countryOfResidence} city={hit.facet.city} size="sm" className="hidden sm:inline-flex" />
        ) : null}
      </NextLink>
    </li>
  )
}
