/**
 * Démonstration de la capacité « modération par pays » (PD6 · G9). PROPRIÉTAIRE : ce chantier.
 *
 * EXPLICITEMENT FICTIVE, et cohérente avec le magasin de démonstration :
 *   · la personne de la session, membre active du jeu de démonstration, reçoit un
 *     rôle FICTIF d'administration du réseau pour parcourir le guichet ; elle fait
 *     partie de l'équipe fictive de départ. Les décisions du réseau (recours,
 *     équipes et responsables, règles) ne se prennent plus ici (fiche CH-815, D5,
 *     lot A6) : l'application d'administration les décide, sans démonstration ;
 *   · la file est un jeu d'exemples fictifs, sans lien avec les publications ni
 *     les personnes du magasin, répartis entre la France, la Belgique, le Canada
 *     et les cibles sans pays ; trois dossiers montrent la retenue d'une personne
 *     partie au dossier ; un groupe thématique et un message personnel (MC-01 du
 *     moteur) y figurent, le second sans pays et sans titre, comme le moteur les sert ;
 *   · SU01d : un dossier porte un délai légal quand la règle du MOTEUR en pose un
 *     pour son motif (`reportLegalBasis`, `reportDecisionDueAt`), échéance comptée
 *     depuis sa transmission, accusé de réception remis à la transmission comme
 *     le fait le moteur ; l'horloge de la page les fait échoir ;
 *   · une décision reste dans la mémoire de la page, liée au jeu en cours (une
 *     remise à zéro l'efface) : elle ne retire rien, ne sanctionne ni ne
 *     prévient personne ;
 *   · les règles sont celles du moteur et du port : motif borné, mesures, durée,
 *     personne partie au dossier, refus indistinct pour une autre session ou un
 *     membre qui n'agit pas ;
 *   · AS-01 : « Pages à vérifier » lit les VRAIES revendications de la
 *     démonstration, déposées depuis « Mon activité » (`demoPageClaimsDesk`) ; le
 *     rôle de réseau fictif les instruit, jamais leur demandeur ni une personne
 *     qui a une ligne de signataire sur la page (refus indistinct), et une
 *     validation rend la page « Vérifié » dans ce navigateur, comme le moteur.
 * Aucune statistique : une fenêtre liste, elle ne compte rien.
 */
import { reportDecisionDueAt, reportLegalBasis } from "@antsia/social-domain/moderation"
import type { CountryCode } from "@diaspora-ga/domain"
import { useMemo, useSyncExternalStore } from "react"

import type { ActionErrorCode } from "../data/errors"
import {
  DESK_DEADLINES_MAX,
  deskReasonRefusal,
  deskSanctions,
  deskZoneFromKey,
  deskZoneKey,
  isInDeskZone,
  type DeskClaimDetailView,
  type DeskClaimView,
  type DeskCaseDetailView,
  type DeskCaseView,
  type DeskDeadlineLane,
  type DeskDeadlineView,
  type DeskDecision,
  type DeskGround,
  type DeskLegalBasis,
  type DeskHistoryEntry,
  type DeskPage,
  type DeskParty,
  type DeskPendingView,
  type DeskPreviewView,
  type DeskSurface,
  type ModerationDeskCapability,
  type ModerationDeskView,
} from "../data/moderation-desk-port"
import type { ActionResult } from "../data/port"
import type { Loadable } from "../data/types"
import { demoPageClaimsDesk } from "./page-admin"
import { statusOf } from "./selectors"
import type { DemoStore } from "./store"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Fenêtre de démonstration volontairement courte : « Afficher plus » se voit dès les premiers exemples. */
export const DEMO_DESK_WINDOW = 4
/** L'équipe fictive de départ. */
export const DEMO_DESK_TEAM_ID = "demo-equipe-france"

const LOADING = { status: "loading" } as const
const fail = (code: ActionErrorCode): ActionResult<never> => ({ ok: false, code })
/** Un refus de lecture, valable pour toute lecture du guichet. */
const refused = (code: ActionErrorCode) => ({ status: "error", code }) as const

/** Le délai légal d'un dossier fictif, posé comme le moteur le pose à la transmission. */
interface DemoDeadline {
  readonly basis: DeskLegalBasis
  readonly dueAt: number
  readonly acknowledgedAt: number
}

interface DemoCase {
  readonly view: DeskCaseView
  readonly teamId: string | null
  readonly deadline: DemoDeadline | null
  readonly preview: DeskPreviewView
  readonly history: readonly DeskHistoryEntry[]
}

/** La règle du moteur pour ce motif ; sans fondement, aucun délai. */
function demoDeadline(ground: DeskGround, createdAt: number): DemoDeadline | null {
  const basis = reportLegalBasis(ground)
  const dueAt = reportDecisionDueAt(ground, createdAt)
  return basis === null || dueAt === null ? null : { basis, dueAt, acknowledgedAt: createdAt }
}

function deadlineView(row: DemoCase, deadline: DemoDeadline): DeskDeadlineView {
  const { view } = row
  return {
    reportId: view.reportId,
    surface: view.surface,
    ground: view.ground,
    status: view.status,
    level: view.level,
    teamId: row.teamId,
    createdAt: view.createdAt,
    basis: deadline.basis,
    dueAt: deadline.dueAt,
    acknowledgedAt: deadline.acknowledgedAt,
  }
}

interface DemoPending {
  readonly view: DeskPendingView
  readonly teamId: string | null
  readonly preview: DeskPreviewView
}

interface DemoMemberLabel {
  readonly handle: string
  readonly displayName: string
}

interface DemoTeam {
  readonly teamId: string
  readonly name: string
  readonly scope: DeskSurface | null
  /** L'équipe de départ compte la personne de la session, jusqu'à son retrait. */
  readonly includesViewer: boolean
  readonly members: Map<string, DemoMemberLabel>
  readonly removed: Set<string>
}

interface DeskWorld {
  /** Le jeu de démonstration (`createdAt` de l'état) : une remise à zéro rend ce guichet caduc. */
  readonly world: number
  readonly cases: readonly DemoCase[]
  readonly pending: readonly DemoPending[]
  readonly decided: Map<string, DeskDecision>
  readonly reviewed: Set<string>
  readonly settled: Set<string>
  readonly teams: DemoTeam[]
}

/** Ce que la personne de la session lit et décide, selon son rôle fictif (mêmes règles que `myDesk`). */
interface DemoCapacity {
  readonly role: "network_admin" | "member"
  readonly networkWide: boolean
  readonly admin: boolean
}

/** La modératrice fictive de l'équipe de départ : aucune personne du magasin. */
const FICTIVE_MODERATOR = { personId: "demo-moderatrice-fictive", label: { handle: "moderatrice.fictive", displayName: "Modératrice fictive" } } as const

function preview(title: string | null, body: string): DeskPreviewView {
  return { available: true, title, body, media: [] }
}

function demoCase(input: {
  readonly id: string
  readonly surface: DeskSurface
  readonly country: CountryCode | null
  readonly ground: DeskGround
  readonly age: number
  readonly world: number
  readonly team: boolean
  readonly hasAuthor: boolean
  readonly party?: DeskParty
  readonly title?: string
  readonly body: string
  readonly history?: readonly DeskHistoryEntry[]
}): DemoCase {
  const createdAt = input.world - input.age
  return {
    view: {
      reportId: input.id,
      surface: input.surface,
      country: input.country,
      ground: input.ground,
      status: "open",
      level: input.team ? "team" : "network",
      teamName: input.team ? "Équipe France (fictive)" : null,
      createdAt,
      hasAuthor: input.hasAuthor,
      party: input.party ?? null,
    },
    teamId: input.team ? DEMO_DESK_TEAM_ID : null,
    deadline: demoDeadline(input.ground, createdAt),
    preview: preview(input.title ?? null, input.body),
    history: input.history ?? [],
  }
}

/** Le jeu fictif du guichet, daté depuis la création du jeu de démonstration. */
function seedWorld(world: number): DeskWorld {
  const cases: DemoCase[] = [
    demoCase({ id: "demo-dossier-1", surface: "post", country: "FR", ground: "harassment", age: 30 * HOUR, world, team: false, hasAuthor: true, body: "Exemple fictif : moqueries répétées adressées à une nouvelle arrivante dans le fil local de Paris." }),
    demoCase({ id: "demo-dossier-2", surface: "comment", country: "FR", ground: "hate", age: 26 * HOUR, world, team: true, hasAuthor: true, body: "Exemple fictif : commentaire dénigrant une communauté sous l'annonce d'une fête associative." }),
    demoCase({ id: "demo-dossier-3", surface: "page", country: "FR", ground: "misinformation", age: 22 * HOUR, world, team: false, hasAuthor: true, party: "page", title: "Association fictive des Gabonais de Lille", body: "Exemple fictif : page qui se présenterait comme la représentation officielle d'une association." }),
    // SU01d : un hypertrucage (art. 33) se tranche sous 24 h, l'échéance la plus proche du jeu.
    demoCase({ id: "demo-dossier-9", surface: "post", country: "FR", ground: "deepfake_of_me", age: 21 * HOUR, world, team: true, hasAuthor: true, body: "Exemple fictif : vidéo truquée qui prête à une membre des propos qu'elle n'a jamais tenus, signalée par l'intéressée." }),
    demoCase({ id: "demo-dossier-4", surface: "serviceReview", country: "FR", ground: "spam", age: 18 * HOUR, world, team: true, hasAuthor: true, body: "Exemple fictif : avis promotionnel copié sous plusieurs prestations." }),
    demoCase({ id: "demo-dossier-5", surface: "serviceReviewReply", country: "BE", ground: "harassment", age: 14 * HOUR, world, team: false, hasAuthor: false, body: "Exemple fictif : réponse d'une page qui interpelle l'auteur de l'avis sur un ton agressif." }),
    // MC-01 du moteur : un groupe se range au pays du groupe ; qui le tient ne tranche pas.
    demoCase({ id: "demo-dossier-10", surface: "thematicGroup", country: "FR", ground: "fraud", age: 12 * HOUR, world, team: false, hasAuthor: true, party: "group", title: "Groupe fictif des démarches à Bordeaux", body: "Exemple fictif : fiche d'un groupe qui promet, contre paiement, d'accélérer les démarches consulaires de ses membres.\n\nRègles fictives : adhésion réservée aux membres qui ont réglé leur participation." }),
    demoCase({ id: "demo-dossier-6", surface: "event", country: "CA", ground: "other", age: 10 * HOUR, world, team: false, hasAuthor: false, title: "Soirée fictive à Montréal", body: "Exemple fictif : évènement dont la description renvoie vers une cagnotte extérieure non expliquée." }),
    demoCase({
      id: "demo-dossier-7", surface: "post", country: null, ground: "misinformation", age: 6 * HOUR, world, team: false, hasAuthor: true,
      body: "Exemple fictif : publication de portée diaspora annonçant une démarche consulaire inexistante.",
      history: [{ status: "dismissed", origin: "reader", decidedAt: world - 3 * DAY, decisionReason: "Information vérifiée auprès de la source citée (exemple fictif).", sanctions: [] }],
    }),
    // MC-01 du moteur : un message personnel est « sans pays » ; l'aperçu n'est que son texte, sans titre.
    demoCase({ id: "demo-dossier-11", surface: "personalMessage", country: null, ground: "spam", age: 4 * HOUR, world, team: false, hasAuthor: true, body: "Exemple fictif : message privé qui renvoie vers un placement financier présenté comme garanti." }),
    demoCase({ id: "demo-dossier-8", surface: "person", country: null, ground: "harassment", age: 2 * HOUR, world, team: false, hasAuthor: true, party: "reporter", title: "Compte fictif", body: "Exemple fictif : compte qui relance des membres en messages privés malgré leurs refus." }),
  ]
  const pending: DemoPending[] = [
    {
      view: { key: "page:demo-page-relecture", targetKind: "page", targetId: "demo-page-relecture", country: "FR", teamName: null, updatedAt: world - 5 * HOUR, party: null },
      teamId: null,
      preview: preview("Collectif fictif des étudiants de Rennes", "Exemple fictif : nouvelle page d'association en attente de vérification avant publication."),
    },
    {
      view: { key: "event:demo-evenement-relecture", targetKind: "event", targetId: "demo-evenement-relecture", country: "FR", teamName: null, updatedAt: world - 3 * HOUR, party: null },
      teamId: null,
      preview: preview("Après-midi fictive de contes", "Exemple fictif : évènement associatif en relecture, programme et lieu à confirmer."),
    },
  ]
  const team: DemoTeam = {
    teamId: DEMO_DESK_TEAM_ID,
    name: "Équipe France (fictive)",
    scope: null,
    includesViewer: true,
    members: new Map<string, DemoMemberLabel>([[FICTIVE_MODERATOR.personId, FICTIVE_MODERATOR.label]]),
    removed: new Set<string>(),
  }
  return {
    world, cases, pending, decided: new Map(), reviewed: new Set(), settled: new Set(), teams: [team],
  }
}

/**
 * La voie des délais légaux, comme le moteur la sert : la file lue (réseau ou équipe), ni pays
 * ni nature, l'échéance la plus proche d'abord, bornée aux plus proches.
 */
function deadlineLane(desk: DeskWorld, teamId: string | null): DeskDeadlineLane {
  const rows = desk.cases
    .filter((row) => !desk.decided.has(row.view.reportId) && (teamId === null || row.teamId === teamId))
    .flatMap((row) => (row.deadline === null ? [] : [deadlineView(row, row.deadline)]))
    .sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
  return { items: rows.slice(0, DESK_DEADLINES_MAX), truncated: rows.length > DESK_DEADLINES_MAX }
}

function isTeamMember(team: DemoTeam, personId: string): boolean {
  if (team.removed.has(personId)) return false
  return team.members.has(personId) || team.includesViewer
}

/** Une fenêtre fictive ; le curseur est lié au jeu de démonstration. */
function windowed<Row>(rows: readonly Row[], cursor: string | null, world: number): Loadable<DeskPage<Row>> {
  let offset = 0
  if (cursor !== null) {
    const match = /^demo:(\d+):(\d+)$/.exec(cursor)
    if (!match || Number(match[1]) !== world) return refused("not_found")
    offset = Number(match[2])
  }
  const next = offset + DEMO_DESK_WINDOW
  const isDone = next >= rows.length
  return { status: "ready", data: { items: rows.slice(offset, next), continueCursor: isDone ? null : `demo:${world}:${next}`, isDone } }
}

export function createDemoModerationDesk(store: DemoStore): ModerationDeskCapability {
  const listeners = new Set<() => void>()
  let revision = 0
  let current: DeskWorld | null = null
  // AS-01 : les revendications vivent dans l'état de démonstration des pages (déposées depuis « Mon activité »).
  const claims = demoPageClaimsDesk(store)

  const emit = () => {
    revision += 1
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    const unsubscribe = store.subscribe(listener)
    const unsubscribeClaims = claims.subscribe(listener)
    return () => {
      listeners.delete(listener)
      unsubscribe()
      unsubscribeClaims()
    }
  }
  const snapshot = () => `${store.getVersion()}:${revision}:${claims.getVersion()}`
  /** `null` au rendu serveur : la démonstration ne se lit qu'au navigateur. */
  const useSnapshot = () => useSyncExternalStore(subscribe, snapshot, () => null)

  /** Le guichet du jeu en cours ; un autre jeu (remise à zéro) repart des exemples fictifs. */
  const deskWorld = (): DeskWorld => {
    const world = store.getState().createdAt
    if (current === null || current.world !== world) current = seedWorld(world)
    return current
  }

  /** Seule la personne de la session, membre qui agit, ouvre le guichet ; une autre personne : `not_found`. */
  const viewerRefusal = (personId: string): ActionErrorCode | null => {
    const state = store.getState()
    const viewer = state.session.personId
    if (viewer === null) return "not_signed_in"
    if (viewer !== personId) return "not_found"
    const status = statusOf(state, viewer, store.now())
    if (status === null || status === "partie") return "not_member"
    if (status === "suspendue") return "suspended"
    if (status === "en_attente") return "status_insufficient"
    return null
  }

  const openCase = (desk: DeskWorld, reportId: string): DemoCase | null => {
    const row = desk.cases.find((item) => item.view.reportId === reportId)
    return row && !desk.decided.has(reportId) ? row : null
  }
  const openPending = (desk: DeskWorld, key: string): DemoPending | null => {
    const row = desk.pending.find((item) => item.view.key === key)
    return row && !desk.reviewed.has(key) ? row : null
  }
  const teamOf = (desk: DeskWorld, teamId: string | null): DemoTeam | null | undefined =>
    teamId === null ? null : desk.teams.find((team) => team.teamId === teamId)

  // ── Rôle fictif ──

  /** Le rôle de réseau d'une personne : le rôle fictif d'administration de la session, sinon membre (aucun geste ne le change ici). */
  const capacityOf = (_desk: DeskWorld, personId: string): DemoCapacity => {
    const role = personId === store.getState().session.personId ? "network_admin" : "member"
    return { role, networkWide: role !== "member", admin: role === "network_admin" }
  }
  /** Lit la file d'une équipe (`teamId`) ou du réseau entier (`null`) : rôle réseau, ou membre de l'équipe. */
  const canReadTeam = (desk: DeskWorld, personId: string, teamId: string | null): boolean => {
    if (capacityOf(desk, personId).networkWide) return true
    const team = teamOf(desk, teamId)
    return team !== null && team !== undefined && isTeamMember(team, personId)
  }
  /**
   * AS-01, la règle du moteur (`pages/claims.pageClaimReviewCapacity`) : qui instruit les revendications
   * de page — un rôle de réseau, ou le membre de l'équipe compétente pour les pages (l'équipe de nature
   * « page », à défaut l'équipe sans nature). Une équipe d'une autre nature ne gagne rien.
   */
  const canReviewClaims = (desk: DeskWorld, personId: string): boolean => {
    if (capacityOf(desk, personId).networkWide) return true
    const team = desk.teams.find((row) => row.scope === "page") ?? desk.teams.find((row) => row.scope === null)
    return team !== undefined && isTeamMember(team, personId)
  }
  return {
    demonstration: true,

    useDesk(personId) {
      const version = useSnapshot()
      return useMemo((): Loadable<ModerationDeskView | null> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        const capacity = capacityOf(desk, personId)
        const teams = desk.teams
          .map((team) => ({ teamId: team.teamId, name: team.name, scope: team.scope, isMember: isTeamMember(team, personId) }))
          .filter((team) => capacity.admin || team.isMember)
        if (!capacity.networkWide && teams.length === 0) return { status: "ready", data: null }
        return {
          status: "ready",
          data: {
            role: capacity.admin ? "network_admin" : capacity.networkWide ? "network_moderator" : "team_member",
            networkWide: capacity.networkWide,
            canReviewAppeals: capacity.admin,
            canManageTeams: capacity.admin,
            canManagePolicy: capacity.admin,
            canReviewClaims: canReviewClaims(desk, personId),
            teams,
          },
        }
      }, [version, personId])
    },

    useQueue({ personId, zone, surface, teamId, status, lane, cursor }) {
      const version = useSnapshot()
      const zoneKey = deskZoneKey(zone)
      const wanted = status ?? "open"
      return useMemo((): Loadable<DeskPage<DeskCaseView>> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        if (teamOf(desk, teamId) === undefined || !canReadTeam(desk, personId, teamId)) return refused("not_found")
        const filter = deskZoneFromKey(zoneKey)
        // SU01d : la file ordinaire ne reprend pas les dossiers que la voie des délais légaux présente.
        const shown = new Set(lane === "ordinary" ? deadlineLane(desk, teamId).items.map((row) => row.reportId) : [])
        const rows = desk.cases
          .filter((row) => !desk.decided.has(row.view.reportId) && row.view.status === wanted && !shown.has(row.view.reportId))
          .filter((row) => (surface === null || row.view.surface === surface) && (teamId === null || row.teamId === teamId) && isInDeskZone(filter, row.view.country))
          .map((row) => row.view)
        return windowed(rows, cursor, desk.world)
      }, [version, personId, zoneKey, surface, teamId, wanted, lane, cursor])
    },

    useDeadlines({ personId, teamId }) {
      const version = useSnapshot()
      return useMemo((): Loadable<DeskDeadlineLane> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        if (teamOf(desk, teamId) === undefined || !canReadTeam(desk, personId, teamId)) return refused("not_found")
        return { status: "ready", data: deadlineLane(desk, teamId) }
      }, [version, personId, teamId])
    },

    useCase({ personId, reportId }) {
      const version = useSnapshot()
      return useMemo((): Loadable<DeskCaseDetailView> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        const row = openCase(desk, reportId)
        return row === null || !canReadTeam(desk, personId, row.teamId) ? refused("not_found") : { status: "ready", data: { case: row.view, history: row.history, historyMore: false } }
      }, [version, personId, reportId])
    },

    useCasePreview({ personId, reportId }) {
      const version = useSnapshot()
      return useMemo((): Loadable<DeskPreviewView> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        const row = openCase(desk, reportId)
        return row === null || !canReadTeam(desk, personId, row.teamId) ? refused("not_found") : { status: "ready", data: row.preview }
      }, [version, personId, reportId])
    },

    async decide(input) {
      const refusal = viewerRefusal(input.personId)
      if (refusal !== null) return fail(refusal)
      const reasonRefusal = deskReasonRefusal(input.reason)
      if (reasonRefusal !== null) return fail(reasonRefusal)
      const sanctions = deskSanctions(input, store.now())
      if (!sanctions.ok) return fail(sanctions.code)
      const desk = deskWorld()
      const row = openCase(desk, input.reportId)
      if (row === null || !canReadTeam(desk, input.personId, row.teamId)) return fail("not_found")
      if (row.view.party !== null) return fail("moderation_desk_party")
      // Comme le moteur : sans personne visée, seul le retrait du contenu s'applique.
      if (!row.view.hasAuthor && sanctions.value.some((sanction) => sanction.kind !== "removal")) return fail("moderation_desk_measure_refused")
      desk.decided.set(input.reportId, input.decision)
      emit()
      return { ok: true, value: { status: input.decision } }
    },

    usePending({ personId, zone, surface, teamId, cursor }) {
      const version = useSnapshot()
      const zoneKey = deskZoneKey(zone)
      return useMemo((): Loadable<DeskPage<DeskPendingView>> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        if (teamOf(desk, teamId) === undefined || !canReadTeam(desk, personId, teamId)) return refused("not_found")
        const filter = deskZoneFromKey(zoneKey)
        const rows = desk.pending
          .filter((row) => !desk.reviewed.has(row.view.key))
          .filter((row) => (surface === null || row.view.targetKind === surface) && (teamId === null || row.teamId === teamId) && isInDeskZone(filter, row.view.country))
          .map((row) => row.view)
        return windowed(rows, cursor, desk.world)
      }, [version, personId, zoneKey, surface, teamId, cursor])
    },

    usePendingPreview({ personId, targetKind, targetId }) {
      const version = useSnapshot()
      return useMemo((): Loadable<DeskPreviewView> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        const row = openPending(desk, `${targetKind}:${targetId}`)
        return row === null || !canReadTeam(desk, personId, row.teamId) ? refused("not_found") : { status: "ready", data: row.preview }
      }, [version, personId, targetKind, targetId])
    },

    async reviewPending(input) {
      const refusal = viewerRefusal(input.personId)
      if (refusal !== null) return fail(refusal)
      const reasonRefusal = deskReasonRefusal(input.reason)
      if (reasonRefusal !== null) return fail(reasonRefusal)
      const desk = deskWorld()
      const key = `${input.targetKind}:${input.targetId}`
      const row = openPending(desk, key)
      if (row === null || !canReadTeam(desk, input.personId, row.teamId)) return fail("not_found")
      if (row.view.party !== null) return fail("moderation_desk_party")
      desk.reviewed.add(key)
      emit()
      return { ok: true, value: null }
    },

    useClaims({ personId, zone, cursor }) {
      const version = useSnapshot()
      const zoneKey = deskZoneKey(zone)
      return useMemo((): Loadable<DeskPage<DeskClaimView>> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        const desk = deskWorld()
        // Comme `pages/claims` : rôle de réseau, ou équipe compétente pour les pages.
        if (!canReviewClaims(desk, personId)) return refused("not_found")
        const filter = deskZoneFromKey(zoneKey)
        return windowed(claims.pending(personId).filter((row) => isInDeskZone(filter, row.country)), cursor, desk.world)
      }, [version, personId, zoneKey, cursor])
    },

    useClaim({ personId, claimId }) {
      const version = useSnapshot()
      return useMemo((): Loadable<DeskClaimDetailView> => {
        if (version === null) return LOADING
        const refusal = viewerRefusal(personId)
        if (refusal !== null) return refused(refusal)
        if (!canReviewClaims(deskWorld(), personId)) return refused("not_found")
        const detail = claims.detail(personId, claimId)
        return detail === null ? refused("not_found") : { status: "ready", data: detail }
      }, [version, personId, claimId])
    },

    async decideClaim(input) {
      const refusal = viewerRefusal(input.personId)
      if (refusal !== null) return fail(refusal)
      if (!canReviewClaims(deskWorld(), input.personId)) return fail("not_found")
      const reasonRefusal = deskReasonRefusal(input.reason)
      if (reasonRefusal !== null) return fail(reasonRefusal)
      return claims.decide({ deciderId: input.personId, claimId: input.claimId, decision: input.decision, reason: input.reason })
    },
  }
}
