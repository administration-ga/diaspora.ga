/**
 * Les adresses du menu des membres — module PUR. La règle du menu (quelles entrées, dans quel
 * ordre, pour quels modules et quelle situation) vit dans `@diaspora-ga/features/navigation`,
 * partagée avec l'aperçu d'admin.diaspora.ga (fiche CH-815, § 5) ; diaspora.ga y ajoute ce qui
 * n'appartient qu'à lui : l'adresse de chaque entrée, composée par sa table des routes.
 */
import type { MemberCreateEntry, MemberMenuEntry, MemberMenuRouteKey } from "@diaspora-ga/features/navigation"

import { routes } from "./routes"

/** Une adresse par clé de route du menu ; le profil est celui du membre (son identifiant public). */
export const MEMBER_MENU_HREFS: { readonly [Key in Exclude<MemberMenuRouteKey, "newPage">]: (handle: string) => string } = {
  feed: () => routes.feed(),
  explore: () => routes.explore(),
  services: () => routes.services(),
  communities: () => routes.communities(),
  messages: () => routes.messages(),
  profile: (handle) => routes.profile(handle),
  settings: () => routes.settings(),
  myServiceRequests: () => routes.myServiceRequests(),
  myActivity: () => routes.myActivity(),
  myAssociations: () => routes.myAssociations(),
  myApplications: () => routes.myApplications(),
  myMentoring: () => routes.myMentoring(),
  relations: () => routes.relations(),
  bookmarks: () => routes.bookmarks(),
  sponsor: () => routes.sponsor(),
  moderationDesk: () => routes.moderationDesk(),
  pilotDashboard: () => routes.pilotDashboard(),
  settingsData: () => routes.settingsData(),
  legalNotice: () => routes.legalNotice(),
  privacy: () => routes.privacy(),
  terms: () => routes.terms(),
  communityRules: () => routes.communityRules(),
  contact: () => routes.contact(),
  charte: () => routes.charte(),
  newStory: () => routes.newStory(),
}

/** L'adresse d'une entrée de la barre ou du menu du compte. */
export function memberMenuHref(entry: Pick<MemberMenuEntry, "routeKey">, handle: string): string {
  // Aucune entrée de la barre ni du compte ne mène à l'inscription d'une page : seul « Créer » y mène.
  if (entry.routeKey === "newPage") return routes.newPage()
  return MEMBER_MENU_HREFS[entry.routeKey](handle)
}

/** L'adresse d'un format de « Créer » : une actu, ou l'inscription d'une page de cette nature. */
export function memberCreateHref(entry: Pick<MemberCreateEntry, "routeKey" | "pageKind">): string {
  return entry.routeKey === "newPage" ? routes.newPage(entry.pageKind ?? undefined) : routes.newStory()
}
