/**
 * Les fonctionnalités activables du réseau (ADR-0041 du moteur) — PORT de données.
 *
 * DIASPORA.GA sert d'emblée son socle : la porte et l'accueil, le fil (publier,
 * commenter, réagir, partager), les pays et leurs actus, les personnes, iCom, les
 * notifications, le compte, la confiance et les pages légales. Huit modules restent
 * dans le code, FERMÉS tant que l'administration du réseau ne les a pas ouverts :
 * le moteur les refuse (refus indistinct) et l'application ne les monte pas.
 *
 * L'application n'invente rien : un module fermé est une CAPACITÉ ABSENTE de la
 * source (`gateSource`). Les écrans qui lisent une capacité facultative s'en
 * passent déjà ; la navigation, elle, lit `useFeatureGate()`.
 */
import {
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURES,
  type NetworkFeature,
  networkFeatureToggleRefusal,
} from "@antsia/social-domain/networkFeatures"

import type { ActionResult, DiasporaGaDataSource } from "./port"
import type { Loadable } from "./types"

export { NETWORK_FEATURE_PARENTS, NETWORK_FEATURES, type NetworkFeature }

/** Le motif d'une bascule, comme au moteur (`NETWORK_FEATURE_REASON_MIN`) et au guichet de modération. */
export const NETWORK_FEATURE_REASON_MIN = 10
export const NETWORK_FEATURE_REASON_MAX = 500

/** Codes de refus propres aux bascules (fragment `network-features`). */
export const NETWORK_FEATURES_ERROR_CODES = [
  // Ouvrir une fonctionnalité qui vit sur les pages, pages fermées.
  "network_feature_requires_parent",
  // Fermer les pages quand l'une de leurs fonctionnalités est encore ouverte.
  "network_feature_has_open_children",
  // Motif trop court ou trop long.
  "network_feature_reason_length",
] as const
export type NetworkFeaturesErrorCode = (typeof NETWORK_FEATURES_ERROR_CODES)[number]

/** L'état d'une fonctionnalité, tel que l'administrateur du réseau le lit. */
export interface NetworkFeatureState {
  readonly feature: NetworkFeature
  /** La décision posée (fermée sans décision). */
  readonly enabled: boolean
  /** L'état servi : décision ouverte ET fonctionnalité exigée ouverte. */
  readonly open: boolean
  /** La fonctionnalité qu'elle exige ouverte, ou `null`. */
  readonly requires: NetworkFeature | null
  readonly updatedAt: number | null
}

export interface NetworkFeatureToggleInput {
  readonly feature: NetworkFeature
  readonly enabled: boolean
  readonly reason: string
}

export interface NetworkFeaturesCapability {
  /** Les fonctionnalités OUVERTES du réseau pour la personne ; aucune hors adhésion. */
  useOpen(): Loadable<readonly NetworkFeature[]>
  /** L'administration du réseau : l'état des huit ; refus indistinct pour tout autre membre. */
  useSettings(): Loadable<readonly NetworkFeatureState[]>
  /** Ouvrir ou fermer une fonctionnalité, motif obligatoire ; `changed` faux si rien n'était à décider. */
  setFeature(input: NetworkFeatureToggleInput): Promise<ActionResult<{ readonly changed: boolean }>>
}

/**
 * Les capacités de la source qu'une fonctionnalité GOUVERNE : fermée, elles sont
 * retirées de la source montée. Les capacités du socle (droits personnels,
 * signalements, modération, conversations, réglages d'appel) n'y figurent pas.
 */
export const FEATURE_CAPABILITIES = {
  pages: ["pages", "pagePublications", "pageAdmin", "associations", "pageDecisions"],
  groupsAndEvents: ["associationGroups", "associationEvents"],
  services: ["services", "serviceRequests", "serviceReviews"],
  jobs: ["jobs"],
  mutualAid: ["mutualAid"],
  mentoring: ["mentoring"],
  arrivalKit: ["arrivalKit"],
  pilotMetrics: ["pilotMetrics"],
} as const satisfies Readonly<Record<NetworkFeature, readonly (keyof DiasporaGaDataSource)[]>>

/** Une liste lue (moteur, démonstration) ramenée aux clés connues, dans l'ordre des clés. */
export function knownFeatures(values: readonly string[]): readonly NetworkFeature[] {
  return NETWORK_FEATURES.filter((feature) => values.includes(feature))
}

/**
 * La source telle que l'application la monte : les capacités des fonctionnalités
 * fermées retirées, les clés ouvertes et l'état de leur lecture posés. `ready`
 * faux : la lecture des fonctionnalités est en cours (les adresses d'un module
 * attendent, la navigation ne les offre pas encore).
 */
export function gateSource(source: DiasporaGaDataSource, open: readonly NetworkFeature[], ready = true): DiasporaGaDataSource {
  const closed = new Set<string>()
  for (const feature of NETWORK_FEATURES) {
    if (open.includes(feature)) continue
    for (const capability of FEATURE_CAPABILITIES[feature]) closed.add(capability)
  }
  const kept = Object.fromEntries(Object.entries(source).filter(([key]) => !closed.has(key)))
  return { ...(kept as unknown as DiasporaGaDataSource), openFeatures: knownFeatures(open), featuresReady: ready }
}

/** Ce que la navigation et les adresses lisent. */
export interface FeatureGate {
  /** Faux tant que la lecture des fonctionnalités ouvertes n'a pas répondu. */
  readonly ready: boolean
  isOpen(feature: NetworkFeature): boolean
}

/**
 * La garde d'une source : une source NON gardée (montée sans `gateSource`, comme dans
 * les tests d'un écran) sert tout ce qu'elle porte ; une source gardée, ses seules
 * fonctionnalités ouvertes.
 */
export function featureGateOf(source: Pick<DiasporaGaDataSource, "openFeatures" | "featuresReady"> | null): FeatureGate {
  const open = source?.openFeatures
  return {
    ready: source?.featuresReady ?? true,
    isOpen: (feature) => open === undefined || open.includes(feature),
  }
}

/** Le refus d'une bascule, jugé comme au moteur (motif, puis dépendance) ; `null` : admise. */
export function networkFeatureToggleError(input: NetworkFeatureToggleInput, open: readonly NetworkFeature[]): NetworkFeaturesErrorCode | null {
  const reason = input.reason.trim().length
  if (reason < NETWORK_FEATURE_REASON_MIN || reason > NETWORK_FEATURE_REASON_MAX) return "network_feature_reason_length"
  const refusal = networkFeatureToggleRefusal({ feature: input.feature, enabled: input.enabled, open })
  if (refusal === "NETWORK_FEATURE_REQUIRES_PARENT") return "network_feature_requires_parent"
  if (refusal === "NETWORK_FEATURE_HAS_OPEN_CHILDREN") return "network_feature_has_open_children"
  return null
}
