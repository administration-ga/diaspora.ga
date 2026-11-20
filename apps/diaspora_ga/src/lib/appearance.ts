import { DIASPORA_GA_NETWORK_SLUG } from "@diaspora-ga/domain"

/**
 * L'apparence de diaspora.ga (19/10/2026, demande du propriétaire) : le mode
 * (Système, Clair, Sombre) et le thème, au choix du membre. Deux thèmes :
 *   - « Sable », la charte de DIASPORA.GA (`data-charte="diaspora-ga"`), premier de la
 *     liste, donc thème par défaut ;
 *   - « Gaboma », le thème du réseau ANTSIA, sur la structure de DIASPORA.GA
 *     (`data-charte="diaspora-ga-gaboma"`, couleurs seulement).
 * Une seule configuration pour le fournisseur d'apparence du moteur
 * (`components/providers.tsx`) et son script d'amorçage
 * (`components/appearance-boot-script.tsx`) : l'un relit exactement ce que l'autre a
 * posé, sous le préfixe du réseau (`antsia:diaspora-ga:`, celui des magasins de la
 * coque). Le choix reste sur l'appareil, comme le mode.
 *
 * Module serveur autant que client : aucune dépendance React.
 */
export const DIASPORA_GA_THEME_IDS = ["sable", "gaboma"] as const
export type DiasporaGaThemeId = (typeof DIASPORA_GA_THEME_IDS)[number]

/** La charte (`data-charte`) de chaque thème ; les deux fichiers vivent dans `@antsia/ui/themes`. */
const CHARTES = {
  sable: "diaspora-ga",
  gaboma: "diaspora-ga-gaboma",
} as const satisfies Record<DiasporaGaThemeId, string>

export const APPEARANCE = {
  storagePrefix: `antsia:${DIASPORA_GA_NETWORK_SLUG}:`,
  themes: DIASPORA_GA_THEME_IDS.map((id) => ({ id, charte: CHARTES[id] })),
} as const

/** La charte de Sable, celle que la mise en page sert avant toute préférence. */
export const DEFAULT_CHARTE = CHARTES.sable

export function isDiasporaGaThemeId(value: unknown): value is DiasporaGaThemeId {
  return typeof value === "string" && (DIASPORA_GA_THEME_IDS as readonly string[]).includes(value)
}
