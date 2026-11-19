// @vitest-environment jsdom
import type { EngineAuthClient } from "@antsia/api/auth-client"
import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import { isPreparedImage, type PrepareImage } from "@antsia/social-features/media-upload"
import { TEST_JPEG_WITH_GPS_BYTES, testPrepareImage } from "@antsia/social-features/tests/image-runtime"
import type { PageManagement } from "@diasporale/features/data"
import { cleanup, renderHook } from "@testing-library/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEnginePageAdmin, pageAdminErrorCode } from "./engine-page-admin"

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isPending: false, isUnauthenticated: false },
  results: {} as Record<string, unknown>,
  loaded: vi.fn(),
}))

vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth }))
vi.mock("convex/react", () => ({
  useQueries: (queries: Record<string, { query: Parameters<typeof getFunctionName>[0]; args?: unknown }>) => {
    if (!queries.value) return {}
    const name = getFunctionName(queries.value.query)
    mocks.loaded(name, queries.value.args)
    if (!(name in mocks.results)) throw new Error(`Lecture inattendue : ${name}`)
    return { value: mocks.results[name] }
  },
}))

const NETWORK = { _id: "network-diasporale" }
const MEMBER = { status: "declaree", role: "member", capabilities: ["read_network", "publish"] }
const CARD = {
  pageId: "page-1",
  networkId: "network-diasporale",
  handle: "amicale-lyon",
  name: "Amicale de Lyon",
  shortName: null,
  logoUrl: null,
  badge: "community",
  ownerKind: "association",
  country: "FR",
}
const CLAIM = {
  claimId: "claim-1",
  page: CARD,
  claimant: { personId: "person-me", handle: "awa.demo", displayName: "Awa", avatarUrl: "https://images.exemple.test/a.png" },
  status: "pending",
  note: "Mandat déclaré : présidence.",
  evidenceCount: 2,
  decisionReason: null,
  createdAt: 10,
  decidedAt: null,
}

function results(extra: Record<string, unknown> = {}) {
  mocks.results = {
    "modules/networks/networks:getBySlug": NETWORK,
    "modules/diaspora/membership:myMembership": MEMBER,
    "modules/people/persons:getMyPerson": { _id: "person-me" },
    ...extra,
  }
}

function source(options: { mutation?: (name: string, args: unknown) => unknown; fetch?: typeof fetch; prepareImage?: PrepareImage } = {}) {
  const calls: { name: string; args: unknown }[] = []
  const mutation = vi.fn(async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference)
    calls.push({ name, args })
    return options.mutation ? options.mutation(name, args) : null
  })
  const query = vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(reference) === "modules/networks/networks:getBySlug") return NETWORK
    throw new Error("Lecture ponctuelle inattendue")
  })
  const capability = createEnginePageAdmin(
    // La préparation RÉELLE du moteur, sur un décodeur et un canvas simulés (`jsdom` n'en a pas).
    { convex: { mutation, query } as unknown as ConvexReactClient, authClient: {} as EngineAuthClient, prepareImage: options.prepareImage ?? testPrepareImage() },
    options.fetch ? { fetch: options.fetch } : {},
  )
  return { capability, management: capability.management as PageManagement, calls, mutation }
}

function pdf(name = "statuts.pdf", type = "application/pdf", size = 2048) {
  return new File([new Uint8Array(size)], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: true, isPending: false, isUnauthenticated: false }
  results()
})
afterEach(cleanup)

describe("gestion des pages — lectures du moteur", () => {
  it("projette mes pages (rôle vivant), bornées au réseau diasporale, badge et pays relus", () => {
    results({ "modules/pages/pages:myPages": [{ ...CARD, role: "admin" }, { ...CARD, pageId: "page-2", badge: "public_agent", country: "XX", role: "signatory" }] })
    const { capability } = source()
    const { result } = renderHook(() => capability.useMyPages())
    expect(mocks.loaded).toHaveBeenCalledWith("modules/pages/pages:myPages", { networkId: "network-diasporale" })
    expect(result.current).toEqual({
      status: "ready",
      data: [
        { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", role: "admin" },
        // Un badge de personne n'a pas de sens pour une page ; un pays inconnu n'est pas inventé.
        { id: "page-2", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: null, role: "signatory" },
      ],
    })
  })

  it("garde la même projection tant que le moteur ne répond rien de neuf", () => {
    results({ "modules/pages/pages:myPages": [{ ...CARD, role: "admin" }] })
    const { capability } = source()
    const { result, rerender } = renderHook(() => capability.useMyPages())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it.each([
    { name: "sans session", setup: () => { mocks.auth = { isAuthenticated: false, isPending: false, isUnauthenticated: true } }, code: "not_signed_in" },
    { name: "sans adhésion", setup: () => results({ "modules/diaspora/membership:myMembership": null }), code: "not_member" },
    { name: "suspendu", setup: () => results({ "modules/diaspora/membership:myMembership": { ...MEMBER, status: "suspendue", capabilities: [] } }), code: "suspended" },
  ])("refuse $name sans interroger les pages", ({ setup, code }) => {
    setup()
    const { capability } = source()
    const { result } = renderHook(() => capability.useMyPages())
    expect(result.current).toEqual({ status: "error", code })
    expect(mocks.loaded).not.toHaveBeenCalledWith("modules/pages/pages:myPages", expect.anything())
  })

  it("lit la page gérée et MON rôle vivant ; une page illisible rend le même null", () => {
    results({ "modules/pages/pages:getPage": { ...CARD, description: "Accueil", bannerUrl: null, visibility: "network", followerCount: 3, postCount: 1, createdAt: 1, viewer: { following: false, role: "admin", teamRole: "admin" } } })
    const { management } = source()
    const { result } = renderHook(() => management.useManagedPage("amicale-lyon"))
    expect(mocks.loaded).toHaveBeenCalledWith("modules/pages/pages:getPage", { networkId: "network-diasporale", handle: "amicale-lyon" })
    expect(result.current).toEqual({
      status: "ready",
      // Présentation facultative (ville, type, secteur) : absente du moteur, elle se lit `null`, jamais inventée.
      data: {
        id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", shortName: null, description: "Accueil",
        city: null, associationType: null, sector: null, logoUrl: null, bannerUrl: null, myRole: "admin", myTeamRole: "admin",
      },
    })
    results({ "modules/pages/pages:getPage": null })
    expect(renderHook(() => management.useManagedPage("inconnue")).result.current).toEqual({ status: "ready", data: null })
  })

  it("AS-10 : un modérateur lit sa page sans y parler (`viewer.role` nul, `viewer.teamRole` modérateur)", () => {
    results({ "modules/pages/pages:getPage": { ...CARD, description: null, bannerUrl: null, visibility: "network", followerCount: 3, postCount: 1, createdAt: 1, viewer: { following: false, role: null, teamRole: "moderator" } } })
    const { management } = source()
    expect(renderHook(() => management.useManagedPage("amicale-lyon")).result.current).toMatchObject({ status: "ready", data: { myRole: null, myTeamRole: "moderator" } })
  })

  it("AS-10 : mes pages d'équipe, modérateur compris, bornées au réseau ; « mes pages » n'en change pas", () => {
    results({
      "modules/pages/pages:myTeamPages": [
        { ...CARD, viewer: { role: "admin", teamRole: "admin" } },
        { ...CARD, pageId: "page-2", handle: "saveurs", name: "Saveurs", ownerKind: "company", viewer: { role: null, teamRole: "moderator" } },
      ],
    })
    const { capability } = source()
    const { result } = renderHook(() => capability.useMyTeamPages!())
    expect(mocks.loaded).toHaveBeenCalledWith("modules/pages/pages:myTeamPages", { networkId: "network-diasporale" })
    expect(result.current).toEqual({
      status: "ready",
      data: [
        { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", teamRole: "admin" },
        { id: "page-2", handle: "saveurs", name: "Saveurs", ownerKind: "company", badge: "community", country: "FR", teamRole: "moderator" },
      ],
    })
    expect(mocks.loaded).not.toHaveBeenCalledWith("modules/pages/pages:myPages", expect.anything())
  })

  it("AS-10 : l'équipe porte les trois rôles, modérateurs compris, dans l'ordre du moteur", () => {
    results({
      "modules/pages/signatories:listPageSignatories": [
        { personId: "person-2", handle: "steeve.demo", displayName: "Steeve", avatarUrl: null, role: "admin", accepted: true, since: 1 },
        { personId: "person-3", handle: "nadia.demo", displayName: "Nadia", avatarUrl: null, role: "signatory", accepted: true, since: 2 },
        { personId: "person-me", handle: "awa.demo", displayName: "Awa", avatarUrl: null, role: "moderator", accepted: true, since: 3 },
      ],
    })
    const { management } = source()
    const { result } = renderHook(() => management.useSignatories("page-1"))
    expect(result.current.status === "ready" ? result.current.data.map((row) => [row.role, row.isMe]) : result.current).toEqual([["admin", false], ["signatory", false], ["moderator", true]])
  })

  it("ferme l'équipe dès que le rôle est retiré (refus réactif `pageRoleRequired`)", () => {
    results({
      "modules/pages/signatories:listPageSignatories": [
        { personId: "person-me", handle: "awa.demo", displayName: "Awa", avatarUrl: null, role: "admin", accepted: true, since: 5 },
        { personId: "person-2", handle: null, displayName: null, avatarUrl: null, role: "signatory", accepted: false, since: 6 },
      ],
    })
    const { management } = source()
    const { result, rerender } = renderHook(() => management.useSignatories("page-1"))
    expect(result.current).toEqual({
      status: "ready",
      data: [
        { personId: "person-me", handle: "awa.demo", displayName: "Awa", role: "admin", accepted: true, since: 5, isMe: true },
        { personId: "person-2", handle: null, displayName: null, role: "signatory", accepted: false, since: 6, isMe: false },
      ],
    })
    mocks.results["modules/pages/signatories:listPageSignatories"] = new ConvexError({ code: "pageRoleRequired" })
    rerender()
    expect(result.current).toEqual({ status: "error", code: "page_role_required" })
  })

  it("lit mes revendications (première page du moteur) sans exposer l'avatar ni d'identifiant de stockage", () => {
    results({ "modules/pages/claims:paginateMyPageClaims": { page: [CLAIM], isDone: true, continueCursor: "fin" } })
    const { management } = source()
    const { result } = renderHook(() => management.useMyClaims())
    expect(mocks.loaded).toHaveBeenCalledWith("modules/pages/claims:paginateMyPageClaims", { networkId: "network-diasporale", paginationOpts: { numItems: 50, cursor: null } })
    expect(result.current).toEqual({
      status: "ready",
      data: [{
        id: "claim-1",
        page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" },
        claimant: { personId: "person-me", handle: "awa.demo", displayName: "Awa" },
        status: "pending",
        note: "Mandat déclaré : présidence.",
        evidenceCount: 2,
        decisionReason: null,
        createdAt: 10,
        decidedAt: null,
      }],
    })
  })

  // AS-01 : la file d'instruction, la fiche et les pièces sont au bureau de modération (`engine-moderation-desk.test.tsx`).
})

describe("gestion des pages — écritures du moteur", () => {
  it("crée une page dans DIASPORALE avec les seuls champs saisis", async () => {
    const { management, calls } = source({ mutation: () => ({ pageId: "page-neuve", handle: "collectif-lille" }) })
    const result = await management.createPage({ ownerKind: "association", name: "Collectif de Lille", shortName: " CDL ", description: "", country: "FR" })
    expect(result).toEqual({ ok: true, value: { pageId: "page-neuve", handle: "collectif-lille" } })
    expect(calls).toEqual([{ name: "modules/pages/pages:createPage", args: { networkId: "network-diasporale", name: "Collectif de Lille", ownerKind: "association", shortName: "CDL", country: "FR" } }])
  })

  it.each([
    { name: "statut insuffisant", error: new ConvexError({ code: "statusInsufficient" }), code: "page_verified_required" },
    { name: "adresse prise", error: new ConvexError({ code: "handleUnavailable" }), code: "page_handle_taken" },
    { name: "règle d'adresse", error: new ConvexError({ code: "invalidArgument", rule: "PAGE_HANDLE_LENGTH", params: { min: 3, max: 60 } }), code: "page_handle_length" },
    { name: "pays refusé", error: new ConvexError({ code: "invalidArgument", rule: "POST_COUNTRY_INVALID" }), code: "page_country_invalid" },
    { name: "débit", error: new ConvexError({ code: "rateLimited", retryAfterMs: 1000 }), code: "rate_limited" },
    { name: "panne inconnue", error: new Error("trace interne"), code: "unknown" },
  ])("traduit le refus « $name » de la création", async ({ error, code }) => {
    const { management } = source({ mutation: () => { throw error } })
    expect(await management.createPage({ ownerKind: "company", name: "Saveurs", country: "FR" })).toEqual({ ok: false, code })
  })

  it("refuse avant le moteur une nature réservée ou un nom vide", async () => {
    const { management, mutation } = source()
    expect(await management.createPage({ ownerKind: "institution" as never, name: "Ministère", country: "FR" })).toEqual({ ok: false, code: "page_kind_reserved" })
    // AS-05 : le moteur accepterait un média ou une communauté ; DIASPORALE ne les inscrit pas.
    expect(await management.createPage({ ownerKind: "media", name: "Radio Diaspora", country: "FR" })).toEqual({ ok: false, code: "page_kind_reserved" })
    expect(await management.createPage({ ownerKind: "community", name: "Cercle de Nantes", country: "FR" })).toEqual({ ok: false, code: "page_kind_reserved" })
    expect(await management.createPage({ ownerKind: "association", name: "   ", country: "FR" })).toEqual({ ok: false, code: "page_name_invalid" })
    expect(mutation).not.toHaveBeenCalled()
  })

  it("dépose chaque pièce NEUVE par la garde des fichiers, puis la demande les admet", async () => {
    let upload = 0
    const deposit = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ storageId: `stockage-${++upload}` }), { status: 200 }))
    const { management, calls } = source({
      fetch: deposit,
      mutation: (name) => (name === "modules/pages/claims:generateClaimEvidenceUploadUrl" ? `https://depot.exemple.test/${upload + 1}` : { claimId: "claim-neuve" }),
    })
    const statutes = pdf("statuts.pdf")
    const receipt = pdf("recepisse.png", "image/png")
    const result = await management.requestClaim({ pageId: "page-1", note: " Mandat déclaré : présidence. ", evidence: [statutes, receipt] })
    expect(result).toEqual({ ok: true, value: { claimId: "claim-neuve" } })
    // Le document part tel quel ; la photo part PRÉPARÉE (FD-01), jamais l'original.
    const preparedReceipt = deposit.mock.calls[1]?.[1]?.body
    expect(preparedReceipt).not.toBe(receipt)
    expect(isPreparedImage(preparedReceipt as File)).toBe(true)
    expect(deposit.mock.calls.map(([url, init]) => [url, init?.body, (init?.headers as Record<string, string>)["Content-Type"]])).toEqual([
      ["https://depot.exemple.test/1", statutes, "application/pdf"],
      ["https://depot.exemple.test/2", preparedReceipt, "image/png"],
    ])
    expect(calls).toEqual([
      { name: "modules/pages/claims:generateClaimEvidenceUploadUrl", args: { networkId: "network-diasporale" } },
      { name: "modules/pages/claims:generateClaimEvidenceUploadUrl", args: { networkId: "network-diasporale" } },
      {
        name: "modules/pages/claims:requestPageClaim",
        args: {
          networkId: "network-diasporale",
          pageId: "page-1",
          note: "Mandat déclaré : présidence.",
          evidence: [{ storageId: "stockage-1", mimeType: "application/pdf" }, { storageId: "stockage-2", mimeType: "image/png" }],
        },
      },
    ])
  })

  it("une pièce refusée ne quitte pas le navigateur", async () => {
    const deposit = vi.fn<typeof fetch>()
    const { management, mutation } = source({ fetch: deposit })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [pdf("photo.gif", "image/gif")] })).toEqual({ ok: false, code: "page_claim_evidence_type" })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [] })).toEqual({ ok: false, code: "page_claim_evidence_count" })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [pdf("lourd.pdf", "application/pdf", 11 * 1024 * 1024)] })).toEqual({ ok: false, code: "page_claim_evidence_too_large" })
    expect(mutation).not.toHaveBeenCalled()
    expect(deposit).not.toHaveBeenCalled()
  })

  it("FD-01 : une photo de pièce portant sa position GPS part sans métadonnées ; une préparation impossible arrête tout avant le premier dépôt", async () => {
    let upload = 0
    const deposit = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ storageId: `stockage-${++upload}` }), { status: 200 }))
    const leaky = testPrepareImage({ output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
    const { management } = source({
      fetch: deposit,
      prepareImage: leaky,
      mutation: (name) => (name === "modules/pages/claims:generateClaimEvidenceUploadUrl" ? `https://depot.exemple.test/${upload + 1}` : { claimId: "claim-neuve" }),
    })
    const photo = new File([TEST_JPEG_WITH_GPS_BYTES as Uint8Array<ArrayBuffer>], "recepisse.jpg", { type: "image/jpeg" })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [photo] })).toEqual({ ok: true, value: { claimId: "claim-neuve" } })
    const sent = new Uint8Array(await (deposit.mock.calls[0]?.[1]?.body as File).arrayBuffer())
    expect(jpegHasGpsMetadata(sent)).toBe(false)
    expect(listImageMetadata(sent, "image/jpeg")).toEqual([])

    const refused = vi.fn<typeof fetch>()
    const blocked = source({ fetch: refused, prepareImage: testPrepareImage({ canvas: "absent" }) })
    expect(await blocked.management.requestClaim({ pageId: "page-1", evidence: [pdf(), photo] })).toEqual({ ok: false, code: "media_preparation_unavailable" })
    expect(await blocked.management.setImage!("page-1", "logo", photo)).toEqual({ ok: false, code: "media_preparation_unavailable" })
    expect(blocked.mutation).not.toHaveBeenCalled()
    expect(refused).not.toHaveBeenCalled()
  })

  it("un dépôt en échec n'ouvre aucune demande", async () => {
    const deposit = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }))
    const { management, calls } = source({ fetch: deposit, mutation: () => "https://depot.exemple.test/1" })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [pdf()] })).toEqual({ ok: false, code: "media_upload_failed" })
    expect(calls.map((call) => call.name)).toEqual(["modules/pages/claims:generateClaimEvidenceUploadUrl"])
  })

  it.each([
    { rule: "PAGE_CLAIM_PENDING", code: "page_claim_pending" },
    { rule: "PAGE_ALREADY_CLAIMED", code: "page_already_claimed" },
    { rule: "UPLOAD_TYPE_NOT_ALLOWED", code: "page_claim_evidence_type" },
    { rule: "UPLOAD_SIZE_OUT_OF_RANGE", code: "page_claim_evidence_too_large" },
  ])("traduit la règle $rule de la revendication", async ({ rule, code }) => {
    const deposit = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ storageId: "stockage-1" })))
    const { management } = source({
      fetch: deposit,
      mutation: (name) => {
        if (name === "modules/pages/claims:generateClaimEvidenceUploadUrl") return "https://depot.exemple.test/1"
        throw new ConvexError({ code: "invalidArgument", rule })
      },
    })
    expect(await management.requestClaim({ pageId: "page-1", evidence: [pdf()] })).toEqual({ ok: false, code })
  })

  it("habilite par identifiant replié et traduit les refus de l'équipe", async () => {
    const { management, calls } = source({ mutation: () => ({ personId: "person-2", role: "signatory", invited: true }) })
    expect(await management.grantRole("page-1", " @Awa.Demo ", "signatory")).toEqual({ ok: true, value: { personId: "person-2", role: "signatory", invited: true } })
    expect(calls).toEqual([{ name: "modules/pages/signatories:grantPageRole", args: { networkId: "network-diasporale", pageId: "page-1", handle: "awa.demo", role: "signatory" } }])
    for (const [error, code] of [
      [new ConvexError({ code: "notFound" }), "page_member_not_found"],
      [new ConvexError({ code: "invalidArgument", field: "handle" }), "page_signatory_self"],
      [new ConvexError({ code: "invalidArgument", rule: "PAGE_LAST_ADMIN" }), "page_last_admin"],
      [new ConvexError({ code: "pageRoleRequired" }), "page_role_required"],
    ] as const) {
      const failing = source({ mutation: () => { throw error } })
      expect(await failing.management.grantRole("page-1", "awa.demo", "admin")).toEqual({ ok: false, code })
    }
  })

  it("AS-10 : nomme un modérateur ou un administrateur ; une promotion d'un membre accepté rend `invited: false`", async () => {
    const moderator = source({ mutation: () => ({ personId: "person-2", role: "moderator", invited: true }) })
    expect(await moderator.management.grantRole("page-1", "steeve.demo", "moderator")).toEqual({ ok: true, value: { personId: "person-2", role: "moderator", invited: true } })
    expect(moderator.calls).toEqual([{ name: "modules/pages/signatories:grantPageRole", args: { networkId: "network-diasporale", pageId: "page-1", handle: "steeve.demo", role: "moderator" } }])
    const promoted = source({ mutation: () => ({ personId: "person-2", role: "admin", invited: false }) })
    expect(await promoted.management.grantRole("page-1", "steeve.demo", "admin")).toEqual({ ok: true, value: { personId: "person-2", role: "admin", invited: false } })
    // Le dernier administrateur ne se rétrograde pas en modérateur : le refus du domaine se dit.
    const last = source({ mutation: () => { throw new ConvexError({ code: "invalidArgument", rule: "PAGE_LAST_ADMIN" }) } })
    expect(await last.management.grantRole("page-1", "steeve.demo", "moderator")).toEqual({ ok: false, code: "page_last_admin" })
  })

  it("AS-10 : une invitation de modérateur se lit et s'accepte", async () => {
    results({ "modules/pages/signatories:myPageInvitations": [{ page: CARD, role: "moderator", invitedAt: 7 }] })
    const { management } = source()
    expect(renderHook(() => management.useMyInvitations()).result.current).toEqual({
      status: "ready",
      data: [{ page: { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR" }, role: "moderator", invitedAt: 7 }],
    })
    const accepted = source({ mutation: () => ({ role: "moderator" }) })
    expect(await accepted.management.respondToInvitation("page-1", true)).toEqual({ ok: true, value: { role: "moderator" } })
  })

  it("le dernier administrateur ne part pas ; un rôle perdu ne retire plus personne", async () => {
    const last = source({ mutation: () => { throw new ConvexError({ code: "invalidArgument", rule: "PAGE_LAST_ADMIN" }) } })
    expect(await last.management.revokeRole("page-1", "person-me")).toEqual({ ok: false, code: "page_last_admin" })
    const lost = source({ mutation: () => { throw new ConvexError({ code: "pageRoleRequired" }) } })
    expect(await lost.management.revokeRole("page-1", "person-2")).toEqual({ ok: false, code: "page_role_required" })
    const done = source({ mutation: () => ({ revoked: true }) })
    expect(await done.management.revokeRole("page-1", "person-2")).toEqual({ ok: true, value: { revoked: true } })
    expect(done.calls).toEqual([{ name: "modules/pages/signatories:revokePageRole", args: { networkId: "network-diasporale", pageId: "page-1", personId: "person-2" } }])
  })

  it("répond à une invitation ; une invitation disparue se dit", async () => {
    const accepted = source({ mutation: () => ({ role: "signatory" }) })
    expect(await accepted.management.respondToInvitation("page-1", true)).toEqual({ ok: true, value: { role: "signatory" } })
    const gone = source({ mutation: () => { throw new ConvexError({ code: "notFound" }) } })
    expect(await gone.management.respondToInvitation("page-1", false)).toEqual({ ok: false, code: "page_invitation_gone" })
  })

  it("retire ma demande ; une demande tranchée rend `withdrawn: false`", async () => {
    const { management } = source({ mutation: () => ({ withdrawn: false }) })
    expect(await management.withdrawClaim("claim-1")).toEqual({ ok: true, value: { withdrawn: false } })
  })

  it.each(["fileScanPending", "fileScanUnavailable", "fileQuarantined"] as const)("pose le logo par un dépôt neuf ; la retenue %s masque l'adresse", async (withheld) => {
    const deposit = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ storageId: "logo-neuf" })))
    const { management, calls } = source({
      fetch: deposit,
      mutation: (name) => (name === "modules/pages/identity:generatePageImageUploadUrl" ? "https://depot.exemple.test/logo" : { url: "https://images.exemple.test/logo.png", withheld }),
    })
    const logo = pdf("logo.png", "image/png")
    expect(await management.setImage!("page-1", "logo", logo)).toEqual({ ok: true, value: { url: null, withheld } })
    // Le logo part PRÉPARÉ (FD-01), déclaré sous le type du fichier préparé.
    const sentLogo = deposit.mock.calls[0]?.[1]?.body
    expect(sentLogo).not.toBe(logo)
    expect(isPreparedImage(sentLogo as File)).toBe(true)
    expect(calls).toEqual([
      { name: "modules/pages/identity:generatePageImageUploadUrl", args: { networkId: "network-diasporale", slot: "logo" } },
      { name: "modules/pages/identity:setPageImage", args: { networkId: "network-diasporale", pageId: "page-1", slot: "logo", storageId: "logo-neuf", mimeType: "image/png" } },
    ])
    expect(await management.setImage!("page-1", "banner", pdf("bannière.gif", "image/gif"))).toEqual({ ok: false, code: "page_image_type_invalid" })
  })

  it("met à jour l'identité : un champ vidé est effacé (`null`), jamais inventé", async () => {
    const { management, calls } = source({ mutation: () => ({ changed: true }) })
    expect(await management.updateIdentity("page-1", { name: "Amicale de Lyon", shortName: "  ", description: null, country: "FR" })).toEqual({ ok: true, value: { changed: true } })
    expect(calls).toEqual([{ name: "modules/pages/identity:updatePageIdentity", args: { networkId: "network-diasporale", pageId: "page-1", name: "Amicale de Lyon", shortName: null, description: null, country: "FR" } }])
  })
})

describe("AS-11a — mettre la page en sommeil, la réactiver", () => {
  it("lit mes pages en sommeil, bornées au réseau ; état, échéance et `canWake` sont ceux du serveur", () => {
    results({
      "modules/pages/sleep:mySleepingPages": [
        { ...CARD, teamRole: "admin", sleepEndsAt: 1_000, state: "asleep", canWake: true },
        { ...CARD, pageId: "page-2", handle: "amicale-nice", teamRole: "signatory", sleepEndsAt: 2_000, state: "expired", canWake: false },
      ],
    })
    const { management } = source()
    const { result } = renderHook(() => management.useMySleepingPages!())
    expect(mocks.loaded).toHaveBeenCalledWith("modules/pages/sleep:mySleepingPages", { networkId: "network-diasporale" })
    expect(result.current).toEqual({
      status: "ready",
      data: [
        { id: "page-1", handle: "amicale-lyon", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", teamRole: "admin", sleepEndsAt: 1_000, state: "asleep", canWake: true },
        { id: "page-2", handle: "amicale-nice", name: "Amicale de Lyon", ownerKind: "association", badge: "community", country: "FR", teamRole: "signatory", sleepEndsAt: 2_000, state: "expired", canWake: false },
      ],
    })
  })

  it("sans adhésion, refuse sans interroger le sommeil des pages", () => {
    results({ "modules/diaspora/membership:myMembership": null })
    const { management } = source()
    expect(renderHook(() => management.useMySleepingPages!()).result.current).toEqual({ status: "error", code: "not_member" })
    expect(mocks.loaded).not.toHaveBeenCalledWith("modules/pages/sleep:mySleepingPages", expect.anything())
  })

  it("endort la page dans le réseau diasporale et rend l'échéance ; un éditeur reçoit le refus du rôle", async () => {
    const asleep = source({ mutation: () => ({ sleepEndsAt: 42 }) })
    expect(await asleep.management.putToSleep!("page-1")).toEqual({ ok: true, value: { sleepEndsAt: 42 } })
    expect(asleep.calls).toEqual([{ name: "modules/pages/sleep:putPageToSleep", args: { networkId: "network-diasporale", pageId: "page-1" } }])
    const editor = source({ mutation: () => { throw new ConvexError({ code: "pageRoleRequired" }) } })
    expect(await editor.management.putToSleep!("page-1")).toEqual({ ok: false, code: "page_role_required" })
    const gone = source({ mutation: () => { throw new ConvexError({ code: "notFound" }) } })
    expect(await gone.management.putToSleep!("page-1")).toEqual({ ok: false, code: "not_found" })
  })

  it("réactive la page ; une échéance passée, une mesure de la modération et un rôle insuffisant se disent", async () => {
    const woken = source({ mutation: () => ({ status: "active" }) })
    expect(await woken.management.wake!("page-1")).toEqual({ ok: true, value: { status: "active" } })
    expect(woken.calls).toEqual([{ name: "modules/pages/sleep:wakePage", args: { networkId: "network-diasporale", pageId: "page-1" } }])
    const expired = source({ mutation: () => { throw new ConvexError({ code: "invalidArgument", rule: "PAGE_SLEEP_EXPIRED", params: { days: 30 } }) } })
    expect(await expired.management.wake!("page-1")).toEqual({ ok: false, code: "page_sleep_expired" })
    const held = source({ mutation: () => { throw new ConvexError({ code: "conflict" }) } })
    expect(await held.management.wake!("page-1")).toEqual({ ok: false, code: "not_allowed" })
    const editor = source({ mutation: () => { throw new ConvexError({ code: "pageRoleRequired" }) } })
    expect(await editor.management.wake!("page-1")).toEqual({ ok: false, code: "page_role_required" })
  })
})

describe("gestion des pages — refus lus dans leur contexte", () => {
  it("une règle connue du contexte l'emporte, sinon la table commune", () => {
    const upload = new ConvexError({ code: "invalidArgument", rule: "UPLOAD_TYPE_NOT_ALLOWED" })
    expect(pageAdminErrorCode(upload)).toBe("media_type_invalid")
    expect(pageAdminErrorCode(upload, { rules: { UPLOAD_TYPE_NOT_ALLOWED: "page_image_type_invalid" } })).toBe("page_image_type_invalid")
    expect(pageAdminErrorCode(new ConvexError({ code: "invalidArgument", rule: "PAGE_NAME_LENGTH" }))).toBe("page_name_invalid")
    expect(pageAdminErrorCode(new ConvexError({ code: "pageRoleRequired" }))).toBe("page_role_required")
  })
})
