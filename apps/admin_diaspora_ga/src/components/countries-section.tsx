"use client"

/**
 * Section « Pays ouverts » (groupe Communauté, fiche CH-815 § 4.2 et lot A7) : les pays du réseau —
 * ouverts, portés par une équipe de modération, ou dotés d'un hub (`diaspora/networkSettings.countries`,
 * lot A3 du moteur, suite) —, leur ouverture, les équipes du pays et leurs modérateurs actifs, les
 * compteurs du hub tels que le moteur les PRÉSENTE (jamais un chiffre brut sous le seuil), et la
 * condition qu'il vérifie (`canOpen`).
 *  · Ouvrir un pays exige au moins un modérateur actif dans une équipe de ce pays (vérifié par le
 *    moteur, `moderator_missing`) et l'attestation, par l'administration, des associations relais
 *    du cahier, que rien ne modélise (case obligatoire, `relayAssociationsAttested`, inscrite au
 *    journal ; `relay_associations_missing`). Fermer est toujours permis. Chaque geste est motivé.
 *  · Un pays ouvert sans modérateur actif est signalé : rien n'empêche d'en retirer le dernier.
 * Le pays d'une équipe se pose dans « Équipe et responsables » ; il ne délimite encore aucune
 * compétence : les signalements restent routés par nature de contenu.
 */
import { api } from "@convex/_generated/api"
import { isResidenceCountry } from "@diaspora-ga/domain"
import { Button, Card, Checkbox, countryName, CountryTag, EmptyState, formatDate, formatNumber, Sheet, SheetContent, Skeleton, StatCounter } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon, GlobeIcon, LockIcon, LockOpenIcon, UsersIcon } from "lucide-react"
import NextLink from "next/link"
import { useId, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { countryRefusalOf, OPENING, openWithoutModerator, type CountryRow } from "@/lib/countries"
import { engineErrorText } from "@/lib/engine-errors"
import { routes } from "@/lib/routes"

import { ReasonField, ReasonForm, reasonSchema, RefusalLine, useDecisionLabels, useMounted } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

type Translate = ReturnType<typeof useTranslation>["t"]

/** Un refus d'une ouverture ou d'une fermeture : le refus du domaine, sinon la traduction partagée. */
export function countryRefusal(error: unknown, t: Translate): string {
  const refusal = countryRefusalOf(error)
  if (refusal !== null) return t(refusal.key, refusal.params)
  return engineErrorText(error, t, "countries.failed")
}

const openSchema = z.object({
  attested: z.boolean().refine((value) => value, "countries.attestationRequired"),
  reason: reasonSchema,
})
type OpenValues = z.infer<typeof openSchema>

export function CountriesSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("countries.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("countries.lead", { moderators: OPENING.activeModerators, relays: OPENING.relayAssociations })}</p>
        <p className="max-w-3xl text-[13px] leading-snug text-muted-foreground">{t("countries.routingNote")}</p>
      </header>
      <SectionBoundary>
        <CountryList />
      </SectionBoundary>
    </section>
  )
}

type Pending = { readonly kind: "open" | "close"; readonly row: CountryRow }

function CountryList() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const rows = useQuery(api.modules.diaspora.networkSettings.countries, { networkId: admin.networkId })
  const [pending, setPending] = useState<Pending | null>(null)
  if (rows === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<GlobeIcon />}
        title={t("countries.emptyTitle")}
        description={t("countries.emptyBody")}
        action={
          <Button asChild variant="secondary">
            <NextLink href={routes.team()}>{t("countries.teamLink")}</NextLink>
          </Button>
        }
      />
    )
  }
  return (
    <>
      <ul className="grid min-w-0 gap-4 min-[1024px]:grid-cols-2">
        {rows.map((row) => (
          <CountryCard key={row.country} row={row} onAction={(kind) => setPending({ kind, row })} />
        ))}
      </ul>
      <OpenSheet row={pending?.kind === "open" ? pending.row : null} onClose={() => setPending(null)} />
      <CloseSheet row={pending?.kind === "close" ? pending.row : null} onClose={() => setPending(null)} />
    </>
  )
}

/** Le nom d'un pays dans la langue de l'écran (un code inconnu reste son code). */
function useCountryName() {
  const { locale } = useDiasporaGaT()
  return (code: string) => (isResidenceCountry(code) ? countryName(code, locale) : code)
}

function CountryCard(props: { readonly row: CountryRow; readonly onAction: (kind: Pending["kind"]) => void }) {
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
        {openWithoutModerator(row) ? (
          <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-destructive">
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
        <div className="flex flex-wrap gap-2">
          {row.open ? (
            <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t("countries.closeFor", { country: name })} onClick={() => props.onAction("close")}>
              <LockIcon aria-hidden="true" />
              {t("countries.closeAction")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t("countries.openFor", { country: name })} onClick={() => props.onAction("open")}>
              <LockOpenIcon aria-hidden="true" />
              {t("countries.openAction")}
            </Button>
          )}
        </div>
      </Card>
    </li>
  )
}

function OpenSheet(props: { readonly row: CountryRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const nameOf = useCountryName()
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
        <SheetContent title={t("countries.openTitle", { country: nameOf(row.country) })} description={t("countries.openBody")} closeLabel={t("decision.close")}>
          <OpenForm
            key={row.country}
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

function OpenForm(props: { readonly row: CountryRow; readonly onBusyChange: (busy: boolean) => void; readonly onDone: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setOpenCountry = useMutation(api.modules.diaspora.networkSettings.setOpenCountry)
  const nameOf = useCountryName()
  const id = useId()
  const mounted = useMounted()
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<OpenValues>({ resolver: zodResolver(openSchema), defaultValues: { attested: false, reason: "" } })
  const busy = form.formState.isSubmitting
  const { row } = props
  const name = nameOf(row.country)

  const submit = async (values: OpenValues) => {
    setRefusal(null)
    props.onBusyChange(true)
    try {
      const result = await setOpenCountry({ networkId: admin.networkId, country: row.country, open: true, reason: values.reason.trim(), relayAssociationsAttested: true })
      toast.success(t(result.changed ? "countries.opened" : "countries.unchangedOpen", { country: name }))
      props.onBusyChange(false)
      props.onDone()
    } catch (error) {
      props.onBusyChange(false)
      if (mounted.current) setRefusal(countryRefusal(error, t))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ul className="flex min-w-0 flex-col gap-2 text-sm">
        <li className="flex items-start gap-2">
          {row.canOpen ? <CheckCircle2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /> : <CircleDashedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <span className="min-w-0">
            {t(row.canOpen ? "countries.moderatorOk" : "countries.moderatorMissing", { count: row.activeModerators, required: OPENING.activeModerators })}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <UsersIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">{t("countries.relaysToAttest", { relays: OPENING.relayAssociations })}</span>
        </li>
      </ul>
      {row.canOpen ? (
        <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-3">
          <Controller
            control={form.control}
            name="attested"
            render={({ field, fieldState }) => (
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    id={`${id}-attestation`}
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(value === true)}
                    disabled={busy}
                    aria-required
                    aria-invalid={fieldState.error ? true : undefined}
                    aria-describedby={fieldState.error ? `${id}-attestation-erreur` : undefined}
                  />
                  <label htmlFor={`${id}-attestation`} className="min-w-0 text-sm leading-snug">
                    {t("countries.attestation", { relays: OPENING.relayAssociations, country: name })}
                  </label>
                </div>
                {fieldState.error?.message ? (
                  <p id={`${id}-attestation-erreur`} role="alert" className="text-[13px] font-medium text-destructive">
                    {t(fieldState.error.message)}
                  </p>
                ) : null}
              </div>
            )}
          />
          <ReasonField id={`${id}-motif`} error={form.formState.errors.reason?.message} disabled={busy} registration={form.register("reason")} />
          <RefusalLine text={refusal} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t("decision.pending") : t("countries.openConfirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={props.onDone}>
              {t("decision.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p className="text-sm leading-relaxed">{t("countries.cannotOpen")}</p>
          <Button asChild variant="secondary">
            <NextLink href={routes.team()}>{t("countries.teamLink")}</NextLink>
          </Button>
        </div>
      )}
    </div>
  )
}

function CloseSheet(props: { readonly row: CountryRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setOpenCountry = useMutation(api.modules.diaspora.networkSettings.setOpenCountry)
  const nameOf = useCountryName()
  const busy = useRef(false)
  const { row } = props
  const name = row ? nameOf(row.country) : ""
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) props.onClose()
      }}
    >
      {row ? (
        <SheetContent title={t("countries.closeTitle", { country: name })} description={t("countries.closeBody")} closeLabel={t("decision.close")}>
          <ReasonForm
            key={row.country}
            submitLabel={t("countries.closeConfirm")}
            destructive
            onBusyChange={(value) => {
              busy.current = value
            }}
            onSubmit={async (reason) => {
              try {
                const result = await setOpenCountry({ networkId: admin.networkId, country: row.country, open: false, reason })
                toast.success(t(result.changed ? "countries.closedDone" : "countries.unchangedClosed", { country: name }))
                busy.current = false
                props.onClose()
                return null
              } catch (error) {
                return countryRefusal(error, t)
              }
            }}
            onCancel={props.onClose}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
