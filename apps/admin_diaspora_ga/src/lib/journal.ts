/**
 * Le journal des décisions du réseau tel que la section « Journal » le lit (fiche CH-815 § 4.2,
 * contrat A6 du moteur) — module PUR : les actions que l'administration peut filtrer, leurs
 * libellés et ceux des qualités (clés de l'espace `admin` écrites en toutes lettres, cliquet des
 * clés), le libellé neutre d'une action inconnue, et le résumé de ce qu'une décision a posé, lu
 * dans son détail borné (jamais une donnée de personne au-delà de ce que le moteur rend).
 */
import type { AuditAction, AuditCapacity } from "@antsia/social-domain/audit"
import { isNetworkFeature, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import type { api } from "@convex/_generated/api"
import type { FunctionReturnType } from "convex/server"

/** Une ligne du journal du réseau pour son administration (`platform/audit.paginateNetworkAdminAudit`). */
export type JournalEntry = FunctionReturnType<typeof api.modules.platform.audit.paginateNetworkAdminAudit>["page"][number]

/** Lignes demandées par fenêtre (le moteur en lit cinquante au plus). */
export const JOURNAL_PAGE = 20

/**
 * Les actions que l'écran nomme : toutes celles que l'administration du réseau produit depuis
 * cette application (accès, modules, responsables, équipes, règles, recours, pages officielles,
 * fondateurs), puis les gestes quotidiens de la modération du réseau qui y figurent aussi. Une
 * autre action du journal reçoit le libellé neutre. Le filtre propose ces actions, dans cet ordre.
 */
export const JOURNAL_ACTION_LABEL_KEYS = {
  "network.admin_access": "journal.action.adminAccess",
  "network.feature_set": "journal.action.featureSet",
  "membership.role_set": "journal.action.roleSet",
  "moderation.team_create": "journal.action.teamCreate",
  "moderation.team_member_set": "journal.action.teamMemberSet",
  "moderation.policy_set": "journal.action.policySet",
  "moderation.term_set": "journal.action.termSet",
  "moderation.appeal_decide": "journal.action.appealDecide",
  "page.create_official": "journal.action.pageCreateOfficial",
  "page.signatory_grant": "journal.action.signatoryGrant",
  "page.signatory_revoke": "journal.action.signatoryRevoke",
  "page.sleep": "journal.action.pageSleep",
  "page.wake": "journal.action.pageWake",
  "diaspora.founder_admit": "journal.action.founderAdmit",
  "diaspora.founder_withdraw": "journal.action.founderWithdraw",
  "moderation.report_decide": "journal.action.reportDecide",
  "moderation.content_review": "journal.action.contentReview",
  "moderation.appeal_file": "journal.action.appealFile",
  "page.claim_decide": "journal.action.claimDecide",
} as const satisfies Partial<Record<AuditAction, `journal.action.${string}`>>

export type JournalAction = keyof typeof JOURNAL_ACTION_LABEL_KEYS

/** Les actions du filtre, dans l'ordre de la table. */
export const JOURNAL_FILTER_ACTIONS = Object.keys(JOURNAL_ACTION_LABEL_KEYS) as JournalAction[]

/** Le libellé d'une action inconnue de l'écran : neutre, le code fermé du moteur à l'appui. */
export const JOURNAL_UNKNOWN_ACTION_KEY = "journal.action.other"

export function isJournalAction(action: string): action is JournalAction {
  return Object.hasOwn(JOURNAL_ACTION_LABEL_KEYS, action)
}

/** La clé du libellé d'une action ; `null` pour une action que l'écran ne nomme pas (libellé neutre). */
export function journalActionLabelKey(action: string): string | null {
  return isJournalAction(action) ? JOURNAL_ACTION_LABEL_KEYS[action] : null
}

/** À quel titre l'acte a été posé : chaque qualité du moteur. */
export const JOURNAL_CAPACITY_LABEL_KEYS = {
  platform_admin: "journal.capacity.platformAdmin",
  platform_operator: "journal.capacity.platformOperator",
  network_admin: "journal.capacity.networkAdmin",
  network_moderator: "journal.capacity.networkModerator",
  page_admin: "journal.capacity.pageAdmin",
  member: "journal.capacity.member",
  system: "journal.capacity.system",
  moderation_team_member: "journal.capacity.moderationTeamMember",
} as const satisfies Record<AuditCapacity, `journal.capacity.${string}`>

/** Le filtre de la section : toutes les actions, ou une seule (une valeur de la liste, jamais une saisie). */
export function journalFilterOf(value: string): JournalAction | null {
  return isJournalAction(value) ? value : null
}

/** Les rôles qu'un changement de rôle de réseau peut poser ou retirer. */
const ROLE_VALUES = ["member", "network_moderator", "network_admin"] as const
export type JournalRole = (typeof ROLE_VALUES)[number]

function roleOf(value: unknown): JournalRole | null {
  return ROLE_VALUES.find((role) => role === value) ?? null
}

/**
 * Ce que la décision a posé, quand son détail le dit d'une valeur fermée : le module et son
 * nouvel état, la dispense d'ancienneté, l'issue d'un recours, l'ajout ou le retrait d'un membre
 * d'équipe, l'échéance d'un sommeil, le passage d'un rôle à un autre. Rien d'autre n'est lu.
 */
export type JournalDetail =
  | { readonly kind: "feature"; readonly feature: NetworkFeature; readonly enabled: boolean }
  | { readonly kind: "seniorityWaiver" }
  | { readonly kind: "appeal"; readonly overturn: boolean }
  | { readonly kind: "teamMember"; readonly active: boolean }
  | { readonly kind: "sleepUntil"; readonly until: number }
  | { readonly kind: "role"; readonly from: JournalRole; readonly to: JournalRole }

export function journalDetailOf(entry: Pick<JournalEntry, "action" | "details">): JournalDetail | null {
  const details = entry.details
  if (details === null) return null
  switch (entry.action) {
    case "network.feature_set": {
      const { feature, enabled } = details
      return isNetworkFeature(feature) && typeof enabled === "boolean" ? { kind: "feature", feature, enabled } : null
    }
    case "diaspora.founder_admit":
      return details.seniorityWaiver === true ? { kind: "seniorityWaiver" } : null
    case "moderation.appeal_decide":
      return typeof details.overturn === "boolean" ? { kind: "appeal", overturn: details.overturn } : null
    case "moderation.team_member_set":
      return typeof details.active === "boolean" ? { kind: "teamMember", active: details.active } : null
    case "page.sleep":
      return typeof details.sleepEndsAt === "number" && Number.isFinite(details.sleepEndsAt) ? { kind: "sleepUntil", until: details.sleepEndsAt } : null
    case "membership.role_set": {
      const from = roleOf(details.from)
      const to = roleOf(details.to)
      return from !== null && to !== null ? { kind: "role", from, to } : null
    }
    default:
      return null
  }
}
