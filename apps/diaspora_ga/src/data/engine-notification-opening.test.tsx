// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import type { api } from "@convex/_generated/api"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName, type FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEngineNotificationOpening } from "./engine-notification-opening"
import { createEngineDataSource } from "./engine-source"
import { toNotificationOpeningView } from "./engine-views"

/**
 * DS-14 (ouverture) : l'adaptateur de la porte d'une notification poussée, sans moteur — la lecture
 * réactive `notifications/open:resolveOpenTarget` jouée par un `useQueries` factice. Références et
 * identifiants fictifs.
 */
type Reference = Parameters<typeof getFunctionName>[0]
type Opening = FunctionReturnType<typeof api.modules.notifications.open.resolveOpenTarget>
type NoticeOpening = Extract<NonNullable<Opening>, { channel: "notification" }>

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
  read: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth, useAuthenticatedConvexQuery: () => ({}) }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.read(name, queries.value.args)
    return { value: mocks.respond(name, queries.value.args) }
  },
}))

const OPEN = "modules/notifications/open:resolveOpenTarget"
const NETWORK = { _id: "network-diaspora" }
const MEMBER = { status: "declaree", capabilities: ["read_network", "publish", "communicate"] }
const DEPS = { convex: {} as ConvexReactClient, authClient: {} as EngineAuthClient }

/** IC-09 (antsia#204) écrit comme chaînes : ce test se type aussi contre un moteur qui ne les déclare pas encore. */
const PERSONAL_MESSAGE = "personal_message" as string as NoticeOpening["kind"]
const personalThread = (threadId: string) => ({ kind: "personalThread", threadId }) as unknown as NoticeOpening["target"]

function noticeOpening(overrides: Partial<NoticeOpening> = {}): NoticeOpening {
  return { channel: "notification", kind: "post_comment", subject: null, actorHandle: "awa.demo", target: null, ...overrides }
}

function respondWith(overrides: Record<string, unknown> = {}) {
  mocks.respond = (name) => {
    if (name in overrides) return overrides[name]
    if (name === "modules/networks/networks:getBySlug") return NETWORK
    if (name === "modules/diaspora/membership:myMembership") return MEMBER
    if (name === OPEN) return noticeOpening({ kind: PERSONAL_MESSAGE, target: personalThread("thread-pair") })
    throw new Error(`Unexpected read: ${name}`)
  }
}

function openArgs(): Record<string, unknown>[] {
  return mocks.read.mock.calls.filter(([name]) => name === OPEN).map(([, args]) => args as Record<string, unknown>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  respondWith()
})
afterEach(cleanup)

describe("porte d'ouverture — notifications/open:resolveOpenTarget", () => {
  it("la source du moteur sert la porte d'ouverture", () => {
    expect(createEngineDataSource(DEPS).notificationOpening?.useOpening).toBeTypeOf("function")
  })

  it("relit la référence pour le réseau DIASPORA.GA, avec un jeton d'ouverture, et rend la conversation d'un message à deux", () => {
    const opening = createEngineNotificationOpening(DEPS)
    const { result } = renderHook(() => opening.useOpening("delivery_demo"))
    const [args] = openArgs()
    expect(args).toMatchObject({ networkId: NETWORK._id, reference: "delivery_demo" })
    expect(String(args?.openingToken)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
    expect(result.current.state).toEqual({
      status: "ready",
      data: { channel: "notice", notice: { kind: "personal_message", actor: { handle: "awa.demo" }, postId: null, personalThreadId: "thread-pair" } },
    })
  })

  it("une référence inconnue, celle d'un autre ou une cible fermée : la même réponse `null`", () => {
    respondWith({ [OPEN]: null })
    const opening = createEngineNotificationOpening(DEPS)
    expect(renderHook(() => opening.useOpening("delivery_demo")).result.current.state).toEqual({ status: "ready", data: null })
  })

  it("un refus d'accès se lit comme une référence inconnue ; hors session, aucune lecture", () => {
    respondWith({ [OPEN]: new ConvexError({ code: "membershipSuspended" }) })
    const opening = createEngineNotificationOpening(DEPS)
    expect(renderHook(() => opening.useOpening("delivery_demo")).result.current.state).toEqual({ status: "ready", data: null })
    vi.clearAllMocks()
    respondWith({ "modules/diaspora/membership:myMembership": null })
    expect(renderHook(() => opening.useOpening("delivery_demo")).result.current.state).toEqual({ status: "ready", data: null })
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    expect(renderHook(() => opening.useOpening("delivery_demo")).result.current.state).toEqual({ status: "ready", data: null })
    expect(openArgs()).toEqual([])
  })

  it("une panne se dit, et « Réessayer » relit avec un jeton neuf, jamais la réponse gardée", () => {
    respondWith({ [OPEN]: new Error("network down") })
    const opening = createEngineNotificationOpening(DEPS)
    const { result } = renderHook(() => opening.useOpening("delivery_demo"))
    expect(result.current.state.status).toBe("error")
    const first = openArgs().at(-1)?.openingToken
    respondWith()
    act(() => result.current.retry())
    const second = openArgs().at(-1)?.openingToken
    expect(second).not.toBe(first)
    expect(result.current.state.status).toBe("ready")
  })
})

describe("porte d'ouverture — projection de la destination relue", () => {
  it("un appel : sonne-t-il encore, rien d'autre", () => {
    expect(toNotificationOpeningView({ channel: "call", ringing: true })).toEqual({ channel: "call", ringing: true })
    expect(toNotificationOpeningView(null)).toBeNull()
  })

  it("les sujets communs de la cloche : publication, fil de groupe, conversation de mise en relation, album", () => {
    expect(toNotificationOpeningView(noticeOpening({ subject: { kind: "post", id: "post-1" } }))).toEqual({ channel: "notice", notice: { kind: "post_comment", actor: { handle: "awa.demo" }, postId: "post-1" } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "group_message", subject: { kind: "groupThread", id: "fil-1" } }))).toMatchObject({ notice: { groupThreadId: "fil-1" } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "contextual_message", subject: { kind: "contextualThread", id: "fil-2" } }))).toMatchObject({ notice: { contextualThreadId: "fil-2" } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "album_published", subject: { kind: "album", id: "album-1" } }))).toMatchObject({ notice: { albumId: "album-1" } })
  })

  it("les destinations typées relues pour le lecteur : mise en relation, vie communautaire, décisions, page", () => {
    const service = toNotificationOpeningView(noticeOpening({
      kind: "service_request_declined",
      target: { kind: "diasporaServiceNotice", audience: "requester", subjectKind: "serviceRequest", subjectId: "dem-1", requestId: "dem-1", pageHandle: null },
    }))
    expect(service).toMatchObject({ notice: { serviceNotice: { audience: "requester", requestId: "dem-1", pageHandle: null } } })
    const community = toNotificationOpeningView(noticeOpening({
      kind: "aid_answer_received",
      target: { kind: "diasporaCommunityNotice", audience: "author", opens: "aidQuestion", objectId: "q-1", pageHandle: null },
    }))
    expect(community).toMatchObject({ notice: { communityNotice: { audience: "author", opens: "aidQuestion", objectId: "q-1", pageHandle: null } } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "moderation_decision", target: { kind: "personalDecisions" } }))).toMatchObject({ notice: { moderationDecision: { pageHandle: null } } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "moderation_decision", target: { kind: "pageModerationDecisions", pageId: "p", pageHandle: "amicale" } }))).toMatchObject({ notice: { moderationDecision: { pageHandle: "amicale" } } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "page_signatory_invite", target: { kind: "page", pageId: "p", pageHandle: "amicale" } }))).toMatchObject({ notice: { governancePageHandle: "amicale" } })
  })

  it("sans destination relue, l'objet est absent ou nul : le lien se taira et la porte retombera sur le repli", () => {
    const decision = toNotificationOpeningView(noticeOpening({ kind: "moderation_decision" }))
    expect(decision?.channel === "notice" ? decision.notice.moderationDecision : "absente").toBeUndefined()
    expect(toNotificationOpeningView(noticeOpening({ kind: "service_request_declined" }))).toMatchObject({ notice: { serviceNotice: null } })
    expect(toNotificationOpeningView(noticeOpening({ kind: "association_event_reminder", subject: { kind: "event", id: "evt-1" } }))).toMatchObject({ notice: { associationEvent: null } })
    expect(toNotificationOpeningView(noticeOpening({ kind: PERSONAL_MESSAGE }))).toMatchObject({ notice: { personalThreadId: null } })
  })

  it("un genre que DIASPORA.GA ne nomme pas se dit « other » ; un acteur sans profil publié n'est pas nommé", () => {
    expect(toNotificationOpeningView(noticeOpening({ kind: "commercial_contact", actorHandle: null }))).toEqual({ channel: "notice", notice: { kind: "other", actor: null, postId: null } })
  })
})
