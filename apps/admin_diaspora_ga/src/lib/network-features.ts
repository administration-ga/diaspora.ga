/**
 * Les modules du réseau tels que l'administration les lit (ADR-0041 du moteur, fiche CH-815
 * § 4.2 et § 4.3) — module PUR : l'état d'une carte, le refus de dépendance dit avant le
 * geste, la dernière décision de chaque module, et la situation de membre de l'aperçu.
 * Les règles de dépendance sont celles du domaine du moteur (`networkFeatureToggleRefusal`),
 * jamais réécrites ici ; le menu, celui de `@diaspora-ga/features/navigation`.
 */
import { networkFeatureChildren, networkFeatureToggleRefusal, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import type { api } from "@convex/_generated/api"
import type { MemberMenuSituation } from "@diaspora-ga/features/navigation"
import type { FunctionReturnType } from "convex/server"

/** L'état d'un module, tel que `modules/networks/features.settings` le rend. */
export type FeatureState = FunctionReturnType<typeof api.modules.networks.features.settings>[number]

/** La dernière décision d'un module, telle que `modules/networks/features.lastDecisions` la rend (un module jamais décidé n'y figure pas). */
export type LastDecision = FunctionReturnType<typeof api.modules.networks.features.lastDecisions>[number]

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

/** La dernière décision d'un module, prête à l'affichage : motif, auteur, et si elle vient de la console de la plateforme. */
export interface FeatureDecision {
  readonly reason: string
  readonly actorName: string | null
  readonly viaConsole: boolean
}

/**
 * Les décisions rendues par `features.lastDecisions`, indexées par module. Un module absent de la
 * lecture n'a pas de décision au journal (jamais décidé, ou posé hors bascule) : rien n'est inventé.
 */
export function decisionsByFeature(entries: readonly LastDecision[]): ReadonlyMap<NetworkFeature, FeatureDecision> {
  return new Map(
    entries.map((entry) => [
      entry.feature,
      {
        reason: entry.reason,
        actorName: entry.actor?.displayName ?? entry.actor?.handle ?? null,
        viaConsole: entry.capacity === "platform_admin" || entry.capacity === "platform_operator",
      },
    ]),
  )
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
