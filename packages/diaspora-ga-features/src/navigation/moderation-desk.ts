/**
 * Le bureau de modération de diaspora.ga — son adresse et ses onglets, partagés par la table des
 * routes de l'application des membres (`apps/diaspora_ga/src/lib/routes.ts`, `moderationDesk`) et
 * par l'application d'administration, qui y renvoie depuis son tableau de bord (liens « File de
 * modération » et « Pages à vérifier », fiche CH-815 § 4.2). Une seule écriture de l'adresse pour
 * les deux applications, sans que l'administration importe l'application des membres ; l'origine
 * de diaspora.ga vient toujours de l'environnement de l'application qui fait le lien.
 */

/** Les onglets du bureau : la file de modération, et les pages à vérifier. */
export const MODERATION_DESK_TABS = ["file", "pages"] as const
export type ModerationDeskTab = (typeof MODERATION_DESK_TABS)[number]

const MODERATION_DESK = "/moderation"
/** Le paramètre qui porte l'onglet (un paramètre de filtre de la table des routes des membres). */
const TAB_PARAM = "onglet"

/** Le chemin du bureau de modération, sur un onglet ou non (sans origine). */
export function moderationDeskPath(tab?: ModerationDeskTab): string {
  return tab ? `${MODERATION_DESK}?${new URLSearchParams({ [TAB_PARAM]: tab }).toString()}` : MODERATION_DESK
}
