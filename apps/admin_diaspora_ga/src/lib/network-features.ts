/**
 * Les modules du réseau tels que l'administration les lit (ADR-0041 du moteur, fiche CH-815
 * § 4.2 et § 4.3) — module PUR : l'état d'une carte, le refus de dépendance dit avant le
 * geste, la dernière décision retrouvée au journal, et la situation de membre de l'aperçu.
 * Les règles de dépendance sont celles du domaine du moteur (`networkFeatureToggleRefusal`),
 * jamais réécrites ici ; le menu, celui de `@diaspora-ga/features/navigation`.
 */
import { networkFeatureChildren, networkFeatureToggleRefusal, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import type { api } from "@convex/_generated/api"
import type { MemberMenuSituation } from "@diaspora-ga/features/navigation"
import type { FunctionReturnType } from "convex/server"

/** L'état d'un module, tel que `modules/networks/features.settings` le rend. */
export type FeatureState = FunctionReturnType<typeof api.modules.networks.features.settings>[number]

/** Une ligne du journal du réseau (`modules/platform/audit.paginateNetworkAudit`). */
export type NetworkAuditEntry = FunctionReturnType<typeof api.modules.platform.audit.paginateNetworkAudit>["page"][number]

/** La fenêtre du journal où l'on cherche la dernière décision de chaque module (les plus récentes d'abord). */
export const DECISION_LOOKUP_WINDOW = 100

/** Les modules SERVIS (décision ouverte et module exigé ouvert), dans l'ordre des clés. */
export function servedFeatures(rows: readonly FeatureState[]): NetworkFeature[] {
  return rows.filter((row) => row.open).map((row) => row.feature)
}

/**
 * L'état d'une carte : ouvert ; fermé parce que son module exigé est fermé (il ne peut pas
 * s'ouvrir) ; ou fermé.
 */
export type ModuleCardState = "open" | "blocked" | "closed"

export function moduleCardState(row: FeatureState, served: readonly NetworkFeature[]): ModuleCardState {
  if (row.open) return "open"
  return row.requires !== null && !served.includes(row.requires) ? "blocked" : "closed"
}

/** Pourquoi la bascule demandée est refusée d'avance : le module exigé est fermé, ou des modules qui vivent sur lui sont ouverts. */
export type ToggleBlock =
  | { readonly kind: "requiresParent"; readonly parent: NetworkFeature }
  | { readonly kind: "hasOpenChildren"; readonly children: readonly NetworkFeature[] }

/**
 * Le refus de dépendance de la bascule d'une carte (ouvrir si la décision est fermée, fermer
 * sinon), jugé comme au moteur sur les modules servis ; `null` : la bascule est admise. Le
 * moteur la rejuge de toute façon.
 */
export function toggleBlockOf(row: FeatureState, served: readonly NetworkFeature[]): ToggleBlock | null {
  const refusal = networkFeatureToggleRefusal({ feature: row.feature, enabled: !row.enabled, open: served })
  if (refusal === "NETWORK_FEATURE_REQUIRES_PARENT" && row.requires !== null) return { kind: "requiresParent", parent: row.requires }
  if (refusal === "NETWORK_FEATURE_HAS_OPEN_CHILDREN") return { kind: "hasOpenChildren", children: networkFeatureChildren(row.feature).filter((child) => served.includes(child)) }
  return null
}

/** La dernière décision d'un module, retrouvée au journal : motif, auteur, et si elle vient de la console de la plateforme. */
export interface FeatureDecision {
  readonly reason: string | null
  readonly actorName: string | null
  readonly viaConsole: boolean
}

/**
 * Les décisions retrouvées dans une page du journal du réseau : une ligne `network.feature_set`
 * du même module, du même sens, au même instant que la décision posée (`updatedAt`, écrit dans
 * la même transaction que la ligne du journal). Hors de la fenêtre lue, rien n'est inventé :
 * le module n'a pas d'entrée, la carte dit la date seule.
 */
export function decisionsOf(rows: readonly FeatureState[], entries: readonly NetworkAuditEntry[]): ReadonlyMap<NetworkFeature, FeatureDecision> {
  const found = new Map<NetworkFeature, FeatureDecision>()
  for (const row of rows) {
    if (row.updatedAt === null) continue
    const entry = entries.find(
      (candidate) =>
        candidate.action === "network.feature_set" && candidate.at === row.updatedAt && candidate.details?.feature === row.feature && candidate.details?.enabled === row.enabled,
    )
    if (entry === undefined) continue
    const reason = entry.details?.reason
    found.set(row.feature, {
      reason: typeof reason === "string" && reason.length > 0 ? reason : null,
      actorName: entry.actor?.displayName ?? null,
      viaConsole: entry.capacity === "platform_admin" || entry.capacity === "platform_operator",
    })
  }
  return found
}

// ═══════════════════════════════════════════════════════════════
// L'aperçu : la situation du membre
// ═══════════════════════════════════════════════════════════════

/** L'adhésion du membre de l'aperçu : en règle (déclarée ou vérifiée), en attente, ou suspendue. */
export const PREVIEW_MEMBERSHIPS = ["active", "pending", "suspended"] as const
export type PreviewMembership = (typeof PREVIEW_MEMBERSHIPS)[number]

/** Ce que l'aperçu laisse cocher sur la personne, en plus de son adhésion. */
export const PREVIEW_HOLDINGS = ["holdsPageRole", "holdsAssociation", "moderator"] as const
export type PreviewHolding = (typeof PREVIEW_HOLDINGS)[number]

export interface PreviewPerson {
  readonly membership: PreviewMembership
  readonly holdings: Readonly<Record<PreviewHolding, boolean>>
}

/** Un membre en règle, sans page, sans association, sans rôle : le membre le plus courant. */
export const DEFAULT_PREVIEW_PERSON: PreviewPerson = {
  membership: "active",
  holdings: { holdsPageRole: false, holdsAssociation: false, moderator: false },
}

/**
 * La situation que la coque de diaspora.ga lirait pour ce membre, sur le moteur : en règle, il
 * publie et iCom s'ouvre ; en attente, il ne publie pas encore (ni iCom ni actu) ; suspendu, ni
 * l'un ni l'autre, ni le réseau de lecture.
 */
export function previewSituation(person: PreviewPerson): MemberMenuSituation {
  const active = person.membership === "active"
  return {
    icom: active,
    canPublish: active,
    engineNetwork: person.membership !== "suspended",
    status: active ? "declaree" : person.membership === "pending" ? "en_attente" : "suspendue",
    ...person.holdings,
  }
}
