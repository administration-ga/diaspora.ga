// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { CONTENT_REPORT_REASONS } from "@antsia/social-domain/moderation"
import { DESK_GROUNDS, DESK_PAGE_SIZE, SERVICE_REVIEW_REPORT_REASONS, type DeskQueueRequest } from "@diaspora-ga/features/data"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  claimCanDecide,
  createEngineModerationDesk,
  engineZone,
  moderationDeskErrorCode,
  toCaseView,
  toClaimDetailView,
  toDeadlineView,
  toPendingView,
  toPreviewView,
} from "./engine-moderation-desk"

/**
 * L'adaptateur du guichet de modération sans moteur : lectures réactives jouées
 * par un `useQueries` factice, écritures contre un client Convex factice. Aucune
 * donnée réelle : identifiants et motifs de fixture.
 */
type Reference = Parameters<typeof getFunctionName>[0]

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  respond: (() => undefined) as (name: string, args: unknown) => unknown,
  read: vi.fn(),
}))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Reference; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.read(name, queries.value.args)
    return { value: mocks.respond(name, queries.value.args) }
  },
}))

const NOW = Date.UTC(2026, 9, 18, 12)
const DAY = 24 * 60 * 60 * 1000
const PERSON = { _id: "person-moderatrice" }
const DIASPORA_GA = { _id: "network-diaspora-ga" }
const MEMBERSHIP = { status: "declaree", capabilities: ["read_network", "publish"] }
const DESK_ROW = {
  role: "network_moderator",
  networkWide: true,
  canReviewAppeals: false,
  canManageTeams: false,
  canManagePolicy: false,
  teams: [{ teamId: "team-fr", name: "France (fixture)", scope: null, isMember: true }],
}
const CASE_ROW = {
  reportId: "report-1",
  surface: "post",
  country: "fr",
  reason: "harassment",
  status: "open",
  level: "team",
  teamName: "France (fixture)",
  createdAt: NOW - DAY,
  hasAuthor: true,
  party: null,
}
/** Une ligne de `cases.deadlineQueue` (SU01d) : le dossier, son fondement, son échéance, son accusé. */
const DEADLINE_ROW = {
  reportId: "report-1",
  networkId: DIASPORA_GA._id,
  target: { kind: "post", id: "post-1" },
  teamId: "team-fr",
  level: "team",
  reason: "harassment",
  status: "open",
  createdAt: NOW - DAY,
  decisionReason: null,
  legalBasis: "art24",
  dueAt: NOW + 2 * DAY,
  acknowledgedAt: NOW - DAY,
}

function engineError(data: Record<string, unknown>) {
  return new ConvexError(data as never)
}

/** Lectures du moteur par défaut : réseau, adhésion lisible ; le reste par `overrides`. */
function respondWith(overrides: Record<string, unknown | ((args: unknown) => unknown)> = {}) {
  mocks.respond = (name, args) => {
    if (name in overrides) {
      const value = overrides[name]
      return typeof value === "function" ? (value as (args: unknown) => unknown)(args) : value
    }
    if (name === "modules/networks/networks:getBySlug") return DIASPORA_GA
    if (name === "modules/diaspora/membership:myMembership") return MEMBERSHIP
    throw new Error(`Unexpected read: ${name}`)
  }
}

type Handler = (args: Record<string, unknown>) => unknown

function setup(handlers: Record<string, Handler> = {}) {
  const calls: { kind: "query" | "mutation"; name: string; args: Record<string, unknown> }[] = []
  const call = (kind: "query" | "mutation") => vi.fn(async (reference: Reference, args: Record<string, unknown>) => {
    const name = getFunctionName(reference)
    calls.push({ kind, name, args })
    const handler = handlers[name]
      ?? (name === "modules/people/persons:getMyPerson" ? () => PERSON : name === "modules/networks/networks:getBySlug" ? () => DIASPORA_GA : undefined)
    if (!handler) throw new Error(`Unexpected ${kind}: ${name}`)
    return handler(args)
  })
  const convex = { query: call("query"), mutation: call("mutation") } as unknown as ConvexReactClient
  const desk = createEngineModerationDesk({ convex, authClient: {} as EngineAuthClient })
  return { desk, calls, writes: () => calls.filter((entry) => entry.kind === "mutation") }
}

const lastArgs = (name: string) => [...mocks.read.mock.calls].reverse().find(([read]) => read === name)?.[1]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  respondWith()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Guichet — capacité", () => {
  it("lit la capacité pour la personne attendue et la rend stable d'un rendu à l'autre", () => {
    respondWith({ "modules/diaspora/moderationDesk:myDesk": DESK_ROW, "modules/pages/claims:myPageClaimReview": { canReview: true } })
    const { desk } = setup()
    const { result, rerender } = renderHook(() => desk.useDesk(PERSON._id))
    // AS-01 : les pages à vérifier suivent la règle d'instruction du moteur (`pages.claims.myPageClaimReview`).
    expect(result.current).toEqual({ status: "ready", data: { ...DESK_ROW, canReviewClaims: true } })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    expect(lastArgs("modules/diaspora/moderationDesk:myDesk")).toEqual({ networkId: DIASPORA_GA._id, expectedPersonId: PERSON._id })
    expect(lastArgs("modules/pages/claims:myPageClaimReview")).toEqual({ networkId: DIASPORA_GA._id })
    expect(desk.demonstration).toBe(false)
  })

  it("AS-01 : « Pages à vérifier » suit la règle du moteur ; sans elle (moteur plus ancien), la règle du rôle de réseau", () => {
    const TEAM_ROW = { ...DESK_ROW, role: "team_member", networkWide: false }
    // Membre de l'équipe compétente pour les pages, sans rôle de réseau : le moteur l'admet.
    respondWith({ "modules/diaspora/moderationDesk:myDesk": TEAM_ROW, "modules/pages/claims:myPageClaimReview": { canReview: true } })
    const { desk } = setup()
    const { result, rerender } = renderHook(() => desk.useDesk(PERSON._id))
    expect(result.current).toEqual({ status: "ready", data: { ...TEAM_ROW, canReviewClaims: true } })
    // Un rôle de réseau que le moteur ne compte plus parmi les instructeurs : l'onglet se ferme.
    respondWith({ "modules/diaspora/moderationDesk:myDesk": DESK_ROW, "modules/pages/claims:myPageClaimReview": { canReview: false } })
    rerender()
    expect(result.current).toEqual({ status: "ready", data: { ...DESK_ROW, canReviewClaims: false } })
    // La lecture refusée (fonction absente d'un moteur plus ancien) ne casse pas le guichet : règle du rôle de réseau.
    respondWith({ "modules/diaspora/moderationDesk:myDesk": TEAM_ROW, "modules/pages/claims:myPageClaimReview": engineError({ code: "notFound" }) })
    rerender()
    expect(result.current).toEqual({ status: "ready", data: { ...TEAM_ROW, canReviewClaims: false } })
  })

  it("rend null sans compétence, et le refus du moteur sans son détail", () => {
    respondWith({ "modules/diaspora/moderationDesk:myDesk": null, "modules/pages/claims:myPageClaimReview": { canReview: false } })
    const { desk } = setup()
    const { result, rerender } = renderHook(() => desk.useDesk(PERSON._id))
    expect(result.current).toEqual({ status: "ready", data: null })
    respondWith({ "modules/diaspora/moderationDesk:myDesk": engineError({ code: "notFound", detail: "PRIVATE_DETAIL" }), "modules/pages/claims:myPageClaimReview": { canReview: false } })
    rerender()
    expect(result.current).toEqual({ status: "error", code: "not_found" })
    expect(JSON.stringify(result.current)).not.toContain("PRIVATE_DETAIL")
  })

  it("ne lit rien sans session ni pour un membre suspendu", () => {
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    const { desk } = setup()
    expect(renderHook(() => desk.useDesk(PERSON._id)).result.current).toEqual({ status: "error", code: "not_signed_in" })
    mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
    respondWith({ "modules/diaspora/membership:myMembership": { status: "suspendue", capabilities: [] } })
    expect(renderHook(() => desk.useDesk(PERSON._id)).result.current).toEqual({ status: "error", code: "suspended" })
    expect(mocks.read).not.toHaveBeenCalledWith("modules/diaspora/moderationDesk:myDesk", expect.anything())
  })
})

describe("Guichet — file par pays", () => {
  const request: DeskQueueRequest = { personId: PERSON._id, zone: { kind: "country", country: "FR" }, surface: "post", teamId: "team-fr", cursor: null }

  it("transmet pays, nature, équipe et curseur, et projette sans rien inventer", () => {
    respondWith({ "modules/diaspora/moderationDesk:queue": { items: [CASE_ROW], continueCursor: "suite", isDone: false } })
    const { desk } = setup()
    const { result } = renderHook(() => desk.useQueue(request))
    expect(lastArgs("modules/diaspora/moderationDesk:queue")).toEqual({
      networkId: DIASPORA_GA._id,
      expectedPersonId: PERSON._id,
      zone: { kind: "country", country: "FR" },
      surface: "post",
      teamId: "team-fr",
      paginationOpts: { cursor: null, numItems: DESK_PAGE_SIZE },
    })
    expect(result.current).toEqual({
      status: "ready",
      data: { items: [{ ...CASE_ROW, country: "FR", ground: "harassment" }].map(({ reason: _reason, ...row }) => row), continueCursor: "suite", isDone: false },
    })
  })

  it("n'envoie ni nature ni équipe quand la file est entière, et ferme le curseur d'une fin de file", () => {
    respondWith({ "modules/diaspora/moderationDesk:queue": { items: [], continueCursor: "fin", isDone: true } })
    const { desk } = setup()
    const { result } = renderHook(() => desk.useQueue({ personId: PERSON._id, zone: { kind: "none" }, surface: null, teamId: null, cursor: "c1" }))
    expect(lastArgs("modules/diaspora/moderationDesk:queue")).toEqual({
      networkId: DIASPORA_GA._id, expectedPersonId: PERSON._id, zone: { kind: "none" }, paginationOpts: { cursor: "c1", numItems: DESK_PAGE_SIZE },
    })
    expect(result.current).toEqual({ status: "ready", data: { items: [], continueCursor: null, isDone: true } })
  })

  it("ne demande les dossiers mis en examen que sur demande explicite", () => {
    respondWith({ "modules/diaspora/moderationDesk:queue": { items: [{ ...CASE_ROW, status: "reviewing" }], continueCursor: null, isDone: true } })
    const { desk } = setup()
    const { result } = renderHook(() => desk.useQueue({ ...request, status: "reviewing" }))
    expect(lastArgs("modules/diaspora/moderationDesk:queue")).toMatchObject({ status: "reviewing" })
    expect(result.current).toMatchObject({ status: "ready", data: { items: [{ reportId: "report-1", status: "reviewing" }] } })
    renderHook(() => desk.useQueue({ ...request, status: "open" }))
    expect(lastArgs("modules/diaspora/moderationDesk:queue")).not.toHaveProperty("status")
  })

  it("dit un motif inconnu « non précisé » et un pays illisible « sans pays »", () => {
    expect(toCaseView({ ...CASE_ROW, reason: "motif_inedit", country: "XX" } as never)).toMatchObject({ ground: "unspecified", country: null })
    expect(toCaseView({ ...CASE_ROW, reason: "pre_review", country: null } as never)).toMatchObject({ ground: "pre_review", country: null })
    // Les motifs des signalements et ceux des avis ont chacun leur valeur fermée.
    for (const reason of [...CONTENT_REPORT_REASONS, ...SERVICE_REVIEW_REPORT_REASONS]) expect(DESK_GROUNDS).toContain(reason)
    expect(engineZone({ kind: "all" })).toEqual({ kind: "all" })
  })

  it("projette la relecture préalable et l'aperçu borné, médias retenus sans adresse", () => {
    expect(toPendingView({ target: { kind: "page", id: "page-1" }, surface: "page", country: "FR", teamName: null, updatedAt: 7, party: "page" } as never)).toEqual({
      key: "page:page-1", targetKind: "page", targetId: "page-1", country: "FR", teamName: null, updatedAt: 7, party: "page",
    })
    expect(toPreviewView({
      kind: "post", available: true, title: null, body: "Texte signalé",
      media: [{ url: "https://exemple.test/a", withheld: "fileQuarantined", kind: "image", mimeType: "image/jpeg" }],
    } as never)).toEqual({
      available: true, title: null, body: "Texte signalé",
      media: [{ kind: "image", url: null, withheld: "quarantined", altText: null, width: null, height: null }],
    })
  })

  it("MC-01 du moteur : un groupe et un message personnel se projettent tels quels, l'aperçu du message sans rien de plus", () => {
    expect(toCaseView({ ...CASE_ROW, surface: "thematicGroup", party: "group" } as never)).toMatchObject({ surface: "thematicGroup", party: "group" })
    expect(toCaseView({ ...CASE_ROW, surface: "personalMessage", country: null } as never)).toMatchObject({ surface: "personalMessage", country: null })
    // Seuls titre, texte et médias passent : ni nature de contexte, ni révision, ni empreinte.
    expect(toPreviewView({ kind: "personalMessage", available: true, title: null, body: "Message signalé", media: [], context: null, sourceRevision: 3, sourceDigest: "empreinte" } as never)).toEqual({
      available: true, title: null, body: "Message signalé", media: [],
    })
  })
})

describe("Guichet — délais légaux (SU01d du moteur)", () => {
  const DEADLINES = "modules/moderation/cases:deadlineQueue"
  const QUEUE = "modules/diaspora/moderationDesk:queue"
  const ordinary: DeskQueueRequest = { personId: PERSON._id, zone: { kind: "all" }, surface: null, teamId: "team-fr", status: "open", lane: "ordinary", cursor: null }

  it("lit la voie du moteur pour l'équipe choisie ou toute la file, et projette fondement, échéance et accusé", () => {
    const deepfake = { ...DEADLINE_ROW, reportId: "report-2", target: { kind: "comment", id: "comment-1" }, teamId: null, level: "network", reason: "deepfake_of_me", status: "reviewing", legalBasis: "art33", dueAt: NOW - 60_000, acknowledgedAt: null }
    respondWith({ [DEADLINES]: { items: [deepfake, DEADLINE_ROW], truncated: true } })
    const { desk } = setup()
    const { result, rerender } = renderHook(() => desk.useDeadlines({ personId: PERSON._id, teamId: "team-fr" }))
    expect(lastArgs(DEADLINES)).toEqual({ networkId: DIASPORA_GA._id, teamId: "team-fr" })
    expect(result.current).toEqual({
      status: "ready",
      data: {
        // L'ordre du moteur (l'échéance la plus proche d'abord) est gardé tel quel.
        items: [
          { reportId: "report-2", surface: "comment", ground: "deepfake_of_me", status: "reviewing", level: "network", teamId: null, createdAt: NOW - DAY, basis: "art33", dueAt: NOW - 60_000, acknowledgedAt: null },
          { reportId: "report-1", surface: "post", ground: "harassment", status: "open", level: "team", teamId: "team-fr", createdAt: NOW - DAY, basis: "art24", dueAt: NOW + 2 * DAY, acknowledgedAt: NOW - DAY },
        ],
        truncated: true,
      },
    })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    renderHook(() => desk.useDeadlines({ personId: PERSON._id, teamId: null }))
    expect(lastArgs(DEADLINES)).toEqual({ networkId: DIASPORA_GA._id })
  })

  it("n'invente aucun délai : une ligne sans fondement, sans échéance ou déjà tranchée n'entre pas dans la voie", () => {
    expect(toDeadlineView({ ...DEADLINE_ROW, legalBasis: null } as never)).toBeNull()
    expect(toDeadlineView({ ...DEADLINE_ROW, dueAt: null } as never)).toBeNull()
    expect(toDeadlineView({ ...DEADLINE_ROW, status: "actioned" } as never)).toBeNull()
    expect(toDeadlineView({ ...DEADLINE_ROW, reason: "motif_inedit" } as never)).toMatchObject({ ground: "unspecified", basis: "art24" })
  })

  it("ne lit rien sans session, et rend le refus du moteur sans son détail", () => {
    mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true }
    const { desk } = setup()
    expect(renderHook(() => desk.useDeadlines({ personId: PERSON._id, teamId: null })).result.current).toEqual({ status: "error", code: "not_signed_in" })
    expect(mocks.read).not.toHaveBeenCalledWith(DEADLINES, expect.anything())
    mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
    respondWith({ [DEADLINES]: engineError({ code: "notFound", detail: "PRIVATE_DETAIL" }) })
    const refused = renderHook(() => desk.useDeadlines({ personId: PERSON._id, teamId: "team-autre" })).result.current
    expect(refused).toEqual({ status: "error", code: "not_found" })
    expect(JSON.stringify(refused)).not.toContain("PRIVATE_DETAIL")
  })

  it("la file ordinaire écarte les dossiers de la voie, lue avec la même compétence ; la tranche ne reçoit aucun `lane`", () => {
    const spam = { ...CASE_ROW, reportId: "report-3", reason: "spam" }
    respondWith({ [QUEUE]: { items: [CASE_ROW, spam], continueCursor: "suite", isDone: false }, [DEADLINES]: { items: [DEADLINE_ROW], truncated: false } })
    const { desk } = setup()
    const { result, rerender } = renderHook(() => desk.useQueue(ordinary))
    expect(result.current).toEqual({ status: "ready", data: { items: [toCaseView(spam as never)], continueCursor: "suite", isDone: false } })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    expect(lastArgs(DEADLINES)).toEqual({ networkId: DIASPORA_GA._id, teamId: "team-fr" })
    expect(lastArgs(QUEUE)).not.toHaveProperty("lane")

    // Sans `lane`, la file entière, et la voie n'est pas lue.
    mocks.read.mockClear()
    const whole = renderHook(() => desk.useQueue({ ...ordinary, lane: undefined })).result.current
    expect(whole).toMatchObject({ status: "ready", data: { items: [{ reportId: "report-1" }, { reportId: "report-3" }] } })
    expect(mocks.read).not.toHaveBeenCalledWith(DEADLINES, expect.anything())
  })

  it("la file ordinaire attend la voie, et une voie illisible ne cache aucun dossier", () => {
    respondWith({ [QUEUE]: { items: [CASE_ROW], continueCursor: null, isDone: true }, [DEADLINES]: undefined })
    const { desk } = setup()
    expect(renderHook(() => desk.useQueue(ordinary)).result.current).toEqual({ status: "loading" })
    respondWith({ [QUEUE]: { items: [CASE_ROW], continueCursor: null, isDone: true }, [DEADLINES]: engineError({ code: "rateLimited", retryAfterMs: 1000 }) })
    expect(renderHook(() => desk.useQueue(ordinary)).result.current).toMatchObject({ status: "ready", data: { items: [{ reportId: "report-1" }] } })
  })
})

describe("Guichet — décisions par les mutations du moteur", () => {
  const base = { personId: PERSON._id, reportId: "report-1", reason: "Propos insultants répétés envers un membre.", removal: true, personMeasure: "none" as const, durationDays: null }

  it("refuse un motif trop court et une mesure absente avant tout appel", async () => {
    const { desk, calls } = setup()
    expect(await desk.decide({ ...base, decision: "actioned", reason: "Court" })).toEqual({ ok: false, code: "moderation_desk_reason_length" })
    expect(await desk.decide({ ...base, decision: "actioned", removal: false })).toEqual({ ok: false, code: "moderation_desk_measure_required" })
    expect(await desk.decide({ ...base, decision: "actioned", personMeasure: "suspension" })).toEqual({ ok: false, code: "moderation_desk_duration_required" })
    expect(calls).toEqual([])
  })

  it("relit la personne puis envoie le motif et les mesures datées au moteur", async () => {
    const { desk, calls } = setup({ "modules/moderation/cases:decide": () => ({ status: "actioned" }) })
    const result = await desk.decide({ ...base, decision: "actioned", personMeasure: "suspension", durationDays: 7, reason: "  Propos insultants répétés envers un membre.  " })
    expect(result).toEqual({ ok: true, value: { status: "actioned" } })
    expect(calls.map(({ kind, name, args }) => [kind, name, args])).toEqual([
      ["query", "modules/people/persons:getMyPerson", {}],
      ["query", "modules/networks/networks:getBySlug", { slug: "diaspora-ga" }],
      ["mutation", "modules/moderation/cases:decide", {
        networkId: DIASPORA_GA._id,
        reportId: "report-1",
        decision: "actioned",
        reason: "Propos insultants répétés envers un membre.",
        sanctions: [{ kind: "removal" }, { kind: "suspension", until: NOW + 7 * DAY }],
      }],
    ])
  })

  it("classe sans mesure, même si des mesures étaient cochées", async () => {
    const { desk, writes } = setup({ "modules/moderation/cases:decide": () => ({ status: "dismissed" }) })
    expect(await desk.decide({ ...base, decision: "dismissed", personMeasure: "warning" })).toEqual({ ok: true, value: { status: "dismissed" } })
    expect(writes()[0]?.args).toMatchObject({ decision: "dismissed", sanctions: [] })
  })

  it("n'écrit rien pour une autre personne de session", async () => {
    const { desk, writes } = setup({ "modules/people/persons:getMyPerson": () => ({ _id: "autre-personne" }) })
    expect(await desk.decide({ ...base, decision: "dismissed" })).toEqual({ ok: false, code: "not_found" })
    expect(await desk.reviewPending({ personId: PERSON._id, targetKind: "page", targetId: "page-1", approve: true, reason: "Réexamen complet du dossier." })).toEqual({ ok: false, code: "not_found" })
    expect(writes()).toEqual([])
  })

  it("traduit les refus du moteur en codes fermés", async () => {
    const conflict = setup({ "modules/moderation/cases:decide": () => { throw engineError({ code: "conflict" }) } })
    expect(await conflict.desk.decide({ ...base, decision: "dismissed" })).toEqual({ ok: false, code: "moderation_desk_conflict" })
    const party = setup({ "modules/moderation/cases:decide": () => { throw engineError({ code: "notFound" }) } })
    expect(await party.desk.decide({ ...base, decision: "dismissed" })).toEqual({ ok: false, code: "not_found" })
    expect(moderationDeskErrorCode(engineError({ code: "invalidArgument", rule: "DECISION_REASON_LENGTH", params: { min: 3, max: 500 } }))).toBe("moderation_desk_reason_length")
    expect(moderationDeskErrorCode(engineError({ code: "invalidArgument", field: "sanctions" }))).toBe("moderation_desk_measure_refused")
    expect(moderationDeskErrorCode(engineError({ code: "invalidArgument", field: "until" }))).toBe("moderation_desk_measure_refused")
    expect(moderationDeskErrorCode(engineError({ code: "policyRefused" }))).toBe("moderation_desk_limit")
    expect(moderationDeskErrorCode(engineError({ code: "rateLimited", retryAfterMs: 1000 }))).toBe("rate_limited")
  })

  it("tranche la relecture préalable par sa porte existante", async () => {
    const { desk, writes } = setup({ "modules/moderation/cases:reviewContent": () => null })
    expect(await desk.reviewPending({ personId: PERSON._id, targetKind: "page", targetId: "page-1", approve: false, reason: "Page usurpant une association existante." })).toEqual({ ok: true, value: null })
    expect(writes().map(({ name, args }) => [name, args])).toEqual([
      ["modules/moderation/cases:reviewContent", { networkId: DIASPORA_GA._id, target: { kind: "page", id: "page-1" }, approve: false, reason: "Page usurpant une association existante." }],
    ])
  })

  it("CH-815 A6 : le guichet ne sert plus aucune décision du réseau (recours, équipes, responsables, réglages)", () => {
    const { desk } = setup()
    for (const moved of ["useAppeals", "decideAppeal", "useRoster", "findMember", "createTeam", "setTeamMember", "useResponsibles", "setResponsibleRole", "useSettings", "useBlockedTerms", "setPolicy", "setBlockedTerm"]) {
      expect(desk, moved).not.toHaveProperty(moved)
    }
    expect(Object.keys(desk).sort()).toEqual(["decide", "decideClaim", "demonstration", "reviewPending", "useCase", "useCasePreview", "useClaim", "useClaims", "useDeadlines", "useDesk", "usePending", "usePendingPreview", "useQueue"])
  })
})

describe("Guichet — pages à vérifier (AS-01)", () => {
  const QUEUE = "modules/diaspora/moderationDesk:pageClaimQueue"
  const CLAIM = "modules/pages/claims:getPageClaim"
  const DECIDE = "modules/pages/claims:decidePageClaim"
  const PAGE_CARD = { pageId: "page-1", networkId: DIASPORA_GA._id, handle: "amicale-lyon", name: "Amicale de Lyon", shortName: null, logoUrl: null, badge: "community", ownerKind: "association", country: "FR" }
  const CLAIM_ROW = { claimId: "claim-1", page: PAGE_CARD, country: "FR", evidenceCount: 2, createdAt: NOW - DAY, party: null }
  const DETAIL_ROW = {
    claimId: "claim-1",
    page: PAGE_CARD,
    claimant: { personId: "person-awa", handle: "awa.fixture", displayName: "Awa", avatarUrl: "https://image.exemple.test/avatar" },
    status: "pending",
    note: "Mandat déclaré : présidence.",
    evidenceCount: 2,
    decisionReason: null,
    createdAt: NOW - DAY,
    decidedAt: null,
    evidence: [{ url: "https://depot.exemple.test/1", withheld: null }, { url: "https://depot.exemple.test/2", withheld: "fileScanPending" }],
  }

  it("lit la file de la tranche par pays de la page, pour la personne attendue, et projette sans rien inventer", () => {
    respondWith({ [QUEUE]: { items: [CLAIM_ROW, { ...CLAIM_ROW, claimId: "claim-2", country: "XX", party: "page" }], continueCursor: "suite", isDone: false } })
    const { desk } = setup()
    const { result } = renderHook(() => desk.useClaims({ personId: PERSON._id, zone: { kind: "country", country: "FR" }, cursor: null }))
    expect(lastArgs(QUEUE)).toEqual({ networkId: DIASPORA_GA._id, expectedPersonId: PERSON._id, zone: { kind: "country", country: "FR" }, paginationOpts: { cursor: null, numItems: DESK_PAGE_SIZE } })
    expect(result.current).toEqual({
      status: "ready",
      data: {
        items: [
          { claimId: "claim-1", page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" }, country: "FR", evidenceCount: 2, createdAt: NOW - DAY, party: null },
          { claimId: "claim-2", page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" }, country: null, evidenceCount: 2, createdAt: NOW - DAY, party: "page" },
        ],
        continueCursor: "suite",
        isDone: false,
      },
    })
    // Hors rôle de réseau : le refus indistinct de la tranche, sans ligne.
    respondWith({ [QUEUE]: engineError({ code: "notFound" }) })
    expect(renderHook(() => desk.useClaims({ personId: PERSON._id, zone: { kind: "all" }, cursor: null })).result.current).toEqual({ status: "error", code: "not_found" })
  })

  it("lit la fiche de `pages/claims` : pièce retenue sans adresse, ni avatar ; `canDecide` lu s'il est servi, jamais exigé", () => {
    respondWith({ [CLAIM]: DETAIL_ROW })
    const { desk } = setup()
    const { result } = renderHook(() => desk.useClaim({ personId: PERSON._id, claimId: "claim-1" }))
    expect(lastArgs(CLAIM)).toEqual({ networkId: DIASPORA_GA._id, claimId: "claim-1" })
    expect(result.current).toEqual({
      status: "ready",
      data: {
        claimId: "claim-1",
        claimant: { personId: "person-awa", handle: "awa.fixture", displayName: "Awa" },
        note: "Mandat déclaré : présidence.",
        evidence: [{ url: "https://depot.exemple.test/1", withheld: null }, { url: null, withheld: "fileScanPending" }],
        canDecide: null,
      },
    })
    expect(JSON.stringify(result.current)).not.toContain("avatar")
    expect(toClaimDetailView({ ...DETAIL_ROW, canDecide: false } as never).canDecide).toBe(false)
    expect(claimCanDecide({ canDecide: true })).toBe(true)
    expect(claimCanDecide({ canDecide: "oui" })).toBeNull()
    expect(claimCanDecide({})).toBeNull()
  })

  it("tranche par `decidePageClaim` : motif jugé avant tout appel, personne relue, refus indistinct du décideur en conflit", async () => {
    const { desk, calls, writes } = setup({ [DECIDE]: (args) => ({ status: args.decision }) })
    expect(await desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "ok" })).toEqual({ ok: false, code: "moderation_desk_reason_length" })
    expect(calls).toEqual([])
    expect(await desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "  Statuts et procès-verbal conformes.  " })).toEqual({ ok: true, value: { status: "approved" } })
    expect(writes().map(({ name, args }) => [name, args])).toEqual([
      [DECIDE, { networkId: DIASPORA_GA._id, claimId: "claim-1", decision: "approved", reason: "Statuts et procès-verbal conformes." }],
    ])
    // Le demandeur ou un signataire de la page (PG-01 du moteur) : le refus indistinct.
    const party = setup({ [DECIDE]: () => { throw engineError({ code: "notFound" }) } })
    expect(await party.desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "Statuts et procès-verbal conformes." })).toEqual({ ok: false, code: "not_found" })
    const closed = setup({ [DECIDE]: () => { throw engineError({ code: "conflict" }) } })
    expect(await closed.desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "rejected", reason: "Pièces illisibles, mandat absent." })).toEqual({ ok: false, code: "moderation_desk_conflict" })
    const official = setup({ [DECIDE]: () => { throw engineError({ code: "invalidArgument", rule: "PAGE_NOT_CLAIMABLE", params: {} }) } })
    expect(await official.desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "Statuts et procès-verbal conformes." })).toEqual({ ok: false, code: "page_not_claimable" })
    // AS-11a : une page en sommeil — la revendication reste en attente, elle se refuse seulement ; jamais « déjà tranchée ».
    const asleep = setup({ [DECIDE]: () => { throw engineError({ code: "invalidArgument", rule: "PAGE_ASLEEP", params: {} }) } })
    expect(await asleep.desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "Statuts et procès-verbal conformes." })).toEqual({ ok: false, code: "moderation_desk_page_asleep" })
    expect(moderationDeskErrorCode(engineError({ code: "conflict", rule: "PAGE_ASLEEP", params: {} }))).toBe("moderation_desk_page_asleep")
    const other = setup({ "modules/people/persons:getMyPerson": () => ({ _id: "autre-personne" }), [DECIDE]: () => ({ status: "approved" }) })
    expect(await other.desk.decideClaim({ personId: PERSON._id, claimId: "claim-1", decision: "approved", reason: "Décision par une autre session." })).toEqual({ ok: false, code: "not_found" })
    expect(other.writes()).toEqual([])
  })
})
