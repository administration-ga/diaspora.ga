/**
 * Les liens d'admin.diaspora.ga vers l'application des membres (fiche CH-815 § 4.2) : le bureau de
 * modération de diaspora.ga garde la file et les pages à vérifier, pour les modérateurs (D5). Le
 * chemin est celui que la table des routes des membres emploie (`@diaspora-ga/features/navigation`,
 * écrit une fois pour les deux applications) ; l'origine vient de l'environnement
 * (`NEXT_PUBLIC_MEMBERS_SITE_URL`). Sans origine lisible, aucun lien : jamais de lien mort.
 */
import { moderationDeskPath, type ModerationDeskTab } from "@diaspora-ga/features/navigation"

import { publicEnv } from "./env"

/** L'adresse absolue d'un onglet du bureau de modération de diaspora.ga ; `null` sans origine configurée. */
export function membersDeskUrl(tab: ModerationDeskTab, origin: string | null = publicEnv.membersSiteUrl): string | null {
  if (origin === null) return null
  return new URL(moderationDeskPath(tab), origin).toString()
}
