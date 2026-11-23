"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  BellIcon,
  BellOffIcon,
  BookmarkCheckIcon,
  BookmarkIcon,
  EyeOffIcon,
  FlagIcon,
  GlobeLockIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  VolumeXIcon,
  type LucideIcon,
} from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { useId, useState, type ReactNode } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useActions, useOptionalDataSource } from "../data/context"
import type { DiasporaGaActions } from "../data/port"
import { REPORT_NOTE_MAX, REPORT_REASONS, type PostView } from "../data/types"
import { POST_BODY_MAX } from "./composer"
import { PostExplanationSheet } from "./post-explanation"
import { ReportEmergencyNotice, ReportRulesLink } from "./report-guidance"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { Button } from "../primitives/button"
import { Field, Textarea } from "../primitives/field"
import { RadioCard, RadioGroup } from "../primitives/radio-group"
import { Sheet, SheetContent } from "../primitives/sheet"

/**
 * Ce que l'auteur peut faire de SA publication en plus de la modifier ou de la retirer (FD-10),
 * et ce que le lecteur peut suivre de celle d'autrui. Chaque geste n'existe que si le fournisseur
 * le sert ; le moteur garde toutes ses règles, l'écran ne propose que ce qui a un sens :
 *  · épingler sur son mur : une publication personnelle, hors groupe, publiée ; « Retirer
 *    l'épingle » sur l'épinglée, que seule la lecture du mur connaît ;
 *  · retirer d'ANTSIA : une publication lue aussi dans ANTSIA ;
 *  · suivre les commentaires : la publication d'autrui, publiée (l'auteur est déjà avisé).
 */
export function postAuthorGestures(post: PostView, actions: DiasporaGaActions) {
  const own = post.isMine && post.author.kind === "person"
  return {
    pin: own && actions.pinOnMyWall !== undefined && post.audience !== "group" && post.moderation === "published" && post.pinned !== true,
    unpin: own && actions.unpinMyWall !== undefined && post.pinned === true,
    withdrawFromRoot: own && actions.withdrawFromRoot !== undefined && post.visibility === "root",
    notify: !post.isMine && actions.toggleCommentNotifications !== undefined && post.moderation === "published",
  }
}

/**
 * Le menu « … » d'une publication (EXF-DG-12) : l'enregistrer, la masquer pour
 * soi, mettre son auteur en sourdine, la signaler — ou retirer la sienne. Tout
 * est privé : l'auteur n'apprend ni le signet, ni le masquage, ni la sourdine,
 * ni qu'on suit ses commentaires. « Pourquoi cette publication ? » dit, pour
 * celle d'autrui, pourquoi elle est là (DG-019). L'auteur l'épingle sur son mur
 * ou la retire d'ANTSIA (FD-10).
 */
export function PostMenu(props: { post: PostView }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const [explaining, setExplaining] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const { post } = props
  const person = post.author.kind === "person" && !post.isMine ? post.author : null
  const gestures = postAuthorGestures(post, actions)

  const bookmark = async () => {
    const result = await actions.toggleBookmark(post.id)
    if (!result.ok) toast.error(t(`errors.${result.code}`))
    else toast.success(result.value.bookmarked ? t("postMenu.bookmarked") : t("postMenu.unbookmarked"))
  }
  const pin = async () => {
    if (!actions.pinOnMyWall) return
    const result = await actions.pinOnMyWall(post.id)
    if (result.ok) toast.success(t("postMenu.pinned"))
    else toast.error(t(`errors.${result.code}`))
  }
  const unpin = async () => {
    if (!actions.unpinMyWall) return
    const result = await actions.unpinMyWall()
    if (result.ok) toast.success(t("postMenu.unpinned"))
    else toast.error(t(`errors.${result.code}`))
  }
  const notify = async () => {
    if (!actions.toggleCommentNotifications) return
    const result = await actions.toggleCommentNotifications(post.id)
    if (!result.ok) toast.error(t(`errors.${result.code}`))
    else toast.success(result.value.notifying ? t("postMenu.notifying") : t("postMenu.notNotifying"))
  }
  const hide = async () => {
    const result = await actions.hidePost(post.id)
    if (result.ok) toast.success(t("postMenu.hidden"))
    else toast.error(t(`errors.${result.code}`))
  }
  const mute = async (personId: string, name: string) => {
    const result = await actions.muteAuthor(personId)
    if (result.ok) toast.success(t("postMenu.muted", { name }))
    else toast.error(t(`errors.${result.code}`))
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={t("postMenu.open")}
          className="-mr-1 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-focus"
        >
          <MoreHorizontalIcon className="size-5" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-60 min-w-60 rounded-xl bg-popover p-1.5 text-popover-foreground shadow-float">
            <MenuItem icon={post.bookmarked ? BookmarkCheckIcon : BookmarkIcon} onSelect={bookmark}>
              {post.bookmarked ? t("postMenu.unbookmark") : t("postMenu.bookmark")}
            </MenuItem>
            {post.isMine ? (
              <>
                <MenuItem icon={PencilIcon} onSelect={() => setEditing(true)}>
                  {t("postMenu.edit")}
                </MenuItem>
                {gestures.pin ? (
                  <MenuItem icon={PinIcon} onSelect={pin}>
                    {t("postMenu.pin")}
                  </MenuItem>
                ) : null}
                {gestures.unpin ? (
                  <MenuItem icon={PinOffIcon} onSelect={unpin}>
                    {t("postMenu.unpin")}
                  </MenuItem>
                ) : null}
                {gestures.withdrawFromRoot ? (
                  <MenuItem icon={GlobeLockIcon} onSelect={() => setWithdrawing(true)}>
                    {t("postMenu.withdrawFromRoot")}
                  </MenuItem>
                ) : null}
                <MenuItem icon={Trash2Icon} tone="danger" onSelect={() => setRemoving(true)}>
                  {t("postMenu.remove")}
                </MenuItem>
              </>
            ) : (
              <>
                {gestures.notify ? (
                  <MenuItem icon={post.notifying ? BellOffIcon : BellIcon} onSelect={notify}>
                    {post.notifying ? t("postMenu.notifyOff") : t("postMenu.notifyOn")}
                  </MenuItem>
                ) : null}
                <MenuItem icon={InfoIcon} onSelect={() => setExplaining(true)}>
                  {t("postWhy.menu")}
                </MenuItem>
                <MenuItem icon={EyeOffIcon} onSelect={hide}>
                  {t("postMenu.hide")}
                </MenuItem>
                {person ? (
                  <MenuItem icon={VolumeXIcon} onSelect={() => mute(person.id, person.displayName)}>
                    {t("postMenu.mute", { name: person.displayName })}
                  </MenuItem>
                ) : null}
                <MenuItem icon={FlagIcon} tone="danger" onSelect={() => setReporting(true)}>
                  {t("postMenu.report")}
                </MenuItem>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {post.isMine ? (
        <>
          <EditPostSheet post={post} open={editing} onOpenChange={setEditing} />
          {gestures.withdrawFromRoot ? <WithdrawFromRootSheet postId={post.id} open={withdrawing} onOpenChange={setWithdrawing} /> : null}
          <RemovePostSheet postId={post.id} open={removing} onOpenChange={setRemoving} />
        </>
      ) : (
        <>
          <PostExplanationSheet post={post} open={explaining} onOpenChange={setExplaining} />
          <ReportPostSheet postId={post.id} open={reporting} onOpenChange={setReporting} />
        </>
      )}
    </>
  )
}

function MenuItem(props: { icon: LucideIcon; tone?: "danger"; onSelect: () => void; children: ReactNode }) {
  const Icon = props.icon
  return (
    <DropdownMenu.Item
      onSelect={props.onSelect}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none data-[highlighted]:bg-muted",
        props.tone === "danger" && "text-destructive",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {props.children}
    </DropdownMenu.Item>
  )
}

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { message: "report_reason_required" }),
  note: z.string().trim().max(REPORT_NOTE_MAX, "report_note_too_long"),
})
type ReportValues = z.infer<typeof reportSchema>

/**
 * Signaler : un motif parmi ceux du moteur, une précision facultative ; la publication se masque
 * aussitôt pour soi. Servi par le moteur, l'envoi vaut accusé de réception, puis décision (SU01d).
 */
function ReportPostSheet(props: { postId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const engine = useOptionalDataSource()?.kind === "engine"
  const ids = useId()
  const form = useForm<ReportValues>({ resolver: zodResolver(reportSchema), defaultValues: { note: "" } })
  const reasonError = form.formState.errors.reason?.message
  const noteError = form.formState.errors.note?.message

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await actions.reportPost({ postId: props.postId, reason: values.reason, ...(values.note ? { note: values.note } : {}) })
    if (!result.ok) {
      toast.error(t(`errors.${result.code}`))
      return
    }
    toast.success(t("report.sent"))
    form.reset({ note: "" })
    props.onOpenChange(false)
  })

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent title={t("report.title")} description={t("report.description")} closeLabel={t("report.close")}>
        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* MD-06 : un signalement n'alerte pas les secours ; la consigne d'urgence passe en tête. */}
          <ReportEmergencyNotice />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("report.reasonLegend")}</legend>
            <Controller
              control={form.control}
              name="reason"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  aria-label={t("report.reasonLegend")}
                  aria-invalid={reasonError ? true : undefined}
                  aria-describedby={reasonError ? `${ids}-motif` : undefined}
                >
                  {REPORT_REASONS.map((reason) => (
                    <RadioCard key={reason} value={reason}>
                      <span className="text-sm">{t(`report.reason.${reason}`)}</span>
                    </RadioCard>
                  ))}
                </RadioGroup>
              )}
            />
            {reasonError ? (
              <p id={`${ids}-motif`} role="alert" className="text-[13px] font-medium text-destructive">
                {t(`errors.${reasonError}`)}
              </p>
            ) : null}
          </fieldset>
          <Field id={`${ids}-note`} label={t("report.noteLabel")} hint={t("report.noteHint")} error={noteError ? t(`errors.${noteError}`) : undefined}>
            {(control) => (
              <Textarea
                id={control.id}
                rows={3}
                maxLength={REPORT_NOTE_MAX}
                aria-describedby={control.describedBy}
                aria-invalid={control.invalid || undefined}
                {...form.register("note")}
              />
            )}
          </Field>
          {engine ? <p className="text-[13px] text-muted-foreground">{t("report.followUp")}</p> : null}
          {/* MD-05 : chaque motif renvoie à une règle, que la page des règles détaille. */}
          <ReportRulesLink />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              {t("report.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              <FlagIcon aria-hidden />
              {t("report.send")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

const editSchema = z.object({
  body: z.string().trim().min(1, "post_empty").max(POST_BODY_MAX, "post_too_long"),
})
type EditValues = z.infer<typeof editSchema>

/** Modifier le texte de SA publication ; portée, audience et visibilité ne changent pas. */
function EditPostSheet(props: { post: PostView; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const ids = useId()
  const form = useForm<EditValues>({ resolver: zodResolver(editSchema), values: { body: props.post.body } })
  const error = form.formState.errors.body?.message

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await actions.editPost(props.post.id, values.body)
    if (!result.ok) {
      form.setError("body", { message: result.code })
      return
    }
    toast.success(t("editPost.saved"))
    props.onOpenChange(false)
  })

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent title={t("editPost.title")} description={t("editPost.description")} closeLabel={t("editPost.close")}>
        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field id={`${ids}-corps`} label={t("editPost.label")} error={error ? t(`errors.${error}`) : undefined}>
            {(control) => (
              <Textarea
                id={control.id}
                rows={6}
                maxLength={POST_BODY_MAX}
                aria-describedby={control.describedBy}
                aria-invalid={control.invalid || undefined}
                {...form.register("body")}
              />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
              {t("editPost.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <PencilIcon aria-hidden />
              {t("editPost.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Retirer SA publication d'ANTSIA (FD-10) : un second geste, explicite, parce qu'il ne se défait
 * pas. La publication reste lisible dans DIASPORA.GA, pour la même audience.
 */
function WithdrawFromRootSheet(props: { postId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!actions.withdrawFromRoot) return
    setBusy(true)
    const result = await actions.withdrawFromRoot(props.postId)
    setBusy(false)
    if (!result.ok) {
      toast.error(t(`errors.${result.code}`))
      return
    }
    toast.success(t("withdrawFromRoot.done"))
    props.onOpenChange(false)
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent title={t("withdrawFromRoot.title")} description={t("withdrawFromRoot.description")} closeLabel={t("withdrawFromRoot.close")}>
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("withdrawFromRoot.irreversible")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => props.onOpenChange(false)}>
              {t("withdrawFromRoot.cancel")}
            </Button>
            <Button disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
              <GlobeLockIcon aria-hidden />
              {t("withdrawFromRoot.confirm")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Retirer SA publication : un second geste, explicite. */
function RemovePostSheet(props: { postId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    const result = await actions.removePost(props.postId)
    setBusy(false)
    if (!result.ok) {
      toast.error(t(`errors.${result.code}`))
      return
    }
    toast.success(t("removePost.done"))
    props.onOpenChange(false)
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent title={t("removePost.title")} description={t("removePost.description")} closeLabel={t("removePost.close")}>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <Button variant="ghost" disabled={busy} onClick={() => props.onOpenChange(false)}>
            {t("removePost.cancel")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            <Trash2Icon aria-hidden />
            {t("removePost.confirm")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
