/** Les familles dynamiques des fonctionnalités activables du réseau (ADR-0041 du moteur). */
import { NETWORK_FEATURES } from "@diaspora-ga/features/data"

export const FAMILIES: readonly string[] = NETWORK_FEATURES.flatMap((feature) => [
  `networkFeatures.names.${feature}`,
  `networkFeatures.descriptions.${feature}`,
])
