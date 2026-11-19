/** DG-010 : groupe privé et événements d'une association, participations volontaires. */
import { isPageEventCancellationReason, PAGE_EVENT_CANCELLATION_REASONS, type PageEventCancellationReason } from "@antsia/social-domain/events"

import type { PagePinnedQuery } from "./page-publications-port"
import type { ActionResult, PublishMediaInput } from "./port"
import type { FeedCursorView, FeedPageQuery, Loadable } from "./types"
import type { AssociationEventReminderState, CountryCode } from "@diasporale/domain"
import type { AssociationEventAttendanceCapability } from "./association-attendance-port"
import type { AssociationEventGalleryCapability } from "./association-event-gallery-port"
import type { AssociationEventCalendarCapability } from "./association-event-calendar-port"

export const ASSOCIATION_ACTIVITY_PAGE_SIZE = 20
export const ASSOCIATION_EVENT_AUDIENCES = ["network", "association"] as const
export type AssociationEventAudience = (typeof ASSOCIATION_EVENT_AUDIENCES)[number]
export const ASSOCIATION_ACTIVITY_ERROR_CODES = [
  "association_group_access_required", "association_group_closed", "association_group_exists", "association_group_changed",
  "association_event_invalid", "association_event_version_changed", "association_event_cancelled",
  "association_event_schedule_locked", "association_event_access_required",
  "association_event_capacity_invalid", "association_event_capacity_below_confirmed",
  "association_event_deadline_invalid", "association_event_registration_closed", "association_event_reminder_too_late",
  "association_event_attendance_closed", "association_event_attendance_code_invalid", "association_event_attendance_changed",
  "association_event_gallery_not_open", "association_event_gallery_media_required",
] as const

/**
 * EV-03 : le motif d'une annulation, pris dans la liste FERMÉE du moteur, sans texte libre
 * (plan 08, décision 2 : lieu indisponible, météo, organisateur empêché, autre). Il se lit sur la
 * fiche avec les droits du lecteur, jamais dans l'avis de la cloche.
 */
export const ASSOCIATION_EVENT_CANCELLATION_REASONS = PAGE_EVENT_CANCELLATION_REASONS
export type AssociationEventCancellationReason = PageEventCancellationReason
export const isAssociationEventCancellationReason = isPageEventCancellationReason

/** Ce que la fiche d'un évènement annulé dit de son annulation ; `reason: null` : annulé sans motif. */
export interface AssociationEventCancellationView {
  readonly reason: AssociationEventCancellationReason | null
}

export interface AssociationActivityPage<T> {
  readonly items: readonly T[]
  readonly continueCursor: string | null
  readonly isDone: boolean
}

export interface AssociationGroupView {
  readonly groupId: string
  readonly pageId: string
  readonly name: string
  readonly state: "active" | "closed"
  /** AS-03 : la fermeture en vigueur, que cite une réouverture ; `null` pour un groupe actif. */
  readonly closedAt: number | null
  readonly role: "owner" | "moderator" | "member" | null
  readonly isMember: boolean
  readonly canJoin: boolean
  readonly canManage: boolean
  readonly canPublish: boolean
}

/** Mur privé, sans coordonnées, identifiant de personne ni lien vers un profil. */
export interface AssociationGroupPostView {
  readonly postId: string
  readonly body: string
  readonly author: { readonly displayName: string | null }
  readonly createdAt: number
  readonly isMine: boolean
  readonly canRemove: boolean
  readonly moderation: "published" | "pending_review" | "removed"
}

/**
 * AS-08 : le mur du groupe au format du fil (décision 5 du plan 07) — cartes, réactions,
 * commentaires, signalement, auteur qui ouvre son profil. Chaque fenêtre repasse la garde
 * d'association du moteur ; seuls les membres vivants d'un groupe actif le lisent.
 */
export interface AssociationGroupWallCapability {
  useWall(input: { readonly groupId: string; readonly cursor: FeedCursorView | null }): FeedPageQuery
  /** La publication épinglée en tête, relue avec sa garde ; `null` sans épingle. */
  usePinned(groupId: string): PagePinnedQuery
  /** Épingler une publication du groupe : qui anime le groupe (responsable, animateur). */
  pin(input: { readonly groupId: string; readonly postId: string }): Promise<ActionResult>
  unpin(groupId: string): Promise<ActionResult>
}

export interface AssociationGroupsCapability {
  /** AS-08 : facultatif ; sans lui, le mur garde sa projection en texte. */
  readonly wall?: AssociationGroupWallCapability
  useGroup(pageId: string): Loadable<AssociationGroupView | null>
  usePosts(input: { readonly groupId: string; readonly cursor: string | null }): Loadable<AssociationActivityPage<AssociationGroupPostView>>
  /** Crée au plus un groupe lié ; ce geste du responsable n'inscrit aucun adhérent. */
  create(input: { readonly pageId: string; readonly idempotencyKey: string }): Promise<ActionResult<{ readonly groupId: string; readonly created: boolean }>>
  join(groupId: string): Promise<ActionResult>
  leave(groupId: string): Promise<ActionResult>
  close(groupId: string): Promise<ActionResult>
  /** AS-03 : rouvrir, en citant la fermeture lue ; l'administrateur de la page seul. */
  reopen(input: { readonly groupId: string; readonly expectedClosedAt: number }): Promise<ActionResult>
  /** Dans le groupe seulement ; aucune audience publique ni publication racine. Photos ou vidéo jointes (AS-08). */
  publish(input: { readonly groupId: string; readonly body: string; readonly idempotencyKey: string; readonly media?: readonly PublishMediaInput[] }): Promise<ActionResult<{ readonly postId: string; readonly created: boolean }>>
  removePost(input: { readonly groupId: string; readonly postId: string; readonly isMine: boolean }): Promise<ActionResult>
}

export interface AssociationEventInput {
  readonly pageId: string
  readonly title: string
  readonly description: string
  readonly location: string
  readonly startAt: number
  readonly endAt: number
  readonly timeZone: string
  readonly audience: AssociationEventAudience
  /** Omission : sans limite à la création, capacité conservée lors d'une édition ancienne. */
  readonly capacity?: number | null
  /** UTC ; absence conservée en édition, null clôture seulement au début de l'événement. */
  readonly registrationClosesAt?: number | null
}

export interface AssociationEventView {
  readonly eventId: string
  readonly pageId: string
  readonly title: string
  readonly description: string
  readonly location: string
  readonly startAt: number
  readonly endAt: number
  readonly timeZone: string
  readonly audience: AssociationEventAudience
  readonly status: "scheduled" | "cancelled"
  readonly version: number
  readonly organizer: { readonly name: string; readonly handle: string }
  readonly moderation: "published" | "pending_review" | "removed"
  readonly isRegistered: boolean
  readonly canManage: boolean
  readonly canRegister: boolean
  readonly capacity: number | null
  readonly confirmedCount: number
  readonly waitlistCount: number
  readonly remainingPlaces: number | null
  readonly registration: "none" | "confirmed" | "waitlisted"
  /** Mon rang uniquement ; la file et les identités d'autrui restent privées. */
  readonly waitlistPosition: number | null
  readonly registrationClosesAt: number | null
  readonly registrationOpen: boolean
  readonly reminderEnabled: boolean
  readonly reminderAt: number | null
  readonly reminderState: AssociationEventReminderState
}

/** HB-02 : évènements d'un pays lus par fenêtre dans le hub, par défaut, et au plus. */
export const COUNTRY_EVENTS_PAGE_SIZE = 10
export const COUNTRY_EVENTS_PAGE_MAX = 20

/**
 * Un évènement d'association dans le hub de son pays (HB-02) : OUVERT AU RÉSEAU,
 * programmé, publié par la modération, à venir. La carte seulement : ni inscrits,
 * ni capacité, ni état du lecteur, que la fiche de l'évènement dit sous sa garde.
 */
export interface CountryEventView {
  readonly eventId: string
  readonly pageId: string
  readonly title: string
  /** Lieu saisi par l'association ; vide quand elle n'en dit rien. */
  readonly location: string
  readonly startAt: number
  readonly endAt: number
  /** Le fuseau dans lequel l'association a pensé l'évènement. */
  readonly timeZone: string
  readonly organizer: { readonly name: string; readonly handle: string }
}

export interface CountryEventsPage extends AssociationActivityPage<CountryEventView> {
  /**
   * La lecture n'a parcouru qu'une fenêtre bornée des pages du pays : des
   * évènements d'autres associations peuvent manquer, et l'écran le dit.
   */
  readonly partial: boolean
}

export interface CountryEventsRequest {
  readonly country: CountryCode
  /** Instant fixé par l'écran : « à venir » se lit à partir de lui, et le curseur lui reste attaché. */
  readonly anchor: number
  /** Curseur opaque du fournisseur ; `null` pour la première fenêtre. */
  readonly cursor: string | null
  /** Évènements par fenêtre ; `COUNTRY_EVENTS_PAGE_SIZE` par défaut, `COUNTRY_EVENTS_PAGE_MAX` au plus. */
  readonly limit?: number
}

/** La taille d'une fenêtre demandée, bornée comme le moteur la borne. */
export function countryEventsPageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return COUNTRY_EVENTS_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(limit), 1), COUNTRY_EVENTS_PAGE_MAX)
}

export interface AssociationEventsCapability {
  readonly reminderDelivery?: "engine" | "preferences_only"
  readonly attendance?: AssociationEventAttendanceCapability
  readonly gallery?: AssociationEventGalleryCapability
  readonly calendar?: AssociationEventCalendarCapability
  /**
   * HB-02 : les prochains évènements ouverts au réseau des associations d'un pays,
   * bornés et paginés, chacun repassé par la garde des évènements de page. Facultatif :
   * un fournisseur qui ne le sert pas le laisse absent, et le hub le dit.
   */
  useCountryEvents?(request: CountryEventsRequest): Loadable<CountryEventsPage>
  useEvents(input: { readonly pageId: string; readonly cursor: string | null }): Loadable<AssociationActivityPage<AssociationEventView>>
  useEvent(eventId: string): Loadable<AssociationEventView | null>
  create(input: AssociationEventInput & { readonly idempotencyKey: string }): Promise<ActionResult<{ readonly eventId: string; readonly created: boolean }>>
  update(input: AssociationEventInput & { readonly eventId: string; readonly expectedVersion: number }): Promise<ActionResult>
  /**
   * Annuler l'évènement (terminal). EV-03 : `reason`, facultatif pour le fournisseur, est pris dans
   * la liste fermée ; chaque inscrit et chaque personne en attente en est avisé, sans le motif.
   */
  cancel(input: { readonly eventId: string; readonly expectedVersion: number; readonly reason?: AssociationEventCancellationReason }): Promise<ActionResult>
  /**
   * EV-03 : le motif d'un évènement ANNULÉ, relu avec les droits du lecteur ; `null` quand
   * l'évènement ne se lit pas ou n'est pas annulé. Facultatif : un fournisseur qui ne le sert pas
   * le laisse absent, et la fiche ne dit que « annulé ».
   */
  useCancellation?(eventId: string): Loadable<AssociationEventCancellationView | null>
  /**
   * EV-03 : qui écrit les avis d'issue (annulation, place obtenue) — le moteur, ou la démonstration
   * qui les simule dans ce navigateur. Absent : aucun avis promis par l'écran.
   */
  readonly outcomeNotices?: "engine" | "simulated"
  /** Demande une place ou rejoint la file ; un rejeu garde l'ordre et reprend son traitement borné. */
  register(eventId: string): Promise<ActionResult>
  unregister(eventId: string): Promise<ActionResult>
  /** Choix personnel, désactivé par défaut ; aucune préférence d'autrui n'est exposée. */
  setReminder(input: { readonly eventId: string; readonly enabled: boolean }): Promise<ActionResult>
}
