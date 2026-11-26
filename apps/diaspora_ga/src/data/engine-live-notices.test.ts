import type { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { LIVE_NOTIFICATION_KINDS } from "@diaspora-ga/features/data"
import type { FunctionReturnType } from "convex/server"
import { describe, expect, it } from "vitest"

import { toNotificationOpeningView, toNotificationView } from "./engine-views"

/**
 * Les avis d'un LIVE émis par le moteur (`live/sessions.ts` au démarrage et à la publication du
 * replay, `live/invitees.ts`, `live/antenna.ts`) : l'hôte par son profil publié, la SESSION désignée
 * par le sujet `liveSession`, l'issue d'une invitation posée par le serveur. Le moteur ne sert pas le
 * titre du live dans l'avis : la vue n'en porte pas. Références et identifiants fictifs.
 */
type Notice = Parameters<typeof toNotificationView>[0]
type Opening = FunctionReturnType<typeof api.modules.notifications.open.resolveOpenTarget>
type NoticeOpening = Extract<NonNullable<Opening>, { channel: "notification" }>

const HOST = { personId: "person-hote" as Id<"persons">, displayName: "Awa OGOUÉ", handle: "awa.demo", avatarUrl: null, badges: [] } as unknown as Notice["actor"]
const SESSION = { kind: "liveSession", id: "live-demo" } as const
const notice = (overrides: Partial<Notice> = {}): Notice => ({
  notificationId: "notice-live-demo" as Id<"notifications">,
  kind: "live_started", subject: SESSION,
  createdAt: 42, readAt: null, resolution: null, inviteState: null,
  fileScanStatus: null, actor: HOST, page: null, ...overrides,
})
const BASE = { id: "notice-live-demo", createdAt: 42, read: false, pendingConnectionId: null, postId: null, actor: { handle: "awa.demo", displayName: "Awa OGOUÉ" } } as const

describe("cloche DIASPORA.GA — les avis d'un live", () => {
  it("les quatre genres du live du moteur sont nommés, dans l'ordre de son domaine", () => {
    expect(LIVE_NOTIFICATION_KINDS).toEqual(["live_started", "live_invite", "live_antenna_invite", "live_replay_published"])
  })

  it("l'hôte est en direct : son profil publié et la session, sans issue ni titre", () => {
    const view = toNotificationView(notice())
    expect(view).toEqual({ ...BASE, kind: "live_started", inviteOutcome: null, liveSessionId: "live-demo" })
    expect(Object.keys(view)).not.toContain("title")
  })

  it("le replay publié : la même session (sa page sert le replay)", () => {
    expect(toNotificationView(notice({ kind: "live_replay_published" }))).toEqual({ ...BASE, kind: "live_replay_published", inviteOutcome: null, liveSessionId: "live-demo" })
  })

  it.each(["live_invite", "live_antenna_invite"] as const)("%s : la session, et l'issue que le serveur a posée", (kind) => {
    expect(toNotificationView(notice({ kind }))).toEqual({ ...BASE, kind, inviteOutcome: null, liveSessionId: "live-demo" })
    expect(toNotificationView(notice({ kind, resolution: { kind: "accepted", at: 1 } })).inviteOutcome).toBe("accepted")
    expect(toNotificationView(notice({ kind, resolution: { kind: "declined", at: 1 } })).inviteOutcome).toBe("declined")
    // Invitation retirée par l'hôte, ou live terminé : elle n'est plus d'actualité.
    expect(toNotificationView(notice({ kind, resolution: { kind: "cancelled", at: 1 } })).inviteOutcome).toBe("gone")
    expect(toNotificationView(notice({ kind, resolution: { kind: "expired", at: 1 } })).inviteOutcome).toBe("gone")
  })

  it("sans sujet de session, ou avec un autre sujet : l'avis reste, sans session", () => {
    expect(toNotificationView(notice({ subject: null })).liveSessionId).toBeNull()
    expect(toNotificationView(notice({ subject: { kind: "post", id: "post-demo" } })).liveSessionId).toBeNull()
    expect(toNotificationView(notice({ subject: { kind: "liveSession", id: "" } })).liveSessionId).toBeNull()
  })

  it("un hôte sans profil publié : aucun nom, la session reste", () => {
    expect(toNotificationView(notice({ actor: null }))).toEqual({ ...BASE, actor: null, kind: "live_started", inviteOutcome: null, liveSessionId: "live-demo" })
  })

  it("un autre genre ne porte jamais de session de live", () => {
    expect(Object.keys(toNotificationView(notice({ kind: "post_comment", subject: { kind: "post", id: "post-demo" } })))).not.toContain("liveSessionId")
  })
})

describe("ouverture d'une notification poussée d'un live (DS-14)", () => {
  const opening = (overrides: Partial<NoticeOpening> = {}): NoticeOpening => ({ channel: "notification", kind: "live_started", subject: SESSION, actorHandle: "awa.demo", target: null, ...overrides })

  it("la session désignée, dans la forme qu'un lien d'avis lit", () => {
    expect(toNotificationOpeningView(opening())).toEqual({ channel: "notice", notice: { kind: "live_started", actor: { handle: "awa.demo" }, postId: null, liveSessionId: "live-demo" } })
    expect(toNotificationOpeningView(opening({ kind: "live_antenna_invite" }))).toMatchObject({ notice: { kind: "live_antenna_invite", liveSessionId: "live-demo" } })
    expect(toNotificationOpeningView(opening({ subject: null }))).toMatchObject({ notice: { liveSessionId: null } })
  })
})
