"use client"

import type { PersonalEventParticipationStatus } from "@antsia/social-domain/events"
import type { DirectStatus } from "@antsia/social-domain/live/domain"
import { CalendarDaysIcon, RadioIcon } from "lucide-react"

import type { PostEventView, PostLiveView } from "../../data/types"
import { useDiasporaGaT } from "../../i18n/client"
import { cn } from "../../lib/cn"
import { formatEventRange } from "../../lib/format"
import { MEMBERS_APP_CODE_SWITCH_STATES, type CodeSwitchState, type MembersAppCodeSwitch } from "../../navigation/code-switches"
import { useRouting, type FeatureRoutes } from "../../routing"

/**
 * Les annonces d'une publication (lot A5) : le DIRECT et l'ÉVÈNEMENT qu'elle annonce, tels que le
 * moteur les relit à chaque lecture. Rendu de référence : la carte de publication du moteur
 * (`PostCard` de `@antsia/social-features`, bloc du direct et `CharteEventBlock`), adaptée aux
 * composants, aux jetons et aux textes de DIASPORA.GA, sans import de la surface du moteur.
 */

/** Le libellé de chaque statut d'un direct, en clés littérales (le cliquet des clés les lit). */
const LIVE_STATUS_KEYS = {
  scheduled: "post.announcement.live.scheduled",
  live: "post.announcement.live.onAir",
  ended: "post.announcement.live.ended",
} as const satisfies Record<DirectStatus, string>

/** MA réponse à l'évènement annoncé, dite en une phrase. */
const PARTICIPATION_KEYS = {
  pending: "post.announcement.event.participation.pending",
  accepted: "post.announcement.event.participation.accepted",
  declined: "post.announcement.event.participation.declined",
  maybe: "post.announcement.event.participation.maybe",
} as const satisfies Record<PersonalEventParticipationStatus, string>

const BADGE = "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px] font-semibold"
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"

/**
 * Où mène l'annonce d'un direct : sa page, seulement si l'interrupteur de code du direct est ouvert
 * ET si l'application sert cette page (la démonstration ne la sert pas). Sinon `null` : la carte dit
 * le direct en texte simple, sans lien vers une page introuvable.
 */
export function liveAnnouncementHref(
  sessionId: string,
  routes: Pick<FeatureRoutes, "conference">,
  switches: Readonly<Record<MembersAppCodeSwitch, CodeSwitchState>> = MEMBERS_APP_CODE_SWITCH_STATES,
): string | null {
  if (switches.live !== "open" || routes.conference === undefined) return null
  return routes.conference(sessionId)
}

/** Le statut d'un direct : « En direct » porte un point qui ne pulse que si le mouvement est permis. */
function LiveStatusBadge(props: { status: DirectStatus }) {
  const { t } = useDiasporaGaT()
  if (props.status === "live") {
    return (
      <span data-live-status="live" className={cn(BADGE, "bg-danger-fill text-danger-on")}>
        <span data-live-dot aria-hidden className="size-2 rounded-full bg-current motion-safe:animate-pulse" />
        {t(LIVE_STATUS_KEYS.live)}
      </span>
    )
  }
  return (
    <span data-live-status={props.status} className={cn(BADGE, "bg-muted text-muted-foreground")}>
      {t(LIVE_STATUS_KEYS[props.status])}
    </span>
  )
}

/** Le direct annoncé : son titre et son statut ; un lien de 44 px au moins vers sa page quand elle est servie. */
export function PostLiveAnnouncement(props: { live: PostLiveView; className?: string }) {
  const { t } = useDiasporaGaT()
  const { routes, Link } = useRouting()
  const href = liveAnnouncementHref(props.live.sessionId, routes)
  const frame = "flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2.5"
  const content = (
    <>
      <RadioIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block", EYEBROW)}>{t("post.announcement.live.label")}</span>
        <span className="block break-words font-semibold leading-snug text-foreground">{props.live.title}</span>
      </span>
      <LiveStatusBadge status={props.live.status} />
    </>
  )
  if (href === null) {
    return (
      <div data-post-live="" className={cn(frame, props.className)}>
        {content}
      </div>
    )
  }
  return (
    <Link href={href} data-post-live="" className={cn(frame, "transition-colors hover:bg-muted focus-visible:shadow-focus", props.className)}>
      {content}
    </Link>
  )
}

/**
 * L'évènement annoncé : son titre, sa plage dans la langue et le fuseau du lecteur, l'annulation et
 * MA réponse s'il y en a une. Aucun lien : un évènement annoncé au fil est un évènement personnel,
 * et DIASPORA.GA n'a pas de page pour lui (seulement celle d'un évènement d'association). La carte
 * ne propose aucune réponse : elle dit seulement celle qui est enregistrée.
 */
export function PostEventAnnouncement(props: { event: PostEventView; className?: string }) {
  const { t, locale } = useDiasporaGaT()
  const { event } = props
  const cancelled = event.status === "cancelled"
  return (
    // Un groupe, pas une région : un fil d'annonces ne multiplie pas les repères de navigation.
    <div role="group" aria-label={t("post.announcement.event.label")} data-post-event="" className={cn("flex items-start gap-3 rounded-md border border-border px-3 py-2.5", props.className)}>
      <CalendarDaysIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={EYEBROW}>{t("post.announcement.event.label")}</span>
          {cancelled ? <span className={cn(BADGE, "bg-rejected text-rejected-foreground")}>{t("post.announcement.event.cancelled")}</span> : null}
        </div>
        <span className="mt-0.5 block break-words font-semibold leading-snug text-foreground">{event.title}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">
          <time dateTime={new Date(event.startAt).toISOString()}>{formatEventRange(event.startAt, event.endAt, locale)}</time>
        </span>
        {event.myParticipation !== null ? (
          <span className="mt-1 block text-[13px] font-medium text-foreground">{t(PARTICIPATION_KEYS[event.myParticipation])}</span>
        ) : null}
      </div>
    </div>
  )
}
