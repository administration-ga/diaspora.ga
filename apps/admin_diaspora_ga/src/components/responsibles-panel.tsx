"use client"

/**
 * Le bloc « Responsables du réseau » de la section « Équipe et responsables » (fiche CH-815 § 4.2,
 * lot A6) — déménagé du bureau de diaspora.ga (`moderation-desk-responsibles.tsx`, MD-01 et LX-03).
 *
 *  · la liste : l'administration puis la modération du réseau, chacun par son profil PUBLIÉ, tel
 *    que le moteur le rend (`diaspora/moderationDesk.responsibles`), jamais par une coordonnée ni
 *    un nom civil ; un rôle qui ne s'exerce pas (adhésion en attente ou suspendue) est dit ;
 *  · nommer par identifiant public (`diaspora/moderationDesk.teamCandidate`), puis le rôle et le motif ;
 *  · changer le rôle ou le retirer : une feuille de confirmation, motif obligatoire ; son propre
 *    rôle est annoncé comme tel ;
 *  · chaque geste passe par `diaspora/membership.setResponsibleRole` (motif de dix caractères au
 *    moins, inscrit au journal) ; le refus du dernier administrateur (`NETWORK_LAST_ADMIN`) est dit
 *    par la traduction partagée des règles du moteur. Le rôle vaut au geste suivant de la personne.
 * Un seul bouton plein par zone.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import { Avatar, Button, Card, Field, Input, Sheet, SheetContent, Skeleton, HANDLE_MAX_LENGTH, normalizeHandle } from "@diaspora-ga/features"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvex, useMutation, useQuery } from "convex/react"
import { ShieldCheckIcon, UserCogIcon, UserMinusIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { APP_NAMESPACE } from "@/i18n/resources"
import { engineErrorText } from "@/lib/engine-errors"
import { otherResponsibleRole, RESPONSIBLE_ROLES, type CandidateRow, type ResponsibleRole, type ResponsibleRow, type RoleChoice } from "@/lib/moderation-rules"

import { handleLookupSchema, ReasonField, ReasonForm, reasonSchema, RefusalLine, SELECT_CLASS, useMounted, type HandleLookupValues } from "./decision-parts"
import { useNetworkAdmin } from "./network-admin-context"
import { SectionBoundary } from "./section-boundary"

/** Le libellé de chaque rôle de responsable (clés citées en toutes lettres). */
const ROLE_LABELS: Readonly<Record<ResponsibleRole, string>> = {
  network_admin: "responsibles.role.network_admin",
  network_moderator: "responsibles.role.network_moderator",
}

const appointSchema = z.object({ role: z.enum(RESPONSIBLE_ROLES), reason: reasonSchema })
type AppointValues = z.infer<typeof appointSchema>

/** Le geste demandé sur une ligne de la liste : changer de rôle, ou retirer le rôle. */
type Pending = { readonly kind: "change" | "remove"; readonly member: ResponsibleRow }

type Translate = ReturnType<typeof useTranslation>["t"]

/** Un refus d'un geste sur un rôle : le refus indistinct du moteur se dit sans en livrer la raison. */
export function responsibleRefusal(error: unknown, t: Translate): string {
  if (engineErrorCode(error) === "notFound") return t("responsibles.refused")
  return engineErrorText(error, t, "responsibles.failed")
}

function useNames() {
  const { t } = useTranslation(APP_NAMESPACE)
  return {
    role: (role: ResponsibleRole) => t(ROLE_LABELS[role]),
    person: (displayName: string | null) => displayName ?? t("team.neutralName"),
  }
}

/** Le message d'un geste abouti : rien n'a changé, le rôle est retiré, ou ce qu'il est devenu. */
function useSuccessMessage() {
  const { t } = useTranslation(APP_NAMESPACE)
  const names = useNames()
  return (name: string, result: { readonly role: RoleChoice; readonly changed: boolean }, kind: "appoint" | "change" | "remove"): string => {
    if (!result.changed) return t("responsibles.unchanged", { name })
    if (result.role === "member") return t("responsibles.removed", { name })
    const role = names.role(result.role)
    return kind === "appoint" ? t("responsibles.appointed", { name, role }) : t("responsibles.changed", { name, role })
  }
}

/** La personne trouvée par son identifiant public ; `null` : aucun membre actif ne le porte. */
export function useCandidateLookup() {
  const convex = useConvex()
  const admin = useNetworkAdmin()
  return async (handle: string): Promise<CandidateRow | null> =>
    await convex.query(api.modules.diaspora.moderationDesk.teamCandidate, { networkId: admin.networkId, expectedPersonId: admin.personId, handle: normalizeHandle(handle) })
}

export function ResponsiblesPanel() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const [pending, setPending] = useState<Pending | null>(null)
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <section aria-labelledby={`${id}-titre`} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-titre`} className="flex items-center gap-2 font-display text-xl font-bold">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
            {t("responsibles.title")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("responsibles.lead")}</p>
        </div>
        <SectionBoundary>
          <ResponsibleList onPending={setPending} />
        </SectionBoundary>
        <AppointResponsible />
      </section>
      <ResponsibleSheet pending={pending} onClose={() => setPending(null)} />
    </Card>
  )
}

function ResponsibleList(props: { readonly onPending: (pending: Pending) => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const list = useQuery(api.modules.diaspora.moderationDesk.responsibles, { networkId: admin.networkId, expectedPersonId: admin.personId })
  if (list === undefined) {
    return (
      <div role="status">
        <span className="sr-only">{t("section.loading")}</span>
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    )
  }
  return (
    <>
      <ul className="flex min-w-0 flex-col gap-2">
        {list.members.map((member) => (
          <ResponsibleLine
            key={member.personId}
            member={member}
            onChange={() => props.onPending({ kind: "change", member })}
            onRemove={() => props.onPending({ kind: "remove", member })}
          />
        ))}
      </ul>
      {list.more ? <p className="text-[13px] text-muted-foreground">{t("responsibles.more")}</p> : null}
    </>
  )
}

function ResponsibleLine(props: { readonly member: ResponsibleRow; readonly onChange: () => void; readonly onRemove: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const names = useNames()
  const nameId = useId()
  const { member } = props
  const name = names.person(member.displayName)
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3">
      <Avatar id={member.personId} name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p id={nameId} className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
          <span className="min-w-0 break-words">{name}</span>
          {member.isMe ? <span className="text-[13px] font-normal text-muted-foreground">{t("team.me")}</span> : null}
        </p>
        {member.handle ? <p className="break-words text-sm text-muted-foreground">{`@${member.handle}`}</p> : null}
        <p className="text-[13px] text-muted-foreground">{names.role(member.role)}</p>
        {!member.active ? <p className="text-[13px] text-destructive">{t("responsibles.inactive")}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Un rôle en sommeil ne se change pas (le moteur refuse de nommer une adhésion qui ne l'exerce pas) ; il se retire toujours. */}
        {member.active ? (
          <Button variant="outline" size="sm" aria-describedby={nameId} aria-haspopup="dialog" onClick={props.onChange}>
            <UserCogIcon aria-hidden="true" />
            {t("responsibles.change")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" aria-describedby={nameId} aria-haspopup="dialog" onClick={props.onRemove}>
          <UserMinusIcon aria-hidden="true" />
          {t("responsibles.remove")}
        </Button>
      </div>
    </li>
  )
}

/** La confirmation d'un changement de rôle ou d'un retrait, motif obligatoire. */
function ResponsibleSheet(props: { readonly pending: Pending | null; readonly onClose: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setRole = useMutation(api.modules.diaspora.membership.setResponsibleRole)
  const names = useNames()
  const success = useSuccessMessage()
  const busy = useRef(false)
  const { pending } = props
  const member = pending?.member ?? null
  const name = member ? names.person(member.displayName) : ""
  const target: RoleChoice | null = pending === null ? null : pending.kind === "remove" ? "member" : otherResponsibleRole(pending.member.role)
  const removing = pending?.kind === "remove"
  return (
    <Sheet
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) props.onClose()
      }}
    >
      {member && target ? (
        <SheetContent
          title={t(removing ? "responsibles.removeTitle" : "responsibles.changeTitle", { name })}
          description={
            removing
              ? t("responsibles.removeBody", { name, role: names.role(member.role) })
              : t("responsibles.changeBody", { name, from: names.role(member.role), to: target === "member" ? "" : names.role(target) })
          }
          closeLabel={t("decision.close")}
        >
          <div className="flex min-w-0 flex-col gap-3">
            {member.isMe ? <p className="rounded-xl bg-muted p-3 text-sm">{t("responsibles.selfWarning")}</p> : null}
            <ReasonForm
              key={`${member.personId}-${target}`}
              submitLabel={t(removing ? "responsibles.removeConfirm" : "responsibles.changeConfirm")}
              destructive={removing}
              onBusyChange={(value) => {
                busy.current = value
              }}
              onSubmit={async (reason) => {
                try {
                  const result = await setRole({ networkId: admin.networkId, personId: member.personId, role: target, reason })
                  toast.success(success(name, result, removing ? "remove" : "change"))
                  busy.current = false
                  props.onClose()
                  return null
                } catch (error) {
                  return responsibleRefusal(error, t)
                }
              }}
              onCancel={props.onClose}
            />
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

/** Nommer : l'identifiant public d'un membre actif, puis le rôle et le motif. */
function AppointResponsible() {
  const { t } = useTranslation(APP_NAMESPACE)
  const id = useId()
  const mounted = useMounted()
  const lookupCandidate = useCandidateLookup()
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
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{t("responsibles.appointTitle")}</h3>
        <p className="text-[13px] leading-snug text-muted-foreground">{t("responsibles.appointLead")}</p>
      </div>
      {candidate === null ? (
        <form noValidate onSubmit={(event) => void form.handleSubmit(lookup)(event)} className="flex min-w-0 flex-col gap-3">
          <Field id={`${id}-identifiant`} label={t("responsibles.handle")} hint={t("lookup.hint")} error={invalid ? t(invalid) : undefined}>
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
        <AppointForm
          key={candidate.personId}
          candidate={candidate}
          onDone={() => {
            if (!mounted.current) return
            setCandidate(null)
            form.reset()
          }}
          onCancel={() => setCandidate(null)}
        />
      )}
    </div>
  )
}

/** La personne trouvée, telle que le moteur la rend (profil publié). */
export function CandidateCard(props: { readonly candidate: CandidateRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted p-3">
      <Avatar id={props.candidate.personId} name={props.candidate.displayName} size="md" />
      <div className="min-w-0">
        <p className="break-words font-medium">{props.candidate.displayName}</p>
        <p className="break-words text-sm text-muted-foreground">{`@${props.candidate.handle}`}</p>
      </div>
    </div>
  )
}

function AppointForm(props: { readonly candidate: CandidateRow; readonly onDone: () => void; readonly onCancel: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const admin = useNetworkAdmin()
  const setRole = useMutation(api.modules.diaspora.membership.setResponsibleRole)
  const names = useNames()
  const success = useSuccessMessage()
  const id = useId()
  const mounted = useMounted()
  const locked = useRef(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useForm<AppointValues>({ resolver: zodResolver(appointSchema), defaultValues: { role: "network_moderator", reason: "" } })
  const busy = form.formState.isSubmitting
  const { candidate } = props

  const appoint = async (values: AppointValues) => {
    if (locked.current) return
    locked.current = true
    setRefusal(null)
    try {
      const result = await setRole({ networkId: admin.networkId, personId: candidate.personId, role: values.role, reason: values.reason.trim() })
      toast.success(success(candidate.displayName, result, "appoint"))
      props.onDone()
    } catch (error) {
      if (mounted.current) setRefusal(responsibleRefusal(error, t))
    } finally {
      locked.current = false
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CandidateCard candidate={candidate} />
      <form noValidate onSubmit={(event) => void form.handleSubmit(appoint)(event)} className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className="text-sm font-medium">
            {t("responsibles.roleField")}
          </label>
          <select id={`${id}-role`} className={SELECT_CLASS} disabled={busy} {...form.register("role")}>
            {RESPONSIBLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {names.role(role)}
              </option>
            ))}
          </select>
        </div>
        <ReasonField id={`${id}-motif`} error={form.formState.errors.reason?.message} disabled={busy} registration={form.register("reason")} />
        <RefusalLine text={refusal} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("decision.pending") : t("responsibles.appointConfirm")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={props.onCancel}>
            {t("decision.cancel")}
          </Button>
        </div>
      </form>
    </div>
  )
}
