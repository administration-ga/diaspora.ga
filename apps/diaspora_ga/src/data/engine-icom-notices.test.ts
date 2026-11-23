import { icomMobileTabHref } from "@antsia/social-features/features/messagerie/icom-mobile-tabs"
import { chatKey, groupeKey } from "@antsia/social-features/features/messagerie/messagerie-dock"
import { conversationHref } from "@antsia/social-features/features/messagerie/messagerie-routes"
import type { Id } from "@convex/_generated/dataModel"
import { describe, expect, it } from "vitest"

import { routes } from "@/lib/routes"

import { toNotificationView } from "./engine-views"

/**
 * IM-04 : les avis d'iCom émis par le moteur (`calls/evaluate.ts`, `calls/voicemail.ts`,
 * `groups/unread.ts`, `groups/invites.ts`) — l'auteur par son profil publié, le fil de groupe
 * pour un message ou une invitation, rien d'autre ; aucun contenu, aucun identifiant d'appel.
 */
type Notice = Parameters<typeof toNotificationView>[0]

const AWA = { personId: "person-demo" as Id<"persons">, displayName: "Awa OGOUÉ", handle: "awa.demo", avatarUrl: null, badges: [] } as unknown as Notice["actor"]
const notice = (overrides: Partial<Notice> = {}): Notice => ({
  notificationId: "notice-icom-demo" as Id<"notifications">,
  kind: "group_message", subject: null,
  createdAt: 42, readAt: null, resolution: null, inviteState: null,
  fileScanStatus: null, actor: AWA, page: null, ...overrides,
})
const BASE = { id: "notice-icom-demo", createdAt: 42, read: false, pendingConnectionId: null, postId: null, actor: { handle: "awa.demo", displayName: "Awa OGOUÉ" } } as const

describe("avis d'iCom dans la cloche DIASPORA.GA", () => {
  it("un message de groupe : le fil de groupe, jamais un message", () => {
    expect(toNotificationView(notice({ subject: { kind: "groupThread", id: "thread-demo" } }))).toEqual({
      ...BASE, kind: "group_message", inviteOutcome: null, groupThreadId: "thread-demo",
    })
    expect(toNotificationView(notice()).groupThreadId).toBeNull()
  })

  it("une invitation de groupe : le fil, et l'issue posée par le serveur", () => {
    const invite = notice({ kind: "group_added", subject: { kind: "groupThread", id: "thread-demo" } })
    expect(toNotificationView(invite)).toEqual({ ...BASE, kind: "group_added", inviteOutcome: null, groupThreadId: "thread-demo" })
    expect(toNotificationView({ ...invite, resolution: { kind: "accepted", at: 1 } }).inviteOutcome).toBe("accepted")
    expect(toNotificationView({ ...invite, resolution: { kind: "declined", at: 1 } }).inviteOutcome).toBe("declined")
  })

  it("un appel manqué et un message vocal : l'auteur seul, sans identifiant d'appel ni de message", () => {
    expect(toNotificationView(notice({ kind: "call_missed", subject: { kind: "call", id: "call-demo" } }))).toEqual({ ...BASE, kind: "call_missed", inviteOutcome: null })
    expect(toNotificationView(notice({ kind: "voicemail_left", subject: { kind: "voicemail", id: "voicemail-demo" } }))).toEqual({ ...BASE, kind: "voicemail_left", inviteOutcome: null })
  })

  // IC-09 (antsia#204) : genre et destination écrits comme chaînes, pour que ce test se type aussi
  // contre un moteur qui ne les déclare pas encore (l'adaptateur les compare de même).
  const PERSONAL_MESSAGE = "personal_message" as string as Notice["kind"]
  const personalThread = (threadId: string) => ({ kind: "personalThread", threadId }) as unknown as Notice["target"]

  it("un message à deux : l'expéditeur par son profil publié et SA conversation, relue par le moteur ; jamais un message", () => {
    expect(toNotificationView(notice({ kind: PERSONAL_MESSAGE, target: personalThread("thread-pair") }))).toEqual({
      ...BASE, kind: "personal_message", inviteOutcome: null, personalThreadId: "thread-pair",
    })
  })

  it("un message à deux dont la conversation ne se lit plus : l'avis reste, sans conversation", () => {
    expect(toNotificationView(notice({ kind: PERSONAL_MESSAGE })).personalThreadId).toBeNull()
    expect(toNotificationView(notice({ kind: PERSONAL_MESSAGE, target: personalThread("") })).personalThreadId).toBeNull()
    // Une autre destination typée n'est pas une conversation à deux.
    expect(toNotificationView(notice({ kind: PERSONAL_MESSAGE, target: { kind: "page", pageId: "p", pageHandle: "amicale" } as Notice["target"] })).personalThreadId).toBeNull()
  })
})

describe("adresses des avis d'iCom", () => {
  it("la conversation de groupe et le journal d'appels : les adresses que compose la messagerie du moteur", () => {
    expect(routes.groupConversation("thread-demo")).toBe(conversationHref(groupeKey("thread-demo"), routes.messages()))
    // IC-09 : la conversation à deux, celle que compose la cible web du moteur (`conversationHref(chatKey(fil))`).
    expect(routes.personalConversation("thread-pair")).toBe(conversationHref(chatKey("thread-pair"), routes.messages()))
    expect(routes.callJournal()).toBe(icomMobileTabHref("iappel", { home: routes.home(), messages: routes.messages() }))
  })
})
