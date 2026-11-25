"use client"

/**
 * Adaptateur moteur de la capacité « modération par pays » (PD6 · G9).
 * PROPRIÉTAIRE : ce chantier.
 *
 * Lectures : la tranche `diaspora/moderationDesk` du moteur (capacité, file
 * filtrée par le pays de la cible, dossier et décisions antérieures, relecture
 * préalable), toutes bornées par le réseau `diaspora-ga` et par la personne
 * ATTENDUE (`expectedPersonId`) ; l'aperçu
 * est la projection bornée du moteur (`moderation/reviewProjection.preview`).
 * Une lecture ne part qu'une fois la session et l'adhésion lisibles ; un refus
 * ne laisse aucune ligne à l'écran.
 *
 * SU01d : la voie des délais légaux est `moderation/cases.deadlineQueue`, avec la
 * compétence du moteur (réseau ou équipe). Elle ne connaît ni le pays de la
 * cible ni la personne attendue : l'écran ne la lit que sous un guichet ouvert
 * pour la personne attendue (`myDesk`), qui se ferme au changement de session.
 *
 * Écritures : les mutations EXISTANTES du moteur (`moderation/cases` : `decide`,
 * `reviewContent` ; `pages/claims.decidePageClaim`), qui motivent, journalisent et
 * préviennent l'auteur. Le motif et les mesures sont jugés avant tout appel, la
 * personne de la session est relue : une autre session ferme le geste (`not_found`)
 * avant toute écriture.
 *
 * CH-815, D5 et lot A6 : les recours du réseau, la composition des équipes, les
 * responsables et les réglages de modération se décident dans l'application
 * d'administration du réseau ; le moteur refuse ces gestes à toute session de
 * diaspora.ga, et cet adaptateur ne les sert plus.
 *
 * AS-01 : la file des revendications en attente vient de la tranche
 * (`diaspora/moderationDesk` : `pageClaimQueue`, filtrée par pays de la page, conflit
 * d'intérêts dit par `party`) ; la fiche, les pièces et la décision viennent de
 * `pages/claims` (`getPageClaim`, `decidePageClaim`). `canDecide` (PG-01 du
 * moteur) est lu s'il est servi, sans être exigé.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { PageTrustLevel } from "@diaspora-ga/domain"
import {
  DESK_PAGE_SIZE,
  deskCountry,
  deskGround,
  deskReasonRefusal,
  deskSanctions,
  withoutDeadlineCases,
  type ActionErrorCode,
  type ActionResult,
  type DeskClaimDetailView,
  type DeskClaimView,
  type DeskCaseDetailView,
  type DeskCaseView,
  type DeskDeadlineLane,
  type DeskDeadlineView,
  type DeskPage,
  type DeskPendingView,
  type DeskPreviewView,
  type DeskSurface,
  type DeskZone,
  type Loadable,
  type ModerationDeskCapability,
  type ModerationDeskView,
  type PostMediaView,
} from "@diaspora-ga/features/data"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { useMemo } from "react"

import { engineActionErrorCode } from "./engine-errors"
import { toMediaWithheld } from "./engine-views"
import {
  failed,
  LOADING,
  memberReadError,
  ready,
  Refusal,
  resolveDiasporaGaNetworkId,
  useEngineMember,
  useLoaded,
  type EngineSourceDeps,
  type Loaded,
} from "./engine-kit"

const DESK = api.modules.diaspora.moderationDesk
const CASES = api.modules.moderation.cases
const PREVIEW = api.modules.moderation.reviewProjection.preview
const CLAIMS = api.modules.pages.claims

type DeskRow = FunctionReturnType<typeof DESK.myDesk>
type ClaimRow = FunctionReturnType<typeof DESK.pageClaimQueue>["items"][number]
type ClaimDetailRow = FunctionReturnType<typeof CLAIMS.getPageClaim>
type CaseRow = FunctionReturnType<typeof DESK.queue>["items"][number]
type DeadlineRows = FunctionReturnType<typeof CASES.deadlineQueue>
type DeadlineRow = DeadlineRows["items"][number]
type CaseDetailRow = FunctionReturnType<typeof DESK.caseDetail>
type PendingRow = FunctionReturnType<typeof DESK.pendingQueue>["items"][number]
type PreviewRow = FunctionReturnType<typeof PREVIEW>
type EngineZone = FunctionArgs<typeof DESK.queue>["zone"]
type EngineTarget = FunctionArgs<typeof CASES.reviewContent>["target"]
type Window<Row> = { readonly items: readonly Row[]; readonly continueCursor: string | null; readonly isDone: boolean }

// ── Refus ──────────────────────────────────────────────────────────────────

/** Le champ fautif d'un `invalidArgument` du moteur (un nom de champ, jamais une valeur). */
function invalidField(error: unknown): string | null {
  if (engineErrorCode(error) !== "invalidArgument" || typeof error !== "object" || error === null || !("data" in error)) return null
  const data = (error as { data: unknown }).data
  if (typeof data !== "object" || data === null || !("field" in data)) return null
  const field = (data as { field: unknown }).field
  return typeof field === "string" ? field : null
}

/** Les refus des gestes de modération, en codes FERMÉS ; le reste suit la table commune du moteur. */
export function moderationDeskErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof Refusal) return error.code
  const rule = engineErrorRule(error)?.rule
  if (rule === "DECISION_REASON_LENGTH") return "moderation_desk_reason_length"
  // AS-11a : revendication sur une page en sommeil — elle reste en attente, elle se refuse seulement ; jamais « déjà tranchée ».
  if (rule === "PAGE_ASLEEP") return "moderation_desk_page_asleep"
  const code = engineErrorCode(error)
  if (code === "conflict") return "moderation_desk_conflict"
  if (code === "policyRefused") return "moderation_desk_limit"
  const field = invalidField(error)
  if (field === "sanctions" || field === "until") return "moderation_desk_measure_refused"
  return engineActionErrorCode(error)
}

async function run<T>(work: () => Promise<T>, errorCode: (error: unknown) => ActionErrorCode = moderationDeskErrorCode): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return { ok: false, code: errorCode(error) }
  }
}

// ── Projections ────────────────────────────────────────────────────────────

export function toDeskView(row: NonNullable<DeskRow>): ModerationDeskView {
  return {
    role: row.role,
    networkWide: row.networkWide,
    canReviewAppeals: row.canReviewAppeals,
    canManageTeams: row.canManageTeams,
    canManagePolicy: row.canManagePolicy,
    // AS-01 : avant la réponse du moteur (`pages.claims.myPageClaimReview`), la règle du rôle de réseau.
    canReviewClaims: row.networkWide,
    teams: row.teams.map((team) => ({ teamId: team.teamId, name: team.name, scope: team.scope, isMember: team.isMember })),
  }
}

/** Un dossier de la file : le motif dit par une valeur fermée, le pays seulement s'il est un code connu. */
export function toCaseView(row: CaseRow): DeskCaseView {
  return {
    reportId: row.reportId,
    surface: row.surface,
    country: deskCountry(row.country),
    ground: deskGround(row.reason),
    status: row.status,
    level: row.level,
    teamName: row.teamName,
    createdAt: row.createdAt,
    hasAuthor: row.hasAuthor,
    party: row.party,
  }
}

/**
 * SU01d : un dossier de la voie des délais légaux, le motif dit par une valeur
 * fermée. Une ligne sans fondement ou sans échéance, ou déjà tranchée, n'en est
 * pas une : elle reste dans la file ordinaire.
 */
export function toDeadlineView(row: DeadlineRow): DeskDeadlineView | null {
  if (row.legalBasis === null || row.dueAt === null || (row.status !== "open" && row.status !== "reviewing")) return null
  return {
    reportId: row.reportId,
    surface: row.target.kind,
    ground: deskGround(row.reason),
    status: row.status,
    level: row.level,
    teamId: row.teamId,
    createdAt: row.createdAt,
    basis: row.legalBasis,
    dueAt: row.dueAt,
    acknowledgedAt: row.acknowledgedAt,
  }
}

export function toDeadlineLane(rows: DeadlineRows): DeskDeadlineLane {
  return {
    items: rows.items.flatMap((row) => {
      const view = toDeadlineView(row)
      return view === null ? [] : [view]
    }),
    truncated: rows.truncated,
  }
}

export function toCaseDetailView(row: CaseDetailRow): DeskCaseDetailView {
  return {
    case: toCaseView(row.case),
    history: row.history.map((entry) => ({
      status: entry.status,
      origin: entry.origin,
      decidedAt: entry.decidedAt,
      decisionReason: entry.decisionReason,
      sanctions: [...entry.sanctions],
    })),
    historyMore: row.historyMore,
  }
}

export function toPendingView(row: PendingRow): DeskPendingView {
  return {
    key: `${row.target.kind}:${row.target.id}`,
    targetKind: row.target.kind,
    targetId: row.target.id,
    country: deskCountry(row.country),
    teamName: row.teamName,
    updatedAt: row.updatedAt,
    party: row.party,
  }
}

/** Le badge CALCULÉ par le moteur ; une valeur inconnue se dit « Communauté », jamais plus. */
function pageBadgeOf(badge: string): PageTrustLevel {
  return badge === "official" || badge === "verified" ? badge : "community"
}

/** AS-01 : une revendication en attente de la file, le pays seulement s'il est un code connu. */
export function toClaimView(row: ClaimRow): DeskClaimView {
  return {
    claimId: row.claimId,
    page: { id: row.page.pageId, handle: row.page.handle, name: row.page.name, ownerKind: row.page.ownerKind, badge: pageBadgeOf(row.page.badge), country: deskCountry(row.page.country) },
    country: deskCountry(row.country),
    evidenceCount: row.evidenceCount,
    createdAt: row.createdAt,
    party: row.party,
  }
}

/**
 * `canDecide` de `getPageClaim` (PG-01 du moteur), s'il est servi ; `null`
 * sinon. Lu par l'opérateur `in` : le typage tient avec ou sans ce champ.
 */
export function claimCanDecide(row: object): boolean | null {
  if (!("canDecide" in row)) return null
  const value: unknown = row.canDecide
  return typeof value === "boolean" ? value : null
}

/** AS-01 : la fiche d'une revendication ; une pièce retenue par la garde des fichiers n'a pas d'adresse. */
export function toClaimDetailView(row: ClaimDetailRow): DeskClaimDetailView {
  return {
    claimId: row.claimId,
    claimant: { personId: row.claimant.personId, handle: row.claimant.handle, displayName: row.claimant.displayName },
    note: row.note,
    evidence: row.evidence.map((item) => ({ url: item.withheld === null ? item.url : null, withheld: item.withheld })),
    canDecide: claimCanDecide(row),
  }
}

/** Un média retenu par la garde des fichiers garde sa place, sans adresse. */
function toMediaView(media: PreviewRow["media"][number]): PostMediaView {
  // A1 (25/11) : la même lecture que le fil — l'analyse impossible garde sa raison.
  const withheld = toMediaWithheld(media.withheld)
  return {
    kind: media.kind,
    url: withheld === null ? media.url : null,
    withheld,
    altText: media.altText ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
  }
}

/** La projection bornée du moteur, telle quelle : ni auteur, ni contact, ni contexte. */
export function toPreviewView(row: PreviewRow): DeskPreviewView {
  return { available: row.available, title: row.title, body: row.body, media: row.media.map(toMediaView) }
}

function windowOf<Row, View>(rows: Window<Row>, view: (row: Row) => View): DeskPage<View> {
  return { items: rows.items.map(view), continueCursor: rows.isDone ? null : rows.continueCursor, isDone: rows.isDone }
}

const projectDesk = (row: DeskRow): ModerationDeskView | null => (row === null ? null : toDeskView(row))
const projectCases = (rows: FunctionReturnType<typeof DESK.queue>): DeskPage<DeskCaseView> => windowOf(rows, toCaseView)
const projectPending = (rows: FunctionReturnType<typeof DESK.pendingQueue>): DeskPage<DeskPendingView> => windowOf(rows, toPendingView)
const projectClaims = (rows: FunctionReturnType<typeof DESK.pageClaimQueue>): DeskPage<DeskClaimView> => windowOf(rows, toClaimView)

/** La voie des délais légaux d'une file : celle d'une équipe, ou toute la file accessible (rôle réseau). */
function deadlineArgs(networkId: Id<"networks">, teamId: string | null): FunctionArgs<typeof CASES.deadlineQueue> {
  return { networkId, ...(teamId ? { teamId: teamId as Id<"moderationTeams"> } : {}) }
}

/**
 * La file ordinaire (SU01d) : la fenêtre sans les dossiers de la voie des délais
 * légaux. Tant que la voie se charge, la fenêtre attend (aucun dossier n'apparaît
 * pour disparaître aussitôt) ; une voie illisible laisse la fenêtre entière, rien
 * n'est caché.
 */
export function ordinaryWindow(window: Loadable<DeskPage<DeskCaseView>>, deadlines: Loadable<DeskDeadlineLane> | null): Loadable<DeskPage<DeskCaseView>> {
  if (deadlines === null || window.status !== "ready" || deadlines.status === "error") return window
  if (deadlines.status === "loading") return LOADING
  const data = withoutDeadlineCases(window.data, deadlines.data)
  return data === window.data ? window : ready(data)
}

export function engineZone(zone: DeskZone): EngineZone {
  if (zone.kind === "country") return { kind: "country", country: zone.country }
  return zone.kind === "none" ? { kind: "none" } : { kind: "all" }
}

/** La cible d'un contenu en relecture, rendue telle que le moteur l'a typée dans sa file. */
function engineTarget(kind: DeskSurface, id: string): EngineTarget {
  return { kind, id } as EngineTarget
}

// ── Lecture ────────────────────────────────────────────────────────────────

interface DeskReader {
  readonly networkId: Id<"networks"> | null
  readonly error: ActionErrorCode | null
}

/** Le réseau `diaspora-ga`, seulement quand la session et l'adhésion sont lisibles (sinon le refus standard). */
function useDeskReader(personId: string): DeskReader {
  const member = useEngineMember()
  const error = memberReadError(member)
  const networkId = member.networkId.state === "ready" ? member.networkId.value : null
  const canRead = error === null && member.auth.isAuthenticated && member.membership.state === "ready" && member.membership.value !== null && personId.trim().length > 0
  return { networkId: canRead ? networkId : null, error }
}

/**
 * Une réponse du moteur projetée UNE fois : la même référence tant que la
 * réponse et les refus ne changent pas (les fenêtres de la file s'y fient).
 */
function useProjected<T, V>(reader: DeskReader, loaded: Loaded<T>, project: (value: T) => V): Loadable<V> {
  const value = loaded.state === "ready" ? loaded.value : undefined
  const code = loaded.state === "error" ? loaded.code : null
  return useMemo<Loadable<V>>(
    () => {
      if (reader.error !== null) return failed(reader.error)
      if (code !== null) return failed(code)
      if (value === undefined) return LOADING
      return ready(project(value))
    },
    // La projection est une fonction du module : seuls la réponse et les refus comptent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reader.error, code, value],
  )
}

// ── La capacité ────────────────────────────────────────────────────────────

export function createEngineModerationDesk(deps: EngineSourceDeps): ModerationDeskCapability {
  /** La personne de la session, relue à l'acte : le geste ne vaut que pour la personne affichée. */
  async function expectPerson(personId: string): Promise<void> {
    const person = await deps.convex.query(api.modules.people.persons.getMyPerson, {})
    if (!person) throw new Refusal("not_signed_in")
    if (person._id !== personId) throw new Refusal("not_found")
  }

  function requireReason(reason: string): string {
    const refusal = deskReasonRefusal(reason)
    if (refusal) throw new Refusal(refusal)
    return reason.trim()
  }

  return {
    demonstration: false,

    useDesk(personId) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(DESK.myDesk, reader.networkId ? { networkId: reader.networkId, expectedPersonId: personId as Id<"persons"> } : "skip")
      // AS-01 : qui instruit les revendications, par la règle du moteur (rôle de réseau, ou membre de l'équipe
      // compétente pour les pages). Tant qu'elle n'est pas lue, ou si le moteur en ligne ne la sert pas encore,
      // le guichet garde la règle du rôle de réseau : la lecture ne retarde ni ne casse le reste du guichet.
      const review = useLoaded(CLAIMS.myPageClaimReview, reader.networkId ? { networkId: reader.networkId } : "skip")
      const canReviewClaims = review.state === "ready" ? review.value.canReview : null
      const desk = useProjected(reader, loaded, projectDesk)
      return useMemo(
        () => (desk.status === "ready" && desk.data !== null && canReviewClaims !== null ? ready({ ...desk.data, canReviewClaims }) : desk),
        [desk, canReviewClaims],
      )
    },

    useQueue({ personId, zone, surface, teamId, status, lane, cursor }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(DESK.queue, reader.networkId
        ? {
            networkId: reader.networkId,
            expectedPersonId: personId as Id<"persons">,
            zone: engineZone(zone),
            ...(surface ? { surface } : {}),
            ...(teamId ? { teamId: teamId as Id<"moderationTeams"> } : {}),
            // Les dossiers ouverts par défaut, comme le moteur ; « en examen » seulement sur demande.
            ...(status === "reviewing" ? { status } : {}),
            paginationOpts: { cursor, numItems: DESK_PAGE_SIZE },
          }
        : "skip")
      const window = useProjected(reader, loaded, projectCases)
      // SU01d : la tranche ne range pas ses fenêtres par échéance ; la file ordinaire écarte donc
      // les dossiers de la voie des délais légaux, lue avec la même compétence (même abonnement).
      const ordinary = lane === "ordinary"
      const laneLoaded = useLoaded(CASES.deadlineQueue, reader.networkId && ordinary ? deadlineArgs(reader.networkId, teamId) : "skip")
      const deadlines = useProjected(reader, laneLoaded, toDeadlineLane)
      return useMemo(() => ordinaryWindow(window, ordinary ? deadlines : null), [window, ordinary, deadlines])
    },

    useDeadlines({ personId, teamId }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(CASES.deadlineQueue, reader.networkId ? deadlineArgs(reader.networkId, teamId) : "skip")
      return useProjected(reader, loaded, toDeadlineLane)
    },

    useCase({ personId, reportId }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(DESK.caseDetail, reader.networkId
        ? { networkId: reader.networkId, expectedPersonId: personId as Id<"persons">, reportId: reportId as Id<"reports"> }
        : "skip")
      return useProjected(reader, loaded, toCaseDetailView)
    },

    useCasePreview({ personId, reportId }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(PREVIEW, reader.networkId ? { networkId: reader.networkId, reportId: reportId as Id<"reports"> } : "skip")
      return useProjected(reader, loaded, toPreviewView)
    },

    async decide(input) {
      return await run(async () => {
        const reason = requireReason(input.reason)
        const sanctions = deskSanctions(input, Date.now())
        if (!sanctions.ok) throw new Refusal(sanctions.code)
        await expectPerson(input.personId)
        const networkId = await resolveDiasporaGaNetworkId(deps.convex)
        await deps.convex.mutation(CASES.decide, {
          networkId,
          reportId: input.reportId as Id<"reports">,
          decision: input.decision,
          reason,
          sanctions: sanctions.value.map((sanction) => (sanction.until === undefined ? { kind: sanction.kind } : { kind: sanction.kind, until: sanction.until })),
        })
        return { status: input.decision }
      })
    },

    usePending({ personId, zone, surface, teamId, cursor }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(DESK.pendingQueue, reader.networkId
        ? {
            networkId: reader.networkId,
            expectedPersonId: personId as Id<"persons">,
            zone: engineZone(zone),
            ...(surface ? { surface } : {}),
            ...(teamId ? { teamId: teamId as Id<"moderationTeams"> } : {}),
            paginationOpts: { cursor, numItems: DESK_PAGE_SIZE },
          }
        : "skip")
      return useProjected(reader, loaded, projectPending)
    },

    usePendingPreview({ personId, targetKind, targetId }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(PREVIEW, reader.networkId ? { networkId: reader.networkId, target: engineTarget(targetKind, targetId) } : "skip")
      return useProjected(reader, loaded, toPreviewView)
    },

    async reviewPending(input) {
      return await run(async () => {
        const reason = requireReason(input.reason)
        await expectPerson(input.personId)
        const networkId = await resolveDiasporaGaNetworkId(deps.convex)
        await deps.convex.mutation(CASES.reviewContent, { networkId, target: engineTarget(input.targetKind, input.targetId), approve: input.approve, reason })
        return null
      })
    },

    useClaims({ personId, zone, cursor }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(DESK.pageClaimQueue, reader.networkId
        ? { networkId: reader.networkId, expectedPersonId: personId as Id<"persons">, zone: engineZone(zone), paginationOpts: { cursor, numItems: DESK_PAGE_SIZE } }
        : "skip")
      return useProjected(reader, loaded, projectClaims)
    },

    useClaim({ personId, claimId }) {
      const reader = useDeskReader(personId)
      const loaded = useLoaded(CLAIMS.getPageClaim, reader.networkId ? { networkId: reader.networkId, claimId: claimId as Id<"pageClaims"> } : "skip")
      return useProjected(reader, loaded, toClaimDetailView)
    },

    async decideClaim(input) {
      return await run(async () => {
        const reason = requireReason(input.reason)
        await expectPerson(input.personId)
        const networkId = await resolveDiasporaGaNetworkId(deps.convex)
        await deps.convex.mutation(CLAIMS.decidePageClaim, { networkId, claimId: input.claimId as Id<"pageClaims">, decision: input.decision, reason })
        return { status: input.decision }
      })
    },
  }
}
