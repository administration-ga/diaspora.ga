"use client"

/**
 * DG-010 : entrée volontaire et mur privé du groupe thématique lié à l'association.
 * AS-02 : chaque publication d'autrui du mur se signale (nature « post ») et se masque
 * aussitôt pour qui l'a signalée ; dans le mur en texte, jamais la sienne, ni par qui
 * anime le groupe (il la retire lui-même). Dans le mur au format du fil (AS-08), le menu
 * de la carte propose « Signaler » à tout membre, animateur compris : signaler porte la
 * publication au guichet du réseau, retirer ne l'écarte que du groupe.
 * AS-03 : l'administrateur de la page rouvre le groupe qu'il a fermé.
 * AS-08 : quand le fournisseur sert le mur au format du fil, le groupe prend les cartes du
 * fil (réactions, commentaires, signalement, profil de l'auteur) et le composeur à médias ;
 * sinon le mur garde sa projection en texte.
 */
import { Button, Card, EmptyState, Field, PostComposerSheet, Skeleton, Textarea } from "@diaspora-ga/features"
import {
  useAssociationGroups,
  useSession,
  type ActionErrorCode,
  type AssociationGroupPostView,
  type AssociationGroupView,
  type AssociationGroupWallCapability,
  type AssociationGroupsCapability,
  type MembershipView,
  type PagePublicationsCapability,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { NewspaperIcon, PenSquareIcon } from "lucide-react"
import NextLink from "next/link"
import { useId, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { routes } from "@/lib/routes"

import { GroupPostPages } from "./feed-pages"
import { ReportContentAction, ReportedContent } from "./report-content-sheet"
import { ServicePager } from "./service-pager"
import { ConfirmSheet } from "./service-request-sheets"
import { useReviewTask as useActivityTask } from "./service-review-editor"

export function AssociationGroupEntry(props: { readonly pageId: string; readonly handle: string; readonly isAdmin: boolean; readonly canPublish: boolean }) {
  const capability = useAssociationGroups()
  const session = useSession()
  if (!capability || session.status !== "ready" || session.data.status !== "signed_in" || !session.data.membership) return null
  return <GroupEntry key={`${session.data.membership.personId}:${props.pageId}`} {...props} capability={capability} />
}

function GroupEntry(props: { readonly pageId: string; readonly handle: string; readonly isAdmin: boolean; readonly canPublish: boolean; readonly capability: AssociationGroupsCapability }) {
  const { t } = useDiasporaGaT()
  const query = props.capability.useGroup(props.pageId)
  const task = useActivityTask()
  const [key] = useState(() => crypto.randomUUID())
  if (query.status === "loading") return <Skeleton className="h-20 w-full rounded-xl" />
  if (query.status === "error") return <Card role="alert" className="p-4">{t(`errors.${query.code}`)}</Card>
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-display text-xl font-bold">{t("associationActivities.group.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("associationActivities.group.lead")}</p>
      {query.data ? <Button asChild className="self-start"><NextLink href={routes.associationGroup(props.handle)}>{t("associationActivities.group.open")}</NextLink></Button> : (
        <>
          <p className="text-sm text-muted-foreground">{t("associationActivities.group.notCreated")}</p>
          {props.isAdmin && props.canPublish ? <Button className="self-start" disabled={task.busy} aria-busy={task.busy} onClick={() => void task.run(() => props.capability.create({ pageId: props.pageId, idempotencyKey: key }), () => toast.success(t("associationActivities.group.created")))}>{t("associationActivities.group.create")}</Button> : null}
        </>
      )}
      {task.error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${task.error}`)}</p> : null}
    </Card>
  )
}

export function AssociationGroupContent(props: { readonly pageId: string }) {
  const capability = useAssociationGroups()
  const session = useSession()
  const { t } = useDiasporaGaT()
  if (!capability) return <Card className="p-4">{t("errors.feature_unavailable")}</Card>
  if (session.status !== "ready") return <Skeleton className="h-32 w-full rounded-xl" />
  if (session.data.status !== "signed_in" || !session.data.membership) return null
  return <GroupContent key={`${session.data.membership.personId}:${props.pageId}`} pageId={props.pageId} capability={capability} membership={session.data.membership} />
}

function GroupContent(props: { readonly pageId: string; readonly capability: AssociationGroupsCapability; readonly membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const query = props.capability.useGroup(props.pageId)
  const task = useActivityTask()
  const [confirmation, setConfirmation] = useState<"leave" | "close" | null>(null)
  if (query.status === "loading") return <Skeleton className="h-32 w-full rounded-xl" />
  if (query.status === "error") return <Card role="alert" className="p-4">{t(`errors.${query.code}`)}</Card>
  if (!query.data) return <Card className="p-4">{t("associationActivities.group.notCreated")}</Card>
  const group = query.data
  async function confirm(): Promise<ActionErrorCode | null> {
    const result = confirmation === "close" ? await props.capability.close(group.groupId) : await props.capability.leave(group.groupId)
    return result.ok ? null : result.code
  }
  return (
    <>
      <Card className="flex flex-col gap-3 p-4">
        <h1 className="font-display text-2xl font-bold">{group.name}</h1>
        <p className="text-sm text-muted-foreground">{t("associationActivities.group.lead")}</p>
        {group.state === "closed" ? <p role="status">{t("associationActivities.group.closed")}</p> : null}
        {group.state === "closed" && group.canReopen && group.closedAt !== null ? <p className="text-sm text-muted-foreground">{t("associationActivities.group.closedManage")}</p> : null}
        {!group.isMember && !group.canJoin && group.state === "active" ? <p>{t("associationActivities.group.eligibility")}</p> : null}
        <div className="flex flex-wrap gap-2">
          {group.canJoin ? <Button variant="social" disabled={task.busy} aria-busy={task.busy} onClick={() => void task.run(() => props.capability.join(group.groupId), () => toast.success(t("associationActivities.group.joined")))}>{t("associationActivities.group.join")}</Button> : null}
          {group.isMember ? <Button variant="outline" onClick={() => setConfirmation("leave")}>{t("associationActivities.group.leave")}</Button> : null}
          {group.canManage && group.state === "active" ? <Button variant="ghost" onClick={() => setConfirmation("close")}>{t("associationActivities.group.close")}</Button> : null}
          {group.state === "closed" && group.canReopen && group.closedAt !== null ? (
            <Button
              variant="outline"
              disabled={task.busy}
              aria-busy={task.busy}
              onClick={() => { const closedAt = group.closedAt; if (closedAt !== null) void task.run(() => props.capability.reopen({ groupId: group.groupId, expectedClosedAt: closedAt }), () => toast.success(t("associationActivities.group.reopened"))) }}
            >
              {t("associationActivities.group.reopen")}
            </Button>
          ) : null}
        </div>
        {task.error ? <p role="alert" className="text-destructive">{t(`errors.${task.error}`)}</p> : null}
      </Card>
      {group.isMember && group.state === "active" ? props.capability.wall
        ? <GroupFeedWall key={group.groupId} group={group} capability={props.capability} wall={props.capability.wall} membership={props.membership} />
        : <GroupWall key={group.groupId} group={group} capability={props.capability} /> : null}
      {confirmation ? <ConfirmSheet open onOpenChange={(open) => { if (!open) setConfirmation(null) }} title={t(confirmation === "close" ? "associationActivities.group.closeTitle" : "associationActivities.group.leaveTitle")} description={t(confirmation === "close" ? "associationActivities.group.closeDescription" : "associationActivities.group.leaveDescription")} confirmLabel={t(confirmation === "close" ? "associationActivities.group.close" : "associationActivities.group.leave")} destructive onConfirm={confirm} /> : null}
    </>
  )
}

/**
 * AS-08 : le mur au format du fil. Qui anime le groupe (responsable, animateur) épingle et
 * retire ; tout membre qui peut publier ouvre le composeur à médias, dans le groupe seulement.
 */
function GroupFeedWall(props: { readonly group: AssociationGroupView; readonly capability: AssociationGroupsCapability; readonly wall: AssociationGroupWallCapability; readonly membership: MembershipView }) {
  const { t } = useDiasporaGaT()
  const id = useId()
  const [compose, setCompose] = useState(false)
  const { group, capability } = props
  const moderator = group.role === "owner" || group.role === "moderator"
  const publish: PagePublicationsCapability["publish"] = (input) => capability.publish({
    groupId: group.groupId,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    ...(input.media && input.media.length > 0 ? { media: input.media } : {}),
  })
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="text-xl font-semibold">{t("associationActivities.group.wall")}</h2>
      {group.canPublish ? (
        <Button className="self-start" onClick={() => setCompose(true)}>
          <PenSquareIcon aria-hidden />
          {t("associationActivities.group.compose")}
        </Button>
      ) : null}
      <GroupPostPages
        groupId={group.groupId}
        capability={props.wall}
        moderator={moderator}
        remove={capability.removePost}
        membership={props.membership}
        now={Date.now()}
        emptyFallback={<EmptyState icon={<NewspaperIcon />} title={t("associationActivities.group.empty")} />}
      />
      {compose ? (
        <PostComposerSheet
          open
          onOpenChange={setCompose}
          memberCountry={props.membership.facet.countryOfResidence}
          openCountries={[]}
          draftKey={`diaspora-ga:brouillon:${props.membership.personId}:association-group:${group.groupId}`}
          page={{
            id: group.groupId,
            name: group.name,
            country: null,
            publish,
            fixedScope: {
              description: t("associationActivities.group.composeDescription"),
              audienceLabel: t("associationActivities.group.audienceLabel"),
              requireMedia: false,
              title: t("associationActivities.group.composeTitle"),
              identity: t("associationActivities.group.composeIdentity", { name: group.name }),
              placeholder: t("associationActivities.group.composePlaceholder"),
              sentNotice: t("associationActivities.group.composeSent"),
            },
          }}
        />
      ) : null}
    </section>
  )
}

function GroupWall(props: { readonly group: AssociationGroupView; readonly capability: AssociationGroupsCapability }) {
  const { t, locale } = useDiasporaGaT()
  const id = useId()
  const [remove, setRemove] = useState<{ readonly postId: string; readonly isMine: boolean } | null>(null)
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })
  async function withdraw(): Promise<ActionErrorCode | null> {
    if (!remove) return null
    const result = await props.capability.removePost({ groupId: props.group.groupId, ...remove })
    return result.ok ? null : result.code
  }
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="text-xl font-semibold">{t("associationActivities.group.wall")}</h2>
      {props.group.canPublish ? <GroupPostForm groupId={props.group.groupId} capability={props.capability} /> : null}
      <ServicePager read={(cursor) => props.capability.usePosts({ groupId: props.group.groupId, cursor })} keyOf={(post) => post.postId} empty={<p className="rounded-lg bg-muted p-4">{t("associationActivities.group.empty")}</p>}>
        {(posts) => <ul className="flex flex-col gap-3">{posts.map((post) => <li key={post.postId}><ReportedContent target={{ kind: "post", id: post.postId }}><Card className="flex min-w-0 flex-col gap-3 p-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{post.author.displayName ?? t("associationActivities.group.authorUnavailable")}</p><time dateTime={new Date(post.createdAt).toISOString()} className="text-sm text-muted-foreground">{formatter.format(post.createdAt)}</time></div>
          <p className="whitespace-pre-line break-words">{post.body}</p>
          {post.moderation === "pending_review" ? <p role="status" className="text-sm text-muted-foreground">{t("associationActivities.pending")}</p> : null}
          {post.canRemove ? <Button className="self-start" variant="ghost" size="sm" onClick={() => setRemove({ postId: post.postId, isMine: post.isMine })}>{t("associationActivities.group.removePost")}</Button> : null}
          {canReportGroupPost(post) ? <ReportContentAction target={{ kind: "post", id: post.postId }} className="self-start" /> : null}
        </Card></ReportedContent></li>)}</ul>}
      </ServicePager>
      {remove ? <ConfirmSheet open onOpenChange={(open) => { if (!open) setRemove(null) }} title={t("associationActivities.group.removePost")} description={t("associationActivities.group.removeDescription")} confirmLabel={t("associationActivities.group.removePost")} destructive onConfirm={withdraw} /> : null}
    </section>
  )
}

/** AS-02 : une publication publiée d'autrui ; qui anime le groupe la retire lui-même au lieu de la signaler. */
function canReportGroupPost(post: AssociationGroupPostView): boolean {
  return !post.isMine && !post.canRemove && post.moderation === "published"
}

const postSchema = z.object({ body: z.string().trim().min(1, "post_empty").max(2000, "post_too_long") })

function GroupPostForm(props: { readonly groupId: string; readonly capability: AssociationGroupsCapability }) {
  const { t } = useDiasporaGaT()
  const id = useId()
  const [key, setKey] = useState(() => crypto.randomUUID())
  const task = useActivityTask()
  const form = useForm<{ body: string }>({ resolver: zodResolver(postSchema), defaultValues: { body: "" } })
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={form.handleSubmit((values) => task.run(() => props.capability.publish({ groupId: props.groupId, body: values.body, idempotencyKey: key }), () => { form.reset(); setKey(crypto.randomUUID()); toast.success(t("associationActivities.group.saved")) }))}>
      <Field id={id} label={t("associationActivities.group.body")} hint={t("associationActivities.group.bodyHint")} error={form.formState.errors.body?.message ? t(`errors.${form.formState.errors.body.message}`) : undefined}>
        {(field) => <Textarea id={id} rows={4} maxLength={2000} disabled={task.busy} aria-invalid={field.invalid || undefined} aria-describedby={field.describedBy} {...form.register("body")} />}
      </Field>
      {task.error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${task.error}`)}</p> : null}
      <Button type="submit" className="self-start" disabled={task.busy} aria-busy={task.busy}>{t(task.busy ? "associationActivities.working" : "associationActivities.group.publish")}</Button>
    </form>
  )
}
