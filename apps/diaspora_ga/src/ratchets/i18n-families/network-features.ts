/**
 * Les familles dynamiques des fonctionnalités activables du réseau (ADR-0041 du moteur) : le nom et
 * la description de chaque module, dans l'espace `diaspora-ga`. Le bureau de diaspora.ga ne les
 * montre plus (fiche CH-815, D5) : la section « Modules » d'admin.diaspora.ga les lit.
 */
import { NETWORK_FEATURES } from "@diaspora-ga/features/data"

export const FAMILIES: readonly string[] = NETWORK_FEATURES.flatMap((feature) => [
  `networkFeatures.names.${feature}`,
  `networkFeatures.descriptions.${feature}`,
])
