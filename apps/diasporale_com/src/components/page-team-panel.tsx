"use client"

/**
 * L'équipe d'une page (DG-008, AS-10) : ses membres, invitations comprises.
 * PROPRIÉTAIRE : chantier « gestion des pages ».
 *
 *  · trois rôles : l'administrateur publie et gère ; l'éditeur (`signatory`)
 *    publie ; le modérateur retire les commentaires sous les publications de la
 *    page, sans publier ni parler en son nom ;
 *  · une habilitation est une INVITATION : elle ne vaut qu'acceptée ; le rôle d'un
 *    membre qui a déjà accepté change AUSSITÔT, sans invitation — l'écran le dit ;
 *  · un administrateur invite, change un rôle, retire ; chacun se retire, quel
 *    que soit son rôle ;
 *  · « Transmettre la page » : nommer un administrateur (aussitôt s'il est déjà
 *    membre accepté, par invitation sinon), puis se retirer dès qu'un second
 *    administrateur a accepté ;
 *  · la page garde toujours au moins un administrateur vivant — l'écran le dit
 *    et le serveur le refuse (`page_last_admin`) ;
 *  · la liste est une lecture RÉACTIVE : un rôle retiré ferme l'accès aussitôt.
 */
import { Avatar, Button, Card, Field, Input, Skeleton, formatDate, handleRefusal, normalizeHandle } from "@diasporale/features"
import {
  myTeamRoleOf,
  PAGE_TEAM_ROLES,
  type ActionErrorCode,
  type ManagedPageDetailView,
  type PageManagement,
  type PageSignatoryView,
  type PageTeamRole,
} from "@diasporale/features/data"
import { useDiasporaleT } from "@diasporale/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { CrownIcon, LogOutIcon, UserMinusIcon, UserPlusIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ConfirmSheet, ErrorNotice, RoleChip, usePersonLabel } from "./page-admin-parts"

/** Le code fermé d'un identifiant saisi refusé, ou `null` (mêmes règles que l'inscription). */
function handleInputRefusal(raw: string): string | null {
  const handle = normalizeHandle(raw)
  return handle.length === 0 ? "page_member_handle_required" : handleRefusal(handle)
}

const inviteSchema = z.object({
  handle: z.string().superRefine((raw, context) => {
    const refusal = handleInputRefusal(raw)
    if (refusal) context.addIssue({ code: z.ZodIssueCode.custom, message: refusal })
  }),
  // Les rôles du moteur, une seule source (`PAGE_TEAM_ROLES`).
  role: z.enum(PAGE_TEAM_ROLES),
})

type InviteValues = z.infer<typeof inviteSchema>

/** « Transmettre la page » : un membre accepté de l'équipe, ou une autre personne par son identifiant. */
const transferSchema = z
  .object({ mode: z.enum(["member", "person"]), personId: z.string(), handle: z.string() })
  .superRefine((values, context) => {
    if (values.mode === "member") {
      if (values.personId.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["personId"], message: "page_team_member_required" })
      return
    }
    const refusal = handleInputRefusal(values.handle)
    if (refusal) context.addIssue({ code: z.ZodIssueCode.custom, path: ["handle"], message: refusal })
  })

type TransferValues = z.infer<typeof transferSchema>

const selectClass = "h-11 w-full rounded-md border border-input bg-card px-3 text-[15px] focus-visible:shadow-focus"

export function PageTeamPanel(props: { readonly management: PageManagement; readonly page: ManagedPageDetailView }) {
  const { t } = useDiasporaleT()
  const team = props.management.useSignatories(props.page.id)
  // AS-10 : le rôle d'ÉQUIPE (modérateur compris) ; seul l'administrateur gère.
  const isAdmin = myTeamRoleOf(props.page) === "admin"
  if (team.status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{t("common.pleaseWait")}</span>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    )
  }
  if (team.status === "error") return <ErrorNotice code={team.code} />
  const acceptedAdmins = team.data.filter((row) => row.role === "admin" && row.accepted).length
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-bold">{t("pageAdmin.team.title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("pageAdmin.team.lead")}</p>
      </div>
      <RoleGuide />
      {team.data.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("pageAdmin.team.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {team.data.map((row) => (
            <SignatoryRow
              key={row.personId}
              management={props.management}
              pageId={props.page.id}
              row={row}
              canManage={isAdmin}
              lastAdmin={row.role === "admin" && row.accepted && acceptedAdmins <= 1}
            />
          ))}
        </ul>
      )}
      {isAdmin ? (
        <>
          <InviteForm management={props.management} pageId={props.page.id} />
          <TransferPanel management={props.management} pageId={props.page.id} team={team.data} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("pageAdmin.team.readOnly")}</p>
      )}
    </div>
  )
}

/** Les trois rôles, chacun dit en une phrase (ce qu'il fait, ce qu'il ne fait pas). */
function RoleGuide() {
  const { t } = useDiasporaleT()
  const id = useId()
  return (
    <section aria-labelledby={`${id}-roles`} className="rounded-xl bg-muted p-4">
      <h3 id={`${id}-roles`} className="text-sm font-semibold">{t("pageAdmin.team.rolesTitle")}</h3>
      <dl className="mt-2 flex flex-col gap-2 text-sm">
        {PAGE_TEAM_ROLES.map((role) => (
          <div key={role} className="flex min-w-0 flex-col gap-0.5">
            <dt className="font-medium">{t(`pageAdmin.role.${role}`)}</dt>
            <dd className="break-words text-muted-foreground">{t(`pageAdmin.roleHint.${role}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function SignatoryRow(props: {
  readonly management: PageManagement
  readonly pageId: string
  readonly row: PageSignatoryView
  readonly canManage: boolean
  readonly lastAdmin: boolean
}) {
  const { t, locale } = useDiasporaleT()
  const label = usePersonLabel()
  const { row } = props
  const name = label(row)
  const id = useId()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const running = useRef(false)

  const changeRole = async (role: PageTeamRole) => {
    if (running.current || role === row.role || row.handle === null) return
    running.current = true
    setBusy(true)
    setRefusal(null)
    try {
      const result = await props.management.grantRole(props.pageId, row.handle, role)
      if (result.ok) toast.success(t("pageAdmin.team.roleChanged"))
      else setRefusal(result.code)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const revoke = async () => {
    setRefusal(null)
    const result = await props.management.revokeRole(props.pageId, row.personId)
    if (!result.ok) {
      setRefusal(result.code)
      return true
    }
    if (result.value.revoked) toast.success(t(row.isMe ? "pageAdmin.team.left" : "pageAdmin.team.removed"))
    return true
  }

  return (
    <li>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar id={row.personId} name={name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="min-w-0 break-words">{name}</span>
              {row.isMe ? <span className="text-[13px] font-normal text-muted-foreground">{t("pageAdmin.team.me")}</span> : null}
            </p>
            {row.handle ? <p className="break-words text-sm text-muted-foreground">{`@${row.handle}`}</p> : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <RoleChip role={row.role} />
              <span>{row.accepted ? t("pageAdmin.team.since", { date: formatDate(row.since, locale) }) : t("pageAdmin.team.invited", { date: formatDate(row.since, locale) })}</span>
            </div>
          </div>
        </div>
        {props.canManage && !row.isMe ? (
          <div className="flex flex-wrap items-end gap-2">
            {row.handle !== null ? (
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
                <label htmlFor={`${id}-role`} className="text-sm font-medium">
                  {t("pageAdmin.team.changeRole", { name })}
                </label>
                <select
                  id={`${id}-role`}
                  className={selectClass}
                  value={row.role}
                  disabled={busy}
                  aria-describedby={row.accepted ? `${id}-aussitot` : undefined}
                  onChange={(event) => {
                    // Seule une valeur de la liste fermée part au serveur ; rien n'est transtypé.
                    const role = PAGE_TEAM_ROLES.find((candidate) => candidate === event.target.value)
                    if (role) void changeRole(role)
                  }}
                >
                  {PAGE_TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`pageAdmin.role.${role}`)}
                    </option>
                  ))}
                </select>
                {/* Un membre accepté change de rôle sans invitation : l'écran le dit avant le geste. */}
                {row.accepted ? <p id={`${id}-aussitot`} className="text-[13px] text-muted-foreground">{t("pageAdmin.team.roleImmediate")}</p> : null}
              </div>
            ) : null}
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(true)} aria-label={t("pageAdmin.team.removeLabel", { name })}>
              <UserMinusIcon aria-hidden />
              {t("pageAdmin.team.remove")}
            </Button>
          </div>
        ) : null}
        {row.isMe ? (
          <div className="flex flex-col items-start gap-2">
            <Button variant="outline" disabled={busy || props.lastAdmin} onClick={() => setConfirming(true)} aria-describedby={props.lastAdmin ? `${id}-dernier` : undefined}>
              <LogOutIcon aria-hidden />
              {t("pageAdmin.team.leave")}
            </Button>
            {props.lastAdmin ? <p id={`${id}-dernier`} className="text-[13px] text-muted-foreground">{t("pageAdmin.team.lastAdmin")}</p> : null}
          </div>
        ) : null}
        {refusal ? <ErrorNotice code={refusal} /> : null}
      </Card>
      <ConfirmSheet
        open={confirming}
        onOpenChange={setConfirming}
        title={row.isMe ? t("pageAdmin.team.leaveConfirmTitle") : t("pageAdmin.team.removeConfirmTitle", { name })}
        body={row.isMe ? t("pageAdmin.team.leaveConfirmBody") : t("pageAdmin.team.removeConfirmBody")}
        confirm={row.isMe ? t("pageAdmin.team.leave") : t("pageAdmin.team.remove")}
        onConfirm={revoke}
      />
    </li>
  )
}

function InviteForm(props: { readonly management: PageManagement; readonly pageId: string }) {
  const { t } = useDiasporaleT()
  const id = useId()
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const running = useRef(false)
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { handle: "", role: "signatory" } })
  const errors = form.formState.errors
  const busy = form.formState.isSubmitting

  // La soumission se valide au geste, jamais pendant le rendu.
  const onValid = async (values: InviteValues) => {
    if (running.current) return
    running.current = true
    setRefusal(null)
    try {
      const result = await props.management.grantRole(props.pageId, normalizeHandle(values.handle), values.role)
      if (!result.ok) {
        setRefusal(result.code)
        return
      }
      toast.success(t(result.value.invited ? "pageAdmin.team.invitedToast" : "pageAdmin.team.roleChanged"))
      form.reset({ handle: "", role: values.role })
    } catch {
      setRefusal("unknown")
    } finally {
      running.current = false
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-lg font-bold">{t("pageAdmin.team.inviteTitle")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("pageAdmin.team.inviteLead")}</p>
      <form noValidate onSubmit={(event) => void form.handleSubmit(onValid)(event)} className="mt-4 flex flex-col gap-4" aria-busy={busy}>
        <Field id={`${id}-identifiant`} label={t("pageAdmin.team.handle")} hint={t("pageAdmin.team.handleHint")} error={errors.handle?.message ? t(`errors.${errors.handle.message}`) : undefined}>
          {(control) => (
            <Input
              id={control.id}
              aria-describedby={control.describedBy}
              aria-invalid={control.invalid || undefined}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              {...form.register("handle")}
            />
          )}
        </Field>
        <Field id={`${id}-role`} label={t("pageAdmin.team.role")}>
          {(control) => (
            <select id={control.id} aria-describedby={control.describedBy} className={selectClass} disabled={busy} {...form.register("role")}>
              {PAGE_TEAM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`pageAdmin.role.${role}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {refusal ? <ErrorNotice code={refusal} /> : null}
        <Button type="submit" className="h-auto min-h-11 max-w-full self-start whitespace-normal py-2 text-left" disabled={busy}>
          <UserPlusIcon aria-hidden />
          <span className="min-w-0 break-words">{busy ? t("common.pleaseWait") : t("pageAdmin.team.invite")}</span>
        </Button>
      </form>
    </Card>
  )
}

/**
 * « Transmettre la page » (AS-10), un parcours sur les gestes existants : nommer un
 * administrateur — un membre ACCEPTÉ est promu aussitôt, une autre personne est
 * invitée —, puis « Se retirer », ouvert seulement quand un second administrateur
 * a accepté. Accepté n'est pas actif : l'écran ne sait pas si cet administrateur est
 * encore membre actif (suspendu, parti de DIASPORALE), il le dit et laisse le
 * moteur trancher ; son refus (`page_last_admin`) s'affiche tel quel.
 */
function TransferPanel(props: { readonly management: PageManagement; readonly pageId: string; readonly team: readonly PageSignatoryView[] }) {
  const { t } = useDiasporaleT()
  const label = usePersonLabel()
  const id = useId()
  const me = props.team.find((row) => row.isMe)
  // Promouvables : membres acceptés, au profil publié (l'habilitation passe par l'identifiant), pas encore administrateurs.
  const candidates = props.team.filter((row) => row.accepted && !row.isMe && row.role !== "admin" && row.handle !== null)
  const otherAdmins = props.team.filter((row) => row.accepted && !row.isMe && row.role === "admin").length
  const canLeave = me !== undefined && me.accepted && otherAdmins > 0
  const [refusal, setRefusal] = useState<ActionErrorCode | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveRefusal, setLeaveRefusal] = useState<ActionErrorCode | null>(null)
  const running = useRef(false)
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { mode: candidates.length > 0 ? "member" : "person", personId: "", handle: "" },
  })
  const mode = useWatch({ control: form.control, name: "mode" })
  const errors = form.formState.errors
  const busy = form.formState.isSubmitting

  const onValid = async (values: TransferValues) => {
    if (running.current) return
    const chosen = values.mode === "member" ? candidates.find((row) => row.personId === values.personId) : undefined
    const handle = chosen?.handle ?? normalizeHandle(values.handle)
    if (values.mode === "member" && chosen === undefined) {
      form.setError("personId", { message: "page_team_member_required" })
      return
    }
    running.current = true
    setRefusal(null)
    try {
      const result = await props.management.grantRole(props.pageId, handle, "admin")
      if (!result.ok) {
        setRefusal(result.code)
        return
      }
      // Promu sans invitation (membre déjà accepté) : c'est immédiat, et le message le dit.
      toast.success(result.value.invited ? t("pageAdmin.team.transfer.invited") : t("pageAdmin.team.transfer.promoted", { name: chosen ? label(chosen) : `@${handle}` }))
      form.reset({ mode: values.mode, personId: "", handle: "" })
    } catch {
      setRefusal("unknown")
    } finally {
      running.current = false
    }
  }

  const leave = async () => {
    if (!me) return true
    setLeaveRefusal(null)
    const result = await props.management.revokeRole(props.pageId, me.personId)
    if (!result.ok) {
      // Le refus du dernier administrateur se dit tel quel (`page_last_admin`).
      setLeaveRefusal(result.code)
      return true
    }
    if (result.value.revoked) toast.success(t("pageAdmin.team.left"))
    return true
  }

  return (
    <Card className="p-5">
      <section aria-labelledby={`${id}-titre`} className="flex flex-col gap-4">
        <div>
          <h3 id={`${id}-titre`} className="font-display text-lg font-bold">{t("pageAdmin.team.transfer.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageAdmin.team.transfer.lead")}</p>
        </div>
        <ol className="flex flex-col gap-5">
          <li className="flex min-w-0 flex-col gap-3">
            <h4 className="font-semibold">{t("pageAdmin.team.transfer.stepName")}</h4>
            <form noValidate onSubmit={(event) => void form.handleSubmit(onValid)(event)} className="flex flex-col gap-4" aria-busy={busy}>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{t("pageAdmin.team.transfer.who")}</legend>
                {(["member", "person"] as const).map((choice) => (
                  <label key={choice} className="flex min-h-11 items-start gap-3 text-sm">
                    <input type="radio" value={choice} className="mt-0.5 size-5 shrink-0 accent-primary" disabled={busy} {...form.register("mode")} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{t(choice === "member" ? "pageAdmin.team.transfer.member" : "pageAdmin.team.transfer.newPerson")}</span>
                      <span className="break-words text-[13px] text-muted-foreground">
                        {t(choice === "member" ? "pageAdmin.team.transfer.memberHint" : "pageAdmin.team.transfer.newPersonHint")}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {mode === "member" ? (
                candidates.length === 0 ? (
                  <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t("pageAdmin.team.transfer.noMember")}</p>
                ) : (
                  <Field
                    id={`${id}-membre`}
                    label={t("pageAdmin.team.transfer.memberSelect")}
                    error={errors.personId?.message ? t(`errors.${errors.personId.message}`) : undefined}
                  >
                    {(control) => (
                      <select id={control.id} aria-describedby={control.describedBy} aria-invalid={control.invalid || undefined} className={selectClass} disabled={busy} {...form.register("personId")}>
                        <option value="">{t("pageAdmin.team.transfer.memberPlaceholder")}</option>
                        {candidates.map((row) => (
                          <option key={row.personId} value={row.personId}>
                            {t("pageAdmin.team.transfer.memberOption", { name: label(row), role: t(`pageAdmin.role.${row.role}`) })}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )
              ) : (
                <Field
                  id={`${id}-personne`}
                  label={t("pageAdmin.team.transfer.personHandle")}
                  hint={t("pageAdmin.team.handleHint")}
                  error={errors.handle?.message ? t(`errors.${errors.handle.message}`) : undefined}
                >
                  {(control) => (
                    <Input
                      id={control.id}
                      aria-describedby={control.describedBy}
                      aria-invalid={control.invalid || undefined}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={busy}
                      {...form.register("handle")}
                    />
                  )}
                </Field>
              )}
              {refusal ? <ErrorNotice code={refusal} /> : null}
              {mode === "person" || candidates.length > 0 ? (
                <Button type="submit" className="h-auto min-h-11 max-w-full self-start whitespace-normal py-2 text-left" disabled={busy}>
                  <CrownIcon aria-hidden />
                  {/* À 375 px, le libellé long passe à la ligne au lieu de sortir de la carte. */}
                  <span className="min-w-0 break-words">{busy ? t("common.pleaseWait") : t(mode === "member" ? "pageAdmin.team.transfer.promote" : "pageAdmin.team.transfer.invite")}</span>
                </Button>
              ) : null}
            </form>
          </li>
          <li className="flex min-w-0 flex-col items-start gap-2">
            <h4 className="font-semibold">{t("pageAdmin.team.transfer.stepLeave")}</h4>
            <p id={`${id}-retrait`} className="text-sm text-muted-foreground">
              {t(canLeave ? "pageAdmin.team.transfer.leaveReady" : "pageAdmin.team.transfer.leaveBlocked")}
            </p>
            <Button variant="outline" disabled={!canLeave} aria-describedby={`${id}-retrait`} onClick={() => setLeaving(true)}>
              <LogOutIcon aria-hidden />
              {t("pageAdmin.team.transfer.leave")}
            </Button>
            {leaveRefusal ? <ErrorNotice code={leaveRefusal} /> : null}
          </li>
        </ol>
      </section>
      <ConfirmSheet
        open={leaving}
        onOpenChange={setLeaving}
        title={t("pageAdmin.team.transfer.leaveConfirmTitle")}
        body={t("pageAdmin.team.transfer.leaveConfirmBody")}
        confirm={t("pageAdmin.team.transfer.leave")}
        onConfirm={leave}
      />
    </Card>
  )
}
