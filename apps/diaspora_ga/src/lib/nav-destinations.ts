/**
 * La table des destinations (UX-05) — module PUR : chaque adresse de la table des routes se range
 * sous UNE entrée de la navigation de membre, ou reste hors de la coque.
 *
 *  · une destination de la barre, cinq au plus (Fil, Membres, Services, Communautés, Messages) ;
 *  · une entrée personnelle du menu du compte, sous l'avatar, entrées des responsables comprises ;
 *  · une entrée du compte, sous l'avatar (profil, réglages) ;
 *  · dans la coque mais sous AUCUNE entrée : la page d'un live, plein écran dans les applications
 *    de référence (antsia.ga ne pose ni rail ni barre sur un direct ; administration.ga retire le
 *    chrome de l'espace sur sa page de conférence, « un lieu du réseau sans onglet ») ;
 *  · hors de la coque : la porte, les pages publiques et « Mes données » hors adhésion.
 *
 * Menu léger (CH-816, lot P1) : la barre n'offre une destination que si elle a de quoi montrer.
 * Fil et Membres toujours (Membres est la destination `explore`, servie à `/explorer`) ;
 * Services avec son module ; Communautés dès qu'un module rangé sous elle est ouvert (dérivé de
 * cette table et de celle des fonctionnalités, `lib/network-features`) ; Messages avec iCom. Les
 * entrées personnelles ne vivent plus dans le rail du bureau : seulement dans le menu du compte,
 * chacune quand elle a un contenu ou que son module est ouvert (la coque en juge).
 *
 * Rattachements de la décision 5 du plan 02, accordée par le propriétaire : entraide, kit
 * d'arrivée, mentorat, emploi, talents, agenda, groupes et évènements sous Communautés ; annuaire
 * des pages, page et profil d'un autre membre sous Membres. Ce module n'écrit aucune adresse : il
 * compose chaque gabarit par la table des routes. La coque le lit pour poser `aria-current` ; le
 * mobile le reprendra (plan 16). Un test de complétude fait échouer toute route sans rangement.
 */
import type { CountryCode } from "@diaspora-ga/domain"

import { routes } from "./routes"

/**
 * Les destinations de la barre, dans l'ordre du rendu (DG-005) : cinq au plus, chacune offerte
 * selon sa règle (la coque). `explore` s'affiche « Membres ».
 */
export const PRIMARY_DESTINATIONS = ["feed", "explore", "services", "communities", "messages"] as const
export type PrimaryDestination = (typeof PRIMARY_DESTINATIONS)[number]

/** Les entrées personnelles du menu du compte, puis celles réservées aux responsables. */
export const PERSONAL_DESTINATIONS = [
  "myRequests",
  "myActivity",
  "myAssociations",
  "myApplications",
  "myMentoring",
  "relations",
  "bookmarks",
  "sponsor",
  "moderation",
] as const
export type PersonalDestination = (typeof PERSONAL_DESTINATIONS)[number]

/** Le compte, sous l'avatar. */
export const ACCOUNT_DESTINATIONS = ["profile", "settings"] as const
export type AccountDestination = (typeof ACCOUNT_DESTINATIONS)[number]

/** L'entrée de navigation sous laquelle une page de membre se range. */
export type NavDestination = PrimaryDestination | PersonalDestination | AccountDestination

/** Pourquoi une adresse reste hors de la coque de membre. */
export type OutsideShell = "door" | "public" | "outsideMembership"

export type RouteKey = keyof typeof routes

/**
 * Le rangement d'une adresse de la table : une entrée, un profil (le sien ou celui d'un autre), une
 * page de la coque qui ne relève d'aucune entrée (`standalone` : rien n'y est « courant »), ou hors
 * de la coque.
 */
export type RouteHome =
  | { readonly kind: "member"; readonly path: string; readonly destination: NavDestination }
  | { readonly kind: "person"; readonly path: string }
  | { readonly kind: "standalone"; readonly path: string }
  | { readonly kind: "outside"; readonly reason: OutsideShell }

/**
 * Un segment variable des adresses de la table (identifiant, pays) : il tient la place de la valeur.
 * Typé `string` : il passe aussi pour un code pays, le temps de composer le gabarit du hub.
 */
const SEGMENT: string = "segment"

/** Le chemin d'une adresse, sans requête ni ancre. */
function pathOf(href: string): string {
  const end = href.search(/[?#]/)
  return end === -1 ? href : href.slice(0, end)
}

/** Les segments d'un chemin ; une barre finale (`/fil/`) désigne la même page. */
function segmentsOf(path: string): string[] {
  const segments = pathOf(path).split("/").slice(1)
  if (segments.length > 1 && segments.at(-1) === "") segments.pop()
  return segments
}

const member = (destination: NavDestination, href: string): RouteHome => ({ kind: "member", path: pathOf(href), destination })
const person = (href: string): RouteHome => ({ kind: "person", path: pathOf(href) })
const standalone = (href: string): RouteHome => ({ kind: "standalone", path: pathOf(href) })
const outside = (reason: OutsideShell): RouteHome => ({ kind: "outside", reason })

/**
 * La table : une ligne par adresse de la table des routes, ni plus ni moins (le type l'exige, le
 * test de complétude le vérifie). Les adresses qui partagent un chemin (ancres des réglages,
 * onglets du profil) se rangent sous la même entrée.
 */
export const ROUTE_DESTINATIONS: Readonly<Record<RouteKey, RouteHome>> = {
  // La porte : entrée, inscription, sortie, accueil d'un nouveau membre.
  home: outside("door"),
  enter: outside("door"),
  consulatePass: outside("door"),
  register: outside("door"),
  enterFromConsulate: outside("door"),
  enterAfterSignOut: outside("door"),
  enterIdn: outside("door"),
  enterCode: outside("door"),
  welcome: outside("door"),
  // Fil : une publication seule, les statuts et la découverte en relèvent.
  feed: member("feed", routes.feed()),
  feedDiscovery: member("feed", routes.feedDiscovery()),
  post: member("feed", routes.post(SEGMENT)),
  stories: member("feed", routes.stories()),
  story: member("feed", routes.story(SEGMENT)),
  newStory: member("feed", routes.newStory()),
  // La page des notifications (NP-04) relève du fil, comme le relevé des notifications du moteur
  // (`reseau-agent-nav` : « notifications » aboutit au fil) ; la cloche, elle, reste dans l'en-tête.
  notifications: member("feed", routes.notifications()),
  // DS-14 : la porte d'ouverture d'une notification poussée, sous la page des notifications.
  openNotification: member("feed", routes.openNotification()),
  // Membres (destination `explore`) : l'annuaire des membres et des pages, une page et ce qu'on y fait sans la gérer.
  explore: member("explore", routes.explore()),
  members: member("explore", routes.members()),
  pages: member("explore", routes.pages()),
  page: member("explore", routes.page(SEGMENT)),
  pageServices: member("explore", routes.pageServices(SEGMENT)),
  pageOpenJobs: member("explore", routes.pageOpenJobs(SEGMENT)),
  pageClaim: member("explore", routes.pageClaim(SEGMENT)),
  // La page d'un live (CH-817, servie l'interrupteur du direct ouvert) : dans la coque depuis le
  // 26/11/2026 (page large), mais sous AUCUNE entrée — ni Membres, ni Fil. Les applications de
  // référence n'y marquent rien : antsia.ga n'y pose ni rail ni barre (`isLiveSessionPath`),
  // administration.ga y retire le chrome de l'espace et n'y donne aucun onglet (« un lieu du
  // réseau sans onglet »). Seul le VOLET des lives se range sous Découvrir dans le moteur.
  conference: standalone(routes.conference(SEGMENT)),
  // Un profil : le sien relève du compte, celui d'un autre membre de Membres.
  profile: person(routes.profile(SEGMENT)),
  profilePreview: person(routes.profilePreview(SEGMENT)),
  profileTab: person(routes.profileTab(SEGMENT, "publications")),
  album: person(routes.album(SEGMENT, SEGMENT)),
  editAlbum: person(routes.editAlbum(SEGMENT, SEGMENT)),
  newAlbum: person(routes.newAlbum(SEGMENT)),
  // Services : le catalogue et ses offres.
  services: member("services", routes.services()),
  serviceOffer: member("services", routes.serviceOffer(SEGMENT)),
  // Communautés : les hubs pays (socle, joignables aussi par « Mon pays ») et la vie communautaire du pays.
  communities: member("communities", routes.communities()),
  hub: member("communities", routes.hub(SEGMENT as CountryCode)),
  hubWelcome: member("communities", routes.hubWelcome(SEGMENT as CountryCode)),
  agenda: member("communities", routes.agenda()),
  associationGroup: member("communities", routes.associationGroup(SEGMENT)),
  associationEvent: member("communities", routes.associationEvent(SEGMENT, SEGMENT)),
  mutualAid: member("communities", routes.mutualAid()),
  mutualAidItem: member("communities", routes.mutualAidItem(SEGMENT)),
  arrivalKit: member("communities", routes.arrivalKit()),
  arrivalKitResource: member("communities", routes.arrivalKitResource(SEGMENT)),
  mentoring: member("communities", routes.mentoring()),
  mentorProfile: member("communities", routes.mentorProfile(SEGMENT)),
  jobs: member("communities", routes.jobs()),
  jobOffer: member("communities", routes.jobOffer(SEGMENT)),
  talents: member("communities", routes.talents()),
  // Messages : la messagerie et ses sous-adresses, mises en relation comprises.
  messages: member("messages", routes.messages()),
  contextualConversation: member("messages", routes.contextualConversation(SEGMENT)),
  // IM-04 : une conversation de groupe et le journal d'appels d'iCom.
  groupConversation: member("messages", routes.groupConversation(SEGMENT)),
  // IC-09 du moteur : une conversation à deux, ouverte depuis l'avis d'un message reçu.
  personalConversation: member("messages", routes.personalConversation(SEGMENT)),
  callJournal: member("messages", routes.callJournal()),
  // Les entrées personnelles (menu du compte). `myActivity` s'affiche « Mes pages ».
  myServiceRequests: member("myRequests", routes.myServiceRequests()),
  serviceRequest: member("myRequests", routes.serviceRequest(SEGMENT)),
  myActivity: member("myActivity", routes.myActivity()),
  activityRequest: member("myActivity", routes.activityRequest(SEGMENT)),
  newPage: member("myActivity", routes.newPage()),
  // Gérer une page, ses décisions et ses adhérents relève de « Mes pages », la lire de Membres.
  pageManage: member("myActivity", routes.pageManage(SEGMENT)),
  pageDecisions: member("myActivity", routes.pageDecisions(SEGMENT)),
  associationMembers: member("myActivity", routes.associationMembers(SEGMENT)),
  myAssociations: member("myAssociations", routes.myAssociations()),
  myApplications: member("myApplications", routes.myApplications()),
  myMentoring: member("myMentoring", routes.myMentoring()),
  relations: member("relations", routes.relations()),
  bookmarks: member("bookmarks", routes.bookmarks()),
  sponsor: member("sponsor", routes.sponsor()),
  sponsorFor: member("sponsor", routes.sponsorFor(SEGMENT)),
  moderationDesk: member("moderation", routes.moderationDesk()),
  // Le compte : les réglages, leurs ancres et la vérification consulaire.
  settings: member("settings", routes.settings()),
  settingsFeed: member("settings", routes.settingsFeed()),
  settingsImages: member("settings", routes.settingsImages()),
  settingsDirectory: member("settings", routes.settingsDirectory()),
  settingsConsents: member("settings", routes.settingsConsents()),
  settingsDeviceNotifications: member("settings", routes.settingsDeviceNotifications()),
  settingsData: member("settings", routes.settingsData()),
  settingsReports: member("settings", routes.settingsReports()),
  settingsDecisions: member("settings", routes.settingsDecisions()),
  sponsorHelp: member("settings", routes.sponsorHelp()),
  attestation: member("settings", routes.attestation()),
  // Hors de la coque : « Mes données » pour toute personne connectée, et les pages publiques.
  myData: outside("outsideMembership"),
  demo: outside("public"),
  charte: outside("public"),
  legalNotice: outside("public"),
  privacy: outside("public"),
  terms: outside("public"),
  communityRules: outside("public"),
  // Une règle précise (MD-05) : une ancre de la page publique des règles.
  communityRule: outside("public"),
  contact: outside("public"),
  health: outside("public"),
  healthApi: outside("public"),
  // Les fichiers de l'application installée (MO-02, MO-05) : servis à tous, aucune page de membre.
  appIcon: outside("public"),
  serviceWorker: outside("public"),
  offline: outside("public"),
}

interface Row {
  readonly key: RouteKey
  readonly segments: readonly string[]
  /** Les segments écrits en toutes lettres : à longueur égale, le gabarit le plus précis l'emporte. */
  readonly literals: number
  readonly home: Exclude<RouteHome, { readonly kind: "outside" }>
}

const ROWS: readonly Row[] = (Object.entries(ROUTE_DESTINATIONS) as [RouteKey, RouteHome][]).flatMap(([key, home]): Row[] => {
  if (home.kind === "outside") return []
  const segments = segmentsOf(home.path)
  return [{ key, segments, literals: segments.filter((segment) => !segment.includes(SEGMENT)).length, home }]
})

/** Un segment du gabarit : en toutes lettres, ou variable (avec son préfixe, comme `@` d'un profil). */
function segmentMatches(expected: string, actual: string): boolean {
  const at = expected.indexOf(SEGMENT)
  if (at === -1) return expected === actual
  const prefix = expected.slice(0, at)
  const suffix = expected.slice(at + SEGMENT.length)
  return actual.length > prefix.length + suffix.length && actual.startsWith(prefix) && actual.endsWith(suffix)
}

/** Le gabarit couvre-t-il ce chemin, lui-même ou une page sous lui (segment entier comparé) ? */
function covers(row: Row, segments: readonly string[]): boolean {
  return row.segments.length <= segments.length && row.segments.every((expected, index) => segmentMatches(expected, segments[index] ?? ""))
}

/** La ligne de la coque qui couvre ce chemin : le gabarit le plus long, puis le plus précis. */
function bestRowOf(segments: readonly string[]): Row | null {
  let best: Row | null = null
  for (const row of ROWS) {
    if (!covers(row, segments)) continue
    if (best === null || row.segments.length > best.segments.length || (row.segments.length === best.segments.length && row.literals > best.literals)) {
      best = row
    }
  }
  return best
}

/**
 * L'adresse de la table dont relève ce chemin de membre, ou `null` (hors de la coque, ou
 * inconnu) : même résolution que l'entrée de navigation. `/pages/<page>/gerer` relève de
 * `pageManage`, `/pages/<page>` de `page`.
 */
export function routeKeyOf(pathname: string): RouteKey | null {
  return bestRowOf(segmentsOf(pathname))?.key ?? null
}

/**
 * L'entrée de navigation dont relève ce chemin, ou `null` (hors de la coque, page de la coque sous
 * aucune entrée, ou inconnu). Le gabarit le plus long qui le couvre l'emporte : `/pages/<page>/gerer`
 * relève de « Mes pages », `/pages/<page>` de Membres, `/messages/<conversation>` de Messages ;
 * `/direct/<session>` (la page d'un live) et `/servicesx` d'aucune.
 */
export function navDestinationOf(pathname: string, ownHandle: string | null): NavDestination | null {
  const segments = segmentsOf(pathname)
  const best = bestRowOf(segments)
  if (best === null) return null
  if (best.home.kind === "member") return best.home.destination
  if (best.home.kind === "standalone") return null
  const own = ownHandle === null ? undefined : segmentsOf(routes.profile(ownHandle))[0]
  return own !== undefined && segments[0] === own ? "profile" : "explore"
}
