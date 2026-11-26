/**
 * Les fonctionnalités activables du réseau (ADR-0041 du moteur) — PORT de données.
 *
 * DIASPORA.GA sert d'emblée son socle : la porte et l'accueil, le fil (publier,
 * commenter, réagir, partager), les pays et leurs actus, les personnes, iCom, les
 * notifications, le compte, la confiance et les pages légales. Neuf modules restent
 * dans le code, FERMÉS tant que l'administration du réseau ne les a pas ouverts :
 * le moteur les refuse (refus indistinct) et l'application ne les monte pas. Le
 * neuvième, `consulateGateway` (CH-863), est un module d'AFFICHAGE : il ne garde
 * aucune fonction du moteur ni aucune capacité de la source, il règle la seule
 * entrée « consulat.ga » du menu du compte (`@diaspora-ga/features/navigation`).
 *
 * L'application n'invente rien : un module fermé est une CAPACITÉ ABSENTE de la
 * source (`gateSource`). Les écrans qui lisent une capacité facultative s'en
 * passent déjà ; la navigation, elle, lit `useFeatureGate()`. Les modules s'ouvrent
 * et se ferment dans l'application d'administration du réseau (fiche CH-815, D5) :
 * le site des membres ne fait que lire les modules ouverts.
 */
import {
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURES,
  type NetworkFeature,
} from "@antsia/social-domain/networkFeatures"

import type { DiasporaGaDataSource } from "./port"
import type { Loadable } from "./types"

export { NETWORK_FEATURE_PARENTS, NETWORK_FEATURES, type NetworkFeature }

export interface NetworkFeaturesCapability {
  /** Les fonctionnalités OUVERTES du réseau pour la personne ; aucune hors adhésion. */
  useOpen(): Loadable<readonly NetworkFeature[]>
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
  // La mesure du pilote ne sert plus rien au site des membres (fiche CH-815, lot A6) : elle se lit dans l'administration.
  pilotMetrics: [],
  // CH-863 : un module d'affichage (le lien sortant « consulat.ga » du menu du compte) — aucune capacité, aucune adresse.
  consulateGateway: [],
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
