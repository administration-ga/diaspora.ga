/**
 * Capacité « modération par pays » du port (PD6 · G9, plan global DIASPORA.GA).
 * PROPRIÉTAIRE : ce chantier. Facultative : un fournisseur qui ne la sert pas la
 * laisse absente, et l'écran le dit au lieu d'inventer.
 *
 * Ce que le guichet sert, et à qui :
 *   · seules les équipes HABILITÉES du réseau (rôle réseau de modération ou
 *     d'administration, ou membre actif d'une équipe vivante) ont un guichet ;
 *     pour toute autre personne, `useDesk` rend `null` et chaque lecture le refus
 *     indistinct (`not_found`) — rien n'est dit des équipes ni de leurs membres ;
 *   · la file des signalements OUVERTS, filtrée par le pays que porte la CIBLE
 *     (publication locale, page, évènement ou direct d'une page, avis et réponse
 *     d'avis par la zone de l'offre) et par nature ; le pays d'une personne n'est
 *     jamais lu. Le moteur ne rattache pas encore une équipe à un pays : le pays
 *     FILTRE la file, il ne délimite aucune compétence ;
 *   · l'aperçu est la projection bornée du moteur (contenu signalé seul : ni
 *     auteur, ni déclarant, ni coordonnée, ni pièce privée, ni besoin d'une
 *     demande de service) ;
 *   · toute décision est MOTIVÉE (motif obligatoire, bornes ci-dessous), passe
 *     par les mutations EXISTANTES du moteur, qui la journalisent et en
 *     préviennent l'auteur, et reste susceptible de recours ;
 *   · une personne PARTIE au dossier (auteur, déclarant, signataire de la page
 *     visée, propriétaire ou modérateur du groupe visé, ancien décideur) ne le
 *     tranche pas : le moteur refuse ce qu'il garde, l'écran n'offre pas le
 *     geste (`party`) ;
 *   · MC-01 du moteur : un groupe thématique (fiche et règles) se range au pays
 *     du groupe, sinon à celui de sa page d'association ; un message personnel
 *     est « sans pays », et son aperçu n'est que le texte du message signalé ;
 *   · les recours du réseau, la composition des équipes, les responsables du
 *     réseau et les réglages de modération ne se décident plus ici (fiche CH-815,
 *     D5, lot A6) : l'application d'administration du réseau les décide, et le
 *     moteur refuse ces gestes à toute session de diaspora.ga ;
 *   · SU01d du moteur (ordonnance n° 0011/PR/2026, art. 24, 32, 33) : les
 *     dossiers à délai légal forment une voie À PART, l'échéance la plus proche
 *     d'abord, que ni le pays ni la nature ne filtrent ; la file ordinaire ne les
 *     reprend pas ;
 *   · AS-01 : les revendications de page en attente (« Pages à vérifier ») se
 *     lisent par pays de la page, avec la garde du moteur (rôle de réseau) ; la
 *     fiche, les pièces (servies par la garde des fichiers) et la décision
 *     motivée passent par `pages/claims`. Le demandeur et toute personne qui a
 *     une ligne de signataire sur la page ne tranchent jamais : l'écran n'offre
 *     pas le geste, le moteur refuse de façon indistincte.
 *
 * Aucune donnée consulaire, aucune statistique : une fenêtre de file ne compte
 * rien, elle liste.
 */
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import { REPORT_DEADLINES_ORDINANCE, REPORT_LEGAL_BASES, type ContentReportReason, type ReportLegalBasis, type TargetReportReason } from "@antsia/social-domain/moderation"
import {
  MODERATION_SURFACES,
  SANCTION_KINDS,
  type ModerationSurface,
  type SanctionKind,
} from "@antsia/social-domain/moderationPolicy"
import { PAGE_CLAIM_DECISIONS } from "@antsia/social-domain/pages"
import { isCountryCode, normalizeCountryCode, type CountryCode } from "@diaspora-ga/domain"

import type { PageRefView } from "./page-admin-port"
import type { ActionResult } from "./port"
import type { ServiceReviewReportReason } from "./service-reviews-port"
import type { Loadable, PostMediaView } from "./types"

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** Codes de refus propres au chantier, traduits par errors.<code> dans son fragment. */
export const MODERATION_DESK_ERROR_CODES = [
  // Motif d'une décision hors des bornes ({{min}} à {{max}} caractères).
  "moderation_desk_reason_length",
  // Aucune issue choisie (classer ou prendre une mesure, approuver ou refuser, maintenir ou annuler).
  "moderation_desk_outcome_required",
  // « Prendre une mesure » sans aucune mesure choisie.
  "moderation_desk_measure_required",
  // Sourdine ou suspension sans durée.
  "moderation_desk_duration_required",
  // Mesure refusée par le moteur pour ce dossier (aucune personne sanctionnable, durée refusée).
  "moderation_desk_measure_refused",
  // Le dossier, le contenu ou le recours a changé entre-temps (déjà tranché).
  "moderation_desk_conflict",
  // AS-11a : la page revendiquée est en sommeil, son équipe est figée : la revendication se refuse seulement (règle PAGE_ASLEEP du moteur).
  "moderation_desk_page_asleep",
  // Une limite du moteur est atteinte (équipes, sanctions d'un dossier).
  "moderation_desk_limit",
  // La personne est partie au dossier : un autre membre de l'équipe tranche.
  "moderation_desk_party",
  // Le réseau garde toujours un administrateur actif (règle NETWORK_LAST_ADMIN du moteur), aussi quand il quitte le réseau.
  "moderation_desk_last_admin",
] as const
export type ModerationDeskErrorCode = (typeof MODERATION_DESK_ERROR_CODES)[number]

// ── Vocabulaire ────────────────────────────────────────────────────────────

/** Les natures de cible que le moteur modère (`MODERATION_SURFACES`). */
export const DESK_SURFACES = MODERATION_SURFACES
export type DeskSurface = ModerationSurface

/** Les mesures du moteur (`SANCTION_KINDS`). */
export const DESK_SANCTION_KINDS = SANCTION_KINDS
export type DeskSanctionKind = SanctionKind

/**
 * Le motif d'un dossier, dit par une valeur fermée : ceux des signalements du
 * moteur (`CONTENT_REPORT_REASONS`), ceux d'une nature (`TARGET_REPORT_REASONS` : frais
 * demandés au candidat, usurpation d'une entreprise, pour une offre d'emploi, UM-03), ceux
 * des avis (`SERVICE_REVIEW_REPORT_REASONS`), la relecture préalable, et « non précisé »
 * pour tout autre code.
 */
export const DESK_GROUNDS = [
  "harassment",
  // SU01d du moteur (21/10/2026, ordonnance n° 0011/PR/2026) : les six motifs ajoutés aux signalements.
  "minor_harm",
  "hate",
  "violence",
  "sexual_content",
  "deepfake_of_me",
  "prohibited_ai_content",
  "institution_impersonation",
  "impersonation",
  "privacy_or_honor",
  "misinformation",
  "spam",
  "fraud",
  // UM-03 du moteur (antsia#168) : les motifs propres à une offre d'emploi.
  "job_fee_requested",
  "job_impersonation",
  "other",
  "pre_review",
  "unspecified",
] as const satisfies readonly (ContentReportReason | TargetReportReason | ServiceReviewReportReason | "pre_review" | "unspecified")[]
export type DeskGround = (typeof DESK_GROUNDS)[number]

/** Un code de motif reçu du moteur, jamais affiché brut. */
export function deskGround(reason: string): DeskGround {
  return (DESK_GROUNDS as readonly string[]).includes(reason) ? (reason as DeskGround) : "unspecified"
}

/** Le rôle qui ouvre le guichet. */
export const DESK_ROLES = ["network_admin", "network_moderator", "team_member"] as const
export type DeskRole = (typeof DESK_ROLES)[number]

/** Le niveau d'un dossier (`reports.level`). */
export const DESK_CASE_LEVELS = ["team", "network", "platform"] as const
export type DeskCaseLevel = (typeof DESK_CASE_LEVELS)[number]

/**
 * Pourquoi la personne ne tranche pas ce dossier. `group` (MC-01) : elle est
 * propriétaire ou modératrice vivante du groupe thématique visé.
 */
export const DESK_PARTIES = ["author", "reporter", "page", "decider", "group"] as const
export type DeskParty = (typeof DESK_PARTIES)[number]

/** Les deux sources de la file : les signalements, la relecture préalable (pages à vérifier, évènements…). */
export const DESK_SOURCES = ["reports", "pre_review"] as const
export type DeskSource = (typeof DESK_SOURCES)[number]

/** Les états d'un dossier encore à trancher (`reports.status`) : ouvert, ou mis en examen. */
export const DESK_OPEN_STATUSES = ["open", "reviewing"] as const
export type DeskOpenStatus = (typeof DESK_OPEN_STATUSES)[number]

/** Les deux issues d'un dossier. */
export const DESK_DECISIONS = ["dismissed", "actioned"] as const
export type DeskDecision = (typeof DESK_DECISIONS)[number]

/** L'origine d'une décision antérieure : un signalement, ou la relecture préalable. */
export const DESK_HISTORY_ORIGINS = ["reader", "pre_review"] as const
export type DeskHistoryOrigin = (typeof DESK_HISTORY_ORIGINS)[number]

/** La mesure qui vise la PERSONNE (une seule par décision) ; le retrait du contenu se choisit à part. */
export const DESK_PERSON_MEASURES = ["none", "warning", "mute", "suspension", "exclusion"] as const
export type DeskPersonMeasure = (typeof DESK_PERSON_MEASURES)[number]

/** Les durées proposées pour une sourdine ou une suspension (le moteur borne à un an). */
export const DESK_DURATION_DAYS = [1, 7, 30, 90, 180] as const
export type DeskDurationDays = (typeof DESK_DURATION_DAYS)[number]

export function isDeskDuration(value: number): value is DeskDurationDays {
  return (DESK_DURATION_DAYS as readonly number[]).includes(value)
}

/** Une mesure temporaire exige une durée (règle `validSanctionDuration` du moteur). */
export function isTimedMeasure(measure: DeskPersonMeasure): measure is "mute" | "suspension" {
  return measure === "mute" || measure === "suspension"
}

// ── Bornes ─────────────────────────────────────────────────────────────────

/** Lignes demandées par fenêtre (le moteur relit au plus vingt-cinq lignes brutes par fenêtre). */
export const DESK_PAGE_SIZE = 20
/**
 * Motif d'une décision, bords retirés. Le moteur exige au moins trois caractères
 * (`assertDecisionReason`) ; le guichet en demande dix, comme la tranche pour un
 * retrait de parrainage par la modération (`MODERATION_REASON_MIN`).
 */
export const DESK_REASON_MIN = 10
export const DESK_REASON_MAX = DECISION_REASON_MAX
export function deskReasonRefusal(reason: string): "moderation_desk_reason_length" | null {
  const length = reason.trim().length
  return length < DESK_REASON_MIN || length > DESK_REASON_MAX ? "moderation_desk_reason_length" : null
}

// ── Zone (pays de la cible) ────────────────────────────────────────────────

/** Toute la file, les cibles sans pays (portée diaspora, compte, message…), ou un pays. */
export type DeskZone =
  | { readonly kind: "all" }
  | { readonly kind: "none" }
  | { readonly kind: "country"; readonly country: CountryCode }

export const DESK_ZONE_ALL: DeskZone = { kind: "all" }

/** La clé d'une zone dans un sélecteur : `all`, `none` ou le code ISO. */
export function deskZoneKey(zone: DeskZone): string {
  return zone.kind === "country" ? zone.country : zone.kind
}

/** La zone d'une clé de sélecteur ; une clé illisible rend toute la file, jamais un pays deviné. */
export function deskZoneFromKey(key: string): DeskZone {
  if (key === "all") return DESK_ZONE_ALL
  if (key === "none") return { kind: "none" }
  const code = normalizeCountryCode(key)
  return isCountryCode(code) ? { kind: "country", country: code } : DESK_ZONE_ALL
}

/** Le pays reçu du moteur, s'il est un code connu. */
export function deskCountry(raw: string | null): CountryCode | null {
  if (raw === null) return null
  const code = normalizeCountryCode(raw)
  return isCountryCode(code) ? code : null
}

export function isInDeskZone(zone: DeskZone, country: CountryCode | null): boolean {
  if (zone.kind === "all") return true
  if (zone.kind === "none") return country === null
  return country === zone.country
}

// ── Décision ───────────────────────────────────────────────────────────────

export interface DeskMeasureChoice {
  readonly decision: DeskDecision
  /** Retirer le contenu visé. */
  readonly removal: boolean
  readonly personMeasure: DeskPersonMeasure
  /** Pour une sourdine ou une suspension. */
  readonly durationDays: DeskDurationDays | null
}

/** Une mesure telle que le moteur la reçoit (`sanctionInput` de `cases.decide`). */
export interface DeskSanction {
  readonly kind: DeskSanctionKind
  readonly until?: number
}

/**
 * Les mesures envoyées au moteur. Classer n'en porte aucune ; « prendre une
 * mesure » en exige au moins une, choisie : jamais un retrait implicite (le
 * moteur retire le contenu d'un dossier suivi d'effet sans mesure).
 */
export function deskSanctions(choice: DeskMeasureChoice, now: number): { readonly ok: true; readonly value: readonly DeskSanction[] } | { readonly ok: false; readonly code: ModerationDeskErrorCode } {
  if (choice.decision === "dismissed") return { ok: true, value: [] }
  const sanctions: DeskSanction[] = []
  if (choice.removal) sanctions.push({ kind: "removal" })
  if (choice.personMeasure === "warning" || choice.personMeasure === "exclusion") sanctions.push({ kind: choice.personMeasure })
  if (isTimedMeasure(choice.personMeasure)) {
    if (choice.durationDays === null) return { ok: false, code: "moderation_desk_duration_required" }
    sanctions.push({ kind: choice.personMeasure, until: now + choice.durationDays * DAY_MS })
  }
  if (sanctions.length === 0) return { ok: false, code: "moderation_desk_measure_required" }
  return { ok: true, value: sanctions }
}

/**
 * Une mesure LOURDE demande une confirmation explicite : suspension ou exclusion
 * de la personne (elles valent partout), retrait d'une page ou d'un compte.
 */
export function isHeavyDecision(choice: DeskMeasureChoice, surface: DeskSurface): boolean {
  if (choice.decision !== "actioned") return false
  if (choice.personMeasure === "suspension" || choice.personMeasure === "exclusion") return true
  return choice.removal && (surface === "page" || surface === "person")
}

/** Refuser en relecture préalable retire le contenu : lourd pour une page ou un compte. */
export function isHeavyPendingRejection(approve: boolean, surface: DeskSurface): boolean {
  return !approve && (surface === "page" || surface === "person")
}

// ── Vues ───────────────────────────────────────────────────────────────────

export interface DeskTeamView {
  readonly teamId: string
  readonly name: string
  /** La nature de contenu que l'équipe traite ; `null` : toutes. */
  readonly scope: DeskSurface | null
  readonly isMember: boolean
}

export interface ModerationDeskView {
  readonly role: DeskRole
  /** Lit la file du réseau entier (rôle réseau). */
  readonly networkWide: boolean
  readonly canReviewAppeals: boolean
  readonly canManageTeams: boolean
  /** MD-04 : règle la modération du réseau (administration du réseau seule). */
  readonly canManagePolicy: boolean
  /** AS-01 : instruit les revendications de page, selon le moteur (`pages/claims.pageClaimReviewCapacity` : rôle de réseau, ou membre de l'équipe compétente pour les pages). */
  readonly canReviewClaims: boolean
  /** Toutes les équipes vivantes pour l'administration du réseau ; les siennes sinon. */
  readonly teams: readonly DeskTeamView[]
}

export interface DeskQueueFilters {
  readonly zone: DeskZone
  readonly surface: DeskSurface | null
  /** La file d'une équipe ; `null` : toute la file accessible (rôle réseau). */
  readonly teamId: string | null
}

export interface DeskQueueRequest extends DeskQueueFilters {
  readonly personId: string
  readonly cursor: string | null
  /** Signalements seulement : les dossiers ouverts (par défaut) ou ceux mis en examen. */
  readonly status?: DeskOpenStatus
  /**
   * Signalements seulement (SU01d) : `ordinary` écarte les dossiers que la voie des
   * délais légaux présente à part, comme `lane: "ordinary"` de la file du moteur ;
   * sans `lane`, la file entière.
   */
  readonly lane?: "ordinary"
}

export interface DeskPage<Row> {
  readonly items: readonly Row[]
  readonly continueCursor: string | null
  readonly isDone: boolean
}

/** Un dossier ouvert : ni déclarant, ni auteur, ni contenu. */
export interface DeskCaseView {
  readonly reportId: string
  readonly surface: DeskSurface
  readonly country: CountryCode | null
  readonly ground: DeskGround
  readonly status: DeskOpenStatus
  readonly level: DeskCaseLevel
  readonly teamName: string | null
  readonly createdAt: number
  /** Une personne peut recevoir une mesure ; sinon seul le retrait du contenu s'applique. */
  readonly hasAuthor: boolean
  readonly party: DeskParty | null
}

export interface DeskHistoryEntry {
  readonly status: DeskDecision
  readonly origin: DeskHistoryOrigin
  readonly decidedAt: number | null
  readonly decisionReason: string | null
  readonly sanctions: readonly DeskSanctionKind[]
}

export interface DeskCaseDetailView {
  readonly case: DeskCaseView
  /** Les décisions antérieures sur la même cible, de ma compétence, les plus récentes d'abord. */
  readonly history: readonly DeskHistoryEntry[]
  readonly historyMore: boolean
}

export interface DeskCaseRequest {
  readonly personId: string
  readonly reportId: string
}

/** La projection bornée du moteur : le contenu visé seul. */
export interface DeskPreviewView {
  readonly available: boolean
  readonly title: string | null
  readonly body: string | null
  readonly media: readonly PostMediaView[]
}

/** Un contenu en relecture préalable. */
export interface DeskPendingView {
  /** `nature:identifiant`, stable. */
  readonly key: string
  readonly targetKind: DeskSurface
  readonly targetId: string
  readonly country: CountryCode | null
  readonly teamName: string | null
  readonly updatedAt: number
  readonly party: DeskParty | null
}

export interface DeskPendingRequest {
  readonly personId: string
  readonly targetKind: DeskSurface
  readonly targetId: string
}

// ── Pages à vérifier (AS-01) ───────────────────────────────────────────────

/** Les deux issues d'une revendication (celles du moteur) : valider, refuser. */
export const DESK_CLAIM_DECISIONS = PAGE_CLAIM_DECISIONS
export type DeskClaimDecision = (typeof DESK_CLAIM_DECISIONS)[number]

/** Pourquoi la personne ne tranche pas une revendication : elle l'a déposée, ou elle a une ligne de signataire sur la page. */
export const DESK_CLAIM_PARTIES = ["author", "page"] as const
export type DeskClaimParty = (typeof DESK_CLAIM_PARTIES)[number]

/** Une revendication en attente, telle que la file la montre : ni note, ni pièce, ni demandeur. */
export interface DeskClaimView {
  readonly claimId: string
  readonly page: PageRefView
  /** Le pays de la PAGE ; `null` : sans pays. */
  readonly country: CountryCode | null
  readonly evidenceCount: number
  readonly createdAt: number
  readonly party: DeskClaimParty | null
}

export interface DeskClaimsRequest {
  readonly personId: string
  readonly zone: DeskZone
  readonly cursor: string | null
}

export interface DeskClaimRequest {
  readonly personId: string
  readonly claimId: string
}

/** Une pièce servie par la garde des fichiers : sans adresse tant que l'analyse n'a pas parlé, ou si elle a bloqué. */
export interface DeskClaimEvidenceView {
  readonly url: string | null
  readonly withheld: MediaWithheld | null
}

/** La fiche d'une revendication : demandeur (profil publié), note, pièces. */
export interface DeskClaimDetailView {
  readonly claimId: string
  readonly claimant: { readonly personId: string; readonly handle: string | null; readonly displayName: string | null }
  readonly note: string | null
  readonly evidence: readonly DeskClaimEvidenceView[]
  /**
   * Le serveur dit si la personne peut trancher MAINTENANT (`canDecide` de
   * `getPageClaim`, PG-01 du moteur) ; `null` : il ne le dit pas, l'écran s'en
   * tient alors au conflit d'intérêts de la file.
   */
  readonly canDecide: boolean | null
}

export interface DeskClaimDecisionInput {
  readonly personId: string
  readonly claimId: string
  readonly decision: DeskClaimDecision
  readonly reason: string
}

// ── Délais légaux (SU01d du moteur) ────────────────────────────────────────

/** Le fondement d'un délai légal (`REPORT_LEGAL_BASES` du moteur). */
export const DESK_LEGAL_BASES = REPORT_LEGAL_BASES
export type DeskLegalBasis = ReportLegalBasis
/** Le texte qui fixe ces délais, cité tel quel (`REPORT_DEADLINES_ORDINANCE` du moteur). */
export const DESK_DEADLINES_ORDINANCE = REPORT_DEADLINES_ORDINANCE
/** La voie montre au plus les cinquante échéances les plus proches (`DEADLINE_QUEUE_MAX` du moteur). */
export const DESK_DEADLINES_MAX = 50

/** Un dossier à délai légal, encore à trancher : ni pays, ni déclarant, ni auteur, ni contenu. */
export interface DeskDeadlineView {
  readonly reportId: string
  readonly surface: DeskSurface
  readonly ground: DeskGround
  readonly status: DeskOpenStatus
  readonly level: DeskCaseLevel
  /** L'équipe du dossier ; son nom se lit dans le guichet (`ModerationDeskView.teams`). */
  readonly teamId: string | null
  readonly createdAt: number
  readonly basis: DeskLegalBasis
  /** L'échéance posée par le moteur à la transmission. */
  readonly dueAt: number
  /** L'accusé de réception remis au déclarant ; `null` : aucun. */
  readonly acknowledgedAt: number | null
}

export interface DeskDeadlineLane {
  /** L'échéance la plus proche d'abord. */
  readonly items: readonly DeskDeadlineView[]
  /** D'autres dossiers à délai légal attendent au-delà des plus proches. */
  readonly truncated: boolean
}

export interface DeskDeadlinesRequest {
  readonly personId: string
  /** La file d'une équipe ; `null` : toute la file accessible (rôle réseau). */
  readonly teamId: string | null
}

/** Ce qui reste avant l'échéance, ou le retard, à la minute. */
export interface DeskCountdown {
  readonly overdue: boolean
  readonly hours: number
  readonly minutes: number
}

/**
 * Le chronomètre d'une échéance à l'instant `now`, comme celui du bureau
 * d'antsia.ga : le reste s'arrondit à la minute inférieure, le retard à la
 * minute supérieure, et l'échéance même n'est pas encore un retard.
 */
export function deskCountdown(dueAt: number, now: number): DeskCountdown {
  const overdue = now > dueAt
  const total = overdue ? Math.ceil((now - dueAt) / MINUTE_MS) : Math.floor((dueAt - now) / MINUTE_MS)
  return { overdue, hours: Math.floor(total / 60), minutes: total % 60 }
}

/**
 * La file ordinaire : la fenêtre sans les dossiers que la voie des délais légaux
 * présente déjà (la même fenêtre s'il n'y a rien à écarter). Au-delà des
 * `DESK_DEADLINES_MAX` plus proches, un dossier à délai légal reste donc dans la
 * file ordinaire : il n'est jamais caché.
 */
export function withoutDeadlineCases(page: DeskPage<DeskCaseView>, lane: DeskDeadlineLane): DeskPage<DeskCaseView> {
  const shown = new Set(lane.items.map((row) => row.reportId))
  if (!page.items.some((row) => shown.has(row.reportId))) return page
  return { ...page, items: page.items.filter((row) => !shown.has(row.reportId)) }
}

// ── Gestes ─────────────────────────────────────────────────────────────────

export interface DeskDecisionInput extends DeskMeasureChoice {
  readonly personId: string
  readonly reportId: string
  readonly reason: string
}

export interface DeskPendingDecisionInput {
  readonly personId: string
  readonly targetKind: DeskSurface
  readonly targetId: string
  readonly approve: boolean
  readonly reason: string
}

// ── La capacité ────────────────────────────────────────────────────────────

export interface ModerationDeskCapability {
  /** Vrai pour la démonstration : dossiers fictifs, décisions gardées dans ce navigateur, sans aucun effet. */
  readonly demonstration: boolean
  /** Ma capacité de modération ; `null` : aucune (rien n'est dit de plus). */
  useDesk(personId: string): Loadable<ModerationDeskView | null>
  /** Une fenêtre de la file des signalements ouverts, la plus ancienne d'abord. */
  useQueue(request: DeskQueueRequest): Loadable<DeskPage<DeskCaseView>>
  /**
   * SU01d : les dossiers à délai légal de la file lue (réseau ou équipe), ouverts
   * ou en examen, l'échéance la plus proche d'abord, bornés aux `DESK_DEADLINES_MAX`
   * plus proches ; ni le pays ni la nature ne les filtrent.
   */
  useDeadlines(request: DeskDeadlinesRequest): Loadable<DeskDeadlineLane>
  /** Un dossier encore ouvert et de ma compétence ; tranché entre-temps : `not_found`. */
  useCase(request: DeskCaseRequest): Loadable<DeskCaseDetailView>
  useCasePreview(request: DeskCaseRequest): Loadable<DeskPreviewView>
  /** Trancher, motif obligatoire ; une mesure lourde a été confirmée par l'écran. */
  decide(input: DeskDecisionInput): Promise<ActionResult<{ readonly status: DeskDecision }>>
  /** Une fenêtre des contenus en relecture préalable. */
  usePending(request: DeskQueueRequest): Loadable<DeskPage<DeskPendingView>>
  usePendingPreview(request: DeskPendingRequest): Loadable<DeskPreviewView>
  reviewPending(input: DeskPendingDecisionInput): Promise<ActionResult>
  /** AS-01 : une fenêtre des revendications en attente, filtrée par le pays de la page, la plus ancienne d'abord (rôle de réseau ; sinon `not_found`). */
  useClaims(request: DeskClaimsRequest): Loadable<DeskPage<DeskClaimView>>
  /** AS-01 : la fiche d'une revendication et ses pièces. */
  useClaim(request: DeskClaimRequest): Loadable<DeskClaimDetailView>
  /** AS-01 : trancher, motif obligatoire ; le demandeur et les signataires de la page reçoivent le refus indistinct (`not_found`). */
  decideClaim(input: DeskClaimDecisionInput): Promise<ActionResult<{ readonly status: DeskClaimDecision }>>
}
