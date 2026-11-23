/**
 * DS-14 (ouverture) — `openingDestination` : où mène une notification poussée touchée sur
 * l'appareil. La même destination que la ligne de la cloche ; le profil publié de qui a agi pour un
 * avis que son nom mène ; le journal d'appels seulement s'il est fourni ; un repli UNIQUE pour tout
 * le reste (référence inconnue, objet qui ne se lit plus, route non servie).
 */
import { describe, expect, it } from "vitest"

import type { NotificationOpeningView } from "../data/notification-opening-port"
import type { NoticeTarget } from "../data/types"
import type { FeatureRoutes } from "../routing"
import { openingDestination } from "./notification-destinations"

const FALLBACK = "/notifications"

const baseRoutes: FeatureRoutes = {
  profile: (handle) => `/@${handle}`,
  post: (id) => `/publication/${id}`,
  page: (handle) => `/pages/${handle}`,
  hub: (country) => `/pays/${country}`,
  feed: () => "/fil",
  sponsor: () => "/parrainer",
  settings: () => "/parametres",
  attestation: () => "/verification",
  enter: () => "/entrer",
}

const appRoutes: FeatureRoutes = {
  ...baseRoutes,
  groupConversation: (threadId) => `/messages/groupe/${threadId}`,
  personalConversation: (threadId) => `/messages/chat/${threadId}`,
  callJournal: () => "/messages?brique=iappel",
  agenda: () => "/agenda",
  serviceRequest: (id) => `/mes-demandes/${id}`,
}

function opened(notice: Partial<NoticeTarget> & Pick<NoticeTarget, "kind">): NotificationOpeningView {
  return { channel: "notice", notice: { actor: { handle: "awa.demo" }, postId: null, ...notice } }
}

describe("ouverture d'une notification poussée — destination", () => {
  it("un message à deux mène à SA conversation ; sans conversation lisible, au repli", () => {
    expect(openingDestination(opened({ kind: "personal_message", personalThreadId: "fil-1" }), appRoutes, FALLBACK)).toBe("/messages/chat/fil-1")
    expect(openingDestination(opened({ kind: "personal_message", personalThreadId: null }), appRoutes, FALLBACK)).toBe(FALLBACK)
    expect(openingDestination(opened({ kind: "personal_message", personalThreadId: "fil-1" }), baseRoutes, FALLBACK)).toBe(FALLBACK)
  })

  it("la même destination que la ligne de la cloche : publication, groupe, demande, agenda", () => {
    expect(openingDestination(opened({ kind: "post_comment", postId: "pub-1" }), appRoutes, FALLBACK)).toBe("/publication/pub-1")
    expect(openingDestination(opened({ kind: "group_message", groupThreadId: "fil-2" }), appRoutes, FALLBACK)).toBe("/messages/groupe/fil-2")
    expect(openingDestination(opened({ kind: "service_request_declined", serviceNotice: { audience: "requester", requestId: "dem-1", pageHandle: null } }), appRoutes, FALLBACK)).toBe("/mes-demandes/dem-1")
    expect(openingDestination(opened({ kind: "event_invite" }), appRoutes, FALLBACK)).toBe("/agenda")
  })

  it("un avis que le nom de qui a agi mène : son profil publié ; sans profil publié, le repli", () => {
    expect(openingDestination(opened({ kind: "connection_request" }), appRoutes, FALLBACK)).toBe("/@awa.demo")
    expect(openingDestination(opened({ kind: "new_follower", actor: null }), appRoutes, FALLBACK)).toBe(FALLBACK)
  })

  it("un avis sans destination, un objet qui ne se lit plus ou un genre inconnu : le repli", () => {
    expect(openingDestination(opened({ kind: "attestation_verified" }), appRoutes, FALLBACK)).toBe(FALLBACK)
    expect(openingDestination(opened({ kind: "post_reaction", postId: null }), appRoutes, FALLBACK)).toBe(FALLBACK)
    expect(openingDestination(opened({ kind: "association_event_reminder", associationEvent: null }), appRoutes, FALLBACK)).toBe(FALLBACK)
    expect(openingDestination(opened({ kind: "other" }), appRoutes, FALLBACK)).toBe(FALLBACK)
  })

  it("une référence inconnue, l'avis d'un autre ou une cible fermée (`null`) : le même repli", () => {
    expect(openingDestination(null, appRoutes, FALLBACK)).toBe(FALLBACK)
  })

  it("un appel : le journal d'appels quand l'application le fournit ; appels fermés, le repli", () => {
    expect(openingDestination({ channel: "call", ringing: true }, appRoutes, FALLBACK)).toBe("/messages?brique=iappel")
    expect(openingDestination({ channel: "call", ringing: false }, appRoutes, FALLBACK)).toBe("/messages?brique=iappel")
    expect(openingDestination({ channel: "call", ringing: true }, baseRoutes, FALLBACK)).toBe(FALLBACK)
  })

  it("appels fermés, un appel manqué ou un message vocal poussés mènent au repli", () => {
    expect(openingDestination(opened({ kind: "call_missed" }), appRoutes, FALLBACK)).toBe("/messages?brique=iappel")
    expect(openingDestination(opened({ kind: "call_missed" }), baseRoutes, FALLBACK)).toBe(FALLBACK)
    expect(openingDestination(opened({ kind: "voicemail_left" }), baseRoutes, FALLBACK)).toBe(FALLBACK)
  })
})
