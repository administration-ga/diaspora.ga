/**
 * Les règles PURES des décisions du réseau qu'admin.diaspora.ga prend (fiche CH-815, D5 et § 4.2 :
 * recours, équipes et responsables, règles de modération) — déménagées du port du bureau de
 * diaspora.ga (`packages/diaspora-ga-features/src/data/moderation-desk-port.ts`, MD-01 et MD-04),
 * qui ne les sert plus. Les bornes et les défauts sont ceux du domaine du moteur, jamais un nombre
 * écrit ici ; le moteur rejuge tout. Les formes des lignes viennent du code généré du moteur.
 */
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import {
  admissibleBlockedTerm,
  BLOCKED_TERM_LENGTH,
  BLOCKED_TERMS_ACTIVE_MAX,
  MODERATION_POLICY_BOUNDS,
  MODERATION_SURFACES,
  type ModerationSurface,
} from "@antsia/social-domain/moderationPolicy"
import type { api } from "@convex/_generated/api"
import type { FunctionReturnType } from "convex/server"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

// ── Lignes du moteur ───────────────────────────────────────────────────────

/** Une équipe vivante du réseau (`diaspora/moderationDesk.myDesk().teams` : toutes, pour l'administration). */
export type TeamRow = NonNullable<FunctionReturnType<typeof api.modules.diaspora.moderationDesk.myDesk>>["teams"][number]
/** Un recours monté au réseau (`diaspora/moderationDesk.appealQueue`). */
export type AppealRow = FunctionReturnType<typeof api.modules.diaspora.moderationDesk.appealQueue>["items"][number]
/** Un membre d'équipe, par son profil publié (`diaspora/moderationDesk.teamRoster`). */
export type RosterMemberRow = FunctionReturnType<typeof api.modules.diaspora.moderationDesk.teamRoster>["members"][number]
/** Un responsable du réseau, par son profil publié (`diaspora/moderationDesk.responsibles`). */
export type ResponsibleRow = FunctionReturnType<typeof api.modules.diaspora.moderationDesk.responsibles>["members"][number]
/** Le membre actif trouvé par son identifiant public (`diaspora/moderationDesk.teamCandidate`). */
export type CandidateRow = NonNullable<FunctionReturnType<typeof api.modules.diaspora.moderationDesk.teamCandidate>>
/** Les règles du réseau, rubrique par rubrique, et les défauts du moteur (`moderation/networkAdmin.policies`). */
export type PoliciesRow = FunctionReturnType<typeof api.modules.moderation.networkAdmin.policies>
export type SurfacePolicyRow = PoliciesRow["surfaces"][number]
/** Ce qu'une règle règle : relecture avant publication, plafond de liens, cadence. */
export type PolicyValues = PoliciesRow["defaults"]
/** Un mot bloqué actif (`moderation/networkAdmin.blockedTermsPage`). */
export type BlockedTermRow = FunctionReturnType<typeof api.modules.moderation.networkAdmin.blockedTermsPage>["page"][number]

// ── Motif ──────────────────────────────────────────────────────────────────

/**
 * Le motif d'une décision, bords retirés : dix caractères au moins (le moteur en exige autant
 * pour les rôles, `MODERATION_REASON_MIN`, et le bureau en demandait autant pour tout geste), la
 * borne du journal au plus.
 */
export const DECISION_REASON_BOUNDS = { min: 10, max: DECISION_REASON_MAX } as const

// ── Équipes et responsables (MD-01, LX-03) ─────────────────────────────────

/** Nom d'une équipe (`moderation/networkAdmin.createTeam`). */
export const TEAM_NAME_BOUNDS = { min: 2, max: 100 } as const

/** Les deux rôles de réseau qui décident (`NETWORK_RESPONSIBLE_ROLES` du moteur). */
export const RESPONSIBLE_ROLES = ["network_admin", "network_moderator"] as const
export type ResponsibleRole = (typeof RESPONSIBLE_ROLES)[number]
/** Le rôle qu'un geste pose : un rôle de responsable, ou `member` pour le retirer. */
export type RoleChoice = ResponsibleRole | "member"

/** L'autre rôle de responsable : celui qu'un changement de rôle pose. */
export function otherResponsibleRole(role: ResponsibleRole): ResponsibleRole {
  return role === "network_admin" ? "network_moderator" : "network_admin"
}

// ── Règles de modération (MD-04, sur MC-02 du moteur) ──────────────────────

/** Les bornes d'une règle, celles qu'admet `setPolicy`. */
export const POLICY_BOUNDS = MODERATION_POLICY_BOUNDS
/** La fenêtre de cadence se règle à la minute, dans les bornes du moteur. */
export const WINDOW_MINUTES = {
  min: Math.ceil(MODERATION_POLICY_BOUNDS.windowMs.min / MINUTE_MS),
  max: Math.floor(MODERATION_POLICY_BOUNDS.windowMs.max / MINUTE_MS),
} as const
/** Un mot bloqué, une fois normalisé (casse et accents retirés), compte de `min` à `max` caractères. */
export const BLOCKED_TERM_BOUNDS = BLOCKED_TERM_LENGTH
/** Le réseau garde au plus ce nombre de mots bloqués actifs. */
export const BLOCKED_TERMS_MAX = BLOCKED_TERMS_ACTIVE_MAX
/** Mots bloqués lus par fenêtre (le moteur borne ses pages à cinquante). */
export const BLOCKED_TERMS_PAGE = 50
/** Recours lus par fenêtre (le moteur relit au plus vingt-cinq lignes brutes par fenêtre). */
export const APPEALS_PAGE = 20

/**
 * Les rubriques que DIASPORA.GA sert et dont la règle vaut dans le réseau `diaspora-ga`, dans
 * l'ordre de l'écran. Écartées : le compte (`person`, profil commun modéré dans le réseau racine),
 * le direct et ses commentaires (DIASPORA.GA ne sert pas encore de direct) et les natures propres
 * à ANTSIA (boutique, emploi reflété, profils professionnels, médias).
 */
export const POLICY_SURFACES = [
  "post",
  "comment",
  "groupMessage",
  "story",
  "album",
  "event",
  "page",
  "serviceReview",
  "serviceReviewReply",
  "contextualMessage",
  "diasporaAidQuestion",
  "diasporaAidAnswer",
  "diasporaAidMission",
  "diasporaMentorProfile",
  "diasporaMentoringRequest",
  "diasporaKitResource",
  "diasporaJobOffer",
  "diasporaTalentProfile",
  "diasporaJobApplication",
] as const satisfies readonly ModerationSurface[]

/**
 * Les contenus de DIASPORA.GA relus d'office tant qu'aucune règle n'est posée pour leur nature
 * (vérifié dans le moteur le 10/11/2026) : les évènements d'association (nature `event`), les avis,
 * les réponses d'une page à un avis et les ajouts à la galerie d'un évènement (nature `post`).
 * Une règle posée sur la nature les soumet à CETTE règle ; pour `event` et `post`, elle vaut aussi
 * pour les évènements personnels et pour toutes les publications.
 */
export const HELD_CONTENTS = [
  { content: "associationEvents", surface: "event" },
  { content: "reviews", surface: "serviceReview" },
  { content: "reviewReplies", surface: "serviceReviewReply" },
  { content: "eventGallery", surface: "post" },
] as const satisfies readonly { readonly content: string; readonly surface: ModerationSurface }[]
export type HeldContent = (typeof HELD_CONTENTS)[number]["content"]

/** Le contenu relu d'office que soumet à la règle une rubrique, s'il en est un. */
export function heldContentOf(surface: ModerationSurface): HeldContent | null {
  return HELD_CONTENTS.find((row) => row.surface === surface)?.content ?? null
}

/** Le mot tel que le moteur le garde (normalisé), ou `null` s'il n'est pas admissible. */
export function admissibleTerm(term: string): string | null {
  return admissibleBlockedTerm(term)
}

/** Une fenêtre de cadence dite dans l'unité la plus ronde : heures, minutes, sinon secondes. */
export function windowUnit(windowMs: number): { readonly unit: "hours" | "minutes" | "seconds"; readonly count: number } {
  if (windowMs >= HOUR_MS && windowMs % HOUR_MS === 0) return { unit: "hours", count: windowMs / HOUR_MS }
  if (windowMs >= MINUTE_MS && windowMs % MINUTE_MS === 0) return { unit: "minutes", count: windowMs / MINUTE_MS }
  return { unit: "seconds", count: Math.round(windowMs / 1000) }
}

/** La fenêtre en minutes pour le formulaire, ramenée dans les bornes de l'écran. */
export function windowMinutesOf(windowMs: number): number {
  return Math.min(WINDOW_MINUTES.max, Math.max(WINDOW_MINUTES.min, Math.round(windowMs / MINUTE_MS)))
}

/** La fenêtre saisie en minutes, telle que le moteur la reçoit (millisecondes). */
export function windowMsOf(minutes: number): number {
  return minutes * MINUTE_MS
}

/** Les natures de contenu que le moteur modère (filtre des recours, nature traitée par une équipe). */
export const SURFACES = MODERATION_SURFACES
