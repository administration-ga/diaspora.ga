"use client"

/**
 * Section « Équipe et responsables » (groupe Confiance, fiche CH-815 § 4.2 et lot A6) — déménagée
 * de l'onglet « Équipe » du bureau de diaspora.ga (`moderation-desk-team.tsx`), qui ne décide plus
 * (D5) : le modérateur y garde sa file et voit ses équipes dans sa carte de capacité.
 *
 *  · les responsables du réseau (`responsibles-panel.tsx`) ;
 *  · les équipes vivantes du réseau (`diaspora/moderationDesk.myDesk().teams` : l'administration
 *    les lit toutes), leur nature de contenu et leur pays (lot A7, suite d'A3 au moteur) : le pays
 *    se choisit à la création ou se règle ensuite (`setTeamCountry`, motivé) ; il ouvre la porte de
 *    son pays (section « Pays ouverts »), sans délimiter encore la file, routée par nature ;
 *  · la composition d'une équipe (`teamRoster`), par le profil PUBLIÉ de chacun ; l'ajout par
 *    identifiant public (`teamCandidate`) ; le retrait motivé et confirmé ; la création motivée.
 *    Chaque geste passe par `moderation/networkAdmin` (`createTeam`, `setTeamMember`,
 *    `setTeamCountry`), qui le journalise à titre de `network_admin`.
 */
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { isResidenceCountry } from "@diaspora-ga/domain"
import { Avatar, Button, Card, CountryTag, Field, HANDLE_MAX_LENGTH, Input, residenceCountryOptions, Sheet, SheetContent, Skeleton } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "convex/react"
import { GlobeIcon, UserMinusIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText, invalidFieldOf } from "@/lib/engine-errors"
import { SURFACES, TEAM_NAME_BOUNDS, type CandidateRow, type RosterMemberRow, type TeamRow } from "@/lib/moderation-rules"

import { handleLookupSchema, ReasonField, ReasonForm, reasonSchema, RefusalLine, SELECT_CLASS, useDecisionLabels, useMounted, type HandleLookupValues } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { CandidateCard, ResponsiblesPanel, useCandidateLookup } from "./responsibles-panel"
import { SectionBoundary } from "./section-boundary"

const createSchema = z.object({
  name: z.string().trim().min(TEAM_NAME_BOUNDS.min, "team.nameLength").max(TEAM_NAME_BOUNDS.max, "team.nameLength"),
  scope: z.string(),
  country: z.string(),
  reason: reasonSchema,
})
type CreateValues = z.infer<typeof createSchema>

/** Les bornes que citent les phrases du nom d'une équipe. */
const NAME_VALUES = { nameMin: TEAM_NAME_BOUNDS.min, nameMax: TEAM_NAME_BOUNDS.max } as const

type Translate = ReturnType<typeof useTranslation>["t"]

/** Un refus d'un geste sur une équipe : le nom hors bornes se dit par sa phrase, le reste par la traduction partagée. */
function teamRefusal(error: unknown, t: Translate): string {
  if (invalidFieldOf(error) === "name") return t("team.nameLength", NAME_VALUES)
  return engineErrorText(error, t, "team.failed")
}

export function TeamSection() {
  const { t } = useTranslation(APP_NAMESPACE)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id={titleId} className="font-display text-3xl font-bold">
          {t("team.title")}
        </h1>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">{t("team.lead")}</p>
      </header>
      <ResponsiblesPanel />
      <SectionBoundary>
        <Teams />
      </SectionBoundary>
    </section>
  )
}

function Teams() {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const id = useId()
  const desk = useQuery(api.modules.diaspora.moderationDesk.myDesk, { networkId: admin.networkId, expectedPersonId: admin.personId })
  const [selected, setSelected] = useState<string | null>(null)
  if (desk === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }
  const teams = desk?.teams ?? []
  const managed = teams.find((team) => team.teamId === selected) ?? teams[0] ?? null
  return (
    <>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <section aria-labelledby={`${id}-equipes`} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-equipes`} className="flex items-center gap-2 font-display text-xl font-bold">
              <UsersIcon aria-hidden="true" className="size-5" />
              {t("team.teamsTitle")}
            </h2>
            <p className="text-[13px] leading-snug text-muted-foreground">{t("team.countryNote")}</p>
          </div>
          {managed === null ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("team.noneYet")}</p>
          ) : (
            <>
              <ul className="grid min-w-0 gap-2 min-[640px]:grid-cols-2">
                {teams.map((team) => (
                  <TeamLine key={team.teamId} team={team} />
                ))}
              </ul>
              <div className="flex min-w-0 flex-col gap-1.5 border-t border-border pt-4">
                <label htmlFor={`${id}-equipe`} className="text-sm font-medium">
                  {t("team.picker")}
                </label>
                <select id={`${id}-equipe`} className={SELECT_CLASS} value={managed.teamId} onChange={(event) => setSelected(event.target.value)}>
                  {teams.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <TeamCountryLine key={`pays-${managed.teamId}`} team={managed} />
              <SectionBoundary key={managed.teamId}>
                <TeamRoster team={managed} />
              </SectionBoundary>
              <AddMember key={`ajout-${managed.teamId}`} team={managed} />
            </>
          )}
        </section>
      </Card>
      <CreateTeam onCreated={setSelected} />
    </>
  )
}

function TeamLine(props: { readonly team: TeamRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const labels = useDecisionLabels()
  const { team } = props
  return (
    <li className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-medium">{team.name}</p>
        <TeamCountry country={team.country} />
      </div>
      <p className="break-words text-[13px] text-muted-foreground">{team.scope === null ? t("team.scopeAll") : t("team.scopeOne", { surface: labels.surface(team.scope) })}</p>
    </li>
  )
}

/** Le pays d'une équipe, ou « sans pays ». */
function TeamCountry(props: { readonly country: string | null }) {
  const { t } = useTranslation(APP_NAMESPACE)
  if (props.country !== null && isResidenceCountry(props.country)) return <CountryTag country={props.country} />
  return <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t("team.noCountry")}</span>
}

const countrySchema = z.object({ country: z.string(), reason: reasonSchema })
type CountryValues = z.infer<typeof countrySchema>

/**
 * Le pays de l'équipe composée, et le geste qui le pose, le change ou le retire, motif à l'appui,
 * dans une feuille (`moderation/networkAdmin.setTeamCountry`).
 */
function TeamCountryLine(props: { readonly team: TeamRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const [editing, setEditing] = useState(false)
  const busy = useRef(false)
  const { team } = props
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border pt-4">
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <GlobeIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="font-medium">{t("team.country")}</span>
        <TeamCountry country={team.country} />
      </p>
      <Button variant="outline" size="sm" aria-haspopup="dialog" aria-label={t("team.countryChangeFor", { name: team.name })} onClick={() => setEditing(true)}>
        {t("team.countryChange")}
      </Button>
      <Sheet
        open={editing}
        onOpenChange={(open) => {
          if (!open && !busy.current) setEditing(false)
        }}
      >
        {editing ? (
          <SheetContent title={t("team.countryTitle", { name: team.name })} description={t("team.countryBody")} closeLabel={t("decision.close")}>
            <TeamCountryForm
              team={team}
              onBusyChange={(value) => {
                busy.current = value
              }}
              onDone={() => setEditing(false)}
            />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  )
}

function TeamCountryForm(props: { readonly team: TeamRow; readonly onBusyChange: (busy: boolean) => void; readonly onDone: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { locale } = useDiasporaGaT()
  const admin = useNetworkAdmin()
  const setTeamCountry = useMutation(api.modules.moderation.networkAdmin.setTeamCountry)
  const id = useId()
  const mounted = useMounted()
  const [refusal, setRefusal] = useState<string | null>(null)
  const current = props.team.country ?? ""
  const form = useForm<CountryValues>({ resolver: zodResolver(countrySchema), defaultValues: { country: current, reason: "" } })
  const busy = form.formState.isSubmitting
  const countries = residenceCountryOptions(locale)

  const submit = async (values: CountryValues) => {
    setRefusal(null)
    if (values.country === current) {
      setRefusal(t("team.countryUnchanged"))
      return
    }
    const chosen = countries.find((option) => option.code === values.country) ?? null
    props.onBusyChange(true)
    try {
      await setTeamCountry({ networkId: admin.networkId, teamId: props.team.teamId, country: chosen?.code ?? null, reason: values.reason.trim() })
      toast.success(chosen === null ? t("team.countryRemoved", { name: props.team.name }) : t("team.countrySet", { name: props.team.name, country: chosen.name }))
      props.onBusyChange(false)
      props.onDone()
    } catch (error) {
      props.onBusyChange(false)
      if (mounted.current) setRefusal(teamRefusal(error, t))
    }
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${id}-pays`} className="text-sm font-medium">
          {t("team.country")}
        </label>
        <select id={`${id}-pays`} className={SELECT_CLASS} disabled={busy} {...form.register("country")}>
          <option value="">{t("team.countryNone")}</option>
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <ReasonField id={`${id}-motif`} error={form.formState.errors.reason?.message} disabled={busy} registration={form.register("reason")} />
      <RefusalLine text={refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("decision.pending") : t("team.countrySave")}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={props.onDone}>
          {t("decision.cancel")}
        </Button>
      </div>
    </form>
  )
}

function TeamRoster(props: { readonly team: TeamRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const roster = useQuery(api.modules.diaspora.moderationDesk.teamRoster, { networkId: admin.networkId, expectedPersonId: admin.personId, teamId: props.team.teamId })
  const [removing, setRemoving] = useState<RosterMemberRow | null>(null)
  if (roster === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="font-semibold">{t("team.roster", { name: props.team.name })}</h3>
      {roster.members.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("team.rosterEmpty")}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {roster.members.map((member) => (
            <MemberLine key={member.personId} member={member} onRemove={() => setRemoving(member)} />
          ))}
        </ul>
      )}
      {roster.more ? <p className="text-[13px] text-muted-foreground">{t("team.rosterMore")}</p> : null}
      <RemoveMemberSheet team={props.team} member={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

function MemberLine(props: { readonly member: RosterMemberRow; readonly onRemove: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const nameId = useId()
  const { member } = props
  const name = member.displayName ?? t("team.neutralName")
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3">
      <Avatar id={member.personId} name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p id={nameId} className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
          <span className="min-w-0 break-words">{name}</span>
          {member.isMe ? <span className="text-[13px] font-normal text-muted-foreground">{t("team.me")}</span> : null}
        </p>
        {member.handle ? <p className="break-words text-sm text-muted-foreground">{`@${member.handle}`}</p> : null}
        {!member.inNetwork ? <p className="text-[13px] text-destructive">{t("team.outsideNetwork")}</p> : null}
      </div>
      <Button variant="outline" size="sm" aria-describedby={nameId} aria-haspopup="dialog" onClick={props.onRemove}>
        <UserMinusIcon aria-hidden="true" />
        {t("team.remove")}
      </Button>
    </li>
  )
}

function RemoveMemberSheet(props: { readonly team: TeamRow; readonly member: RosterMemberRow | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setTeamMember = useMutation(api.modules.moderation.networkAdmin.setTeamMember)
  const busy = useRef(false)
  const { member } = props
  const name = member ? (member.displayName ?? t("team.neutralName")) : ""
  return (
    <Sheet
      open={member !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) props.onClose()
      }}
    >
      {member ? (
        <SheetContent title={t("team.removeTitle", { name })} description={t("team.removeBody", { team: props.team.name })} closeLabel={t("decision.close")}>
          <ReasonForm
            key={member.personId}
            submitLabel={t("team.removeConfirm")}
            destructive
            onBusyChange={(value) => {
              busy.current = value
            }}
            onSubmit={async (reason) => {
              try {
                await setTeamMember({ networkId: admin.networkId, teamId: props.team.teamId, personId: member.personId, active: false, reason })
                toast.success(t("team.removed", { name }))
                busy.current = false
                props.onClose()
                return null
              } catch (error) {
                return teamRefusal(error, t)
              }
            }}
            onCancel={props.onClose}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

function AddMember(props: { readonly team: TeamRow }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setTeamMember = useMutation(api.modules.moderation.networkAdmin.setTeamMember)
  const lookupCandidate = useCandidateLookup()
  const id = useId()
  const mounted = useMounted()
  const [candidate, setCandidate] = useState<CandidateRow | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<HandleLookupValues>({ resolver: zodResolver(handleLookupSchema), defaultValues: { handle: "" } })
  const busy = form.formState.isSubmitting
  const invalid = form.formState.errors.handle?.message

  const lookup = async (values: HandleLookupValues) => {
    setRefusal(null)
    try {
      const found = await lookupCandidate(values.handle)
      if (!mounted.current) return
      if (found === null) setRefusal(t("lookup.unknown"))
      else setCandidate(found)
    } catch (error) {
      if (mounted.current) setRefusal(engineErrorText(error, t, "lookup.failed"))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <UserPlusIcon aria-hidden="true" className="size-4" />
        {t("team.addTitle", { name: props.team.name })}
      </h3>
      {candidate === null ? (
        <form noValidate onSubmit={(event) => void form.handleSubmit(lookup)(event)} className="flex min-w-0 flex-col gap-3">
          <Field id={`${id}-identifiant`} label={t("team.handle")} hint={t("lookup.hint")} error={invalid ? t(invalid) : undefined}>
            {(field) => (
              <Input
                id={field.id}
                aria-describedby={field.describedBy}
                aria-invalid={field.invalid || undefined}
                autoComplete="off"
                maxLength={HANDLE_MAX_LENGTH + 1}
                disabled={busy}
                {...form.register("handle")}
              />
            )}
          </Field>
          <RefusalLine text={refusal} />
          <Button type="submit" variant="outline" className="self-start" disabled={busy}>
            {busy ? t("decision.pending") : t("lookup.search")}
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <CandidateCard candidate={candidate} />
          <ReasonForm
            key={candidate.personId}
            submitLabel={t("team.addConfirm")}
            onSubmit={async (reason) => {
              try {
                await setTeamMember({ networkId: admin.networkId, teamId: props.team.teamId, personId: candidate.personId, active: true, reason })
              } catch (error) {
                return teamRefusal(error, t)
              }
              toast.success(t("team.added", { name: candidate.displayName }))
              if (mounted.current) {
                setCandidate(null)
                form.reset()
              }
              return null
            }}
            onCancel={() => setCandidate(null)}
          />
        </div>
      )}
    </div>
  )
}

function CreateTeam(props: { readonly onCreated: (teamId: Id<"moderationTeams">) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const createTeam = useMutation(api.modules.moderation.networkAdmin.createTeam)
  const labels = useDecisionLabels()
  const id = useId()
  const mounted = useMounted()
  const [refusal, setRefusal] = useState<string | null>(null)
  const { locale } = useDiasporaGaT()
  const countries = residenceCountryOptions(locale)
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { name: "", scope: "", country: "", reason: "" } })
  const busy = form.formState.isSubmitting
  const errors = form.formState.errors

  const create = async (values: CreateValues) => {
    setRefusal(null)
    const scope = SURFACES.find((surface) => surface === values.scope)
    const country = countries.find((option) => option.code === values.country)?.code
    const name = values.name.trim()
    try {
      const created = await createTeam({ networkId: admin.networkId, name, ...(scope ? { scope } : {}), ...(country ? { country } : {}), reason: values.reason.trim() })
      toast.success(t("team.created", { name }))
      if (!mounted.current) return
      form.reset()
      props.onCreated(created.teamId)
    } catch (error) {
      if (mounted.current) setRefusal(teamRefusal(error, t))
    }
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <UsersIcon aria-hidden="true" className="size-5" />
        {t("team.createTitle")}
      </h2>
      <p className="text-[13px] leading-snug text-muted-foreground">{t("team.createLead")}</p>
      <form noValidate onSubmit={(event) => void form.handleSubmit(create)(event)} className="flex min-w-0 flex-col gap-3">
        <Field id={`${id}-nom`} label={t("team.name")} hint={t("team.nameHint", NAME_VALUES)} error={errors.name?.message ? t(errors.name.message, NAME_VALUES) : undefined}>
          {(field) => (
            <Input id={field.id} aria-describedby={field.describedBy} aria-invalid={field.invalid || undefined} maxLength={TEAM_NAME_BOUNDS.max} disabled={busy} {...form.register("name")} />
          )}
        </Field>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-nature`} className="text-sm font-medium">
            {t("team.scope")}
          </label>
          <select id={`${id}-nature`} className={SELECT_CLASS} disabled={busy} {...form.register("scope")}>
            <option value="">{t("team.scopeAll")}</option>
            {SURFACES.map((surface) => (
              <option key={surface} value={surface}>
                {labels.surface(surface)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-pays`} className="text-sm font-medium">
            {t("team.country")}
          </label>
          <select id={`${id}-pays`} className={SELECT_CLASS} disabled={busy} {...form.register("country")}>
            <option value="">{t("team.countryNone")}</option>
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
          {busy ? t("decision.pending") : t("team.create")}
        </Button>
      </form>
    </Card>
  )
}
