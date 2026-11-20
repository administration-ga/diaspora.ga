/**
 * Les adresses et les fonctionnalités activables du réseau (ADR-0041 du moteur) — module PUR.
 *
 * Chaque adresse de la table des routes relève du SOCLE (`null` : toujours servie) ou d'UNE
 * fonctionnalité activable. Fermée, la coque dit « introuvable » sur ses adresses et n'offre
 * aucune entrée qui y mène ; le moteur, lui, refuse ses fonctions (refus indistinct). Un test
 * de complétude fait échouer toute adresse sans classement (le type l'exige aussi).
 *
 * Socle : la porte et l'accueil, le fil, les publications, les actus, les notifications, les
 * pays et les communautés (actus du pays), les personnes, iCom, le compte, la confiance et les
 * pages légales. Les adresses d'une page relèvent des pages ; ses services, ses offres d'emploi,
 * son groupe et ses évènements relèvent de leur fonctionnalité, qui exige les pages.
 */
import type { FeatureGate, NetworkFeature } from "@diaspora-ga/features/data"

import { type RouteKey, routeKeyOf } from "./nav-destinations"

const CORE = null

export const ROUTE_FEATURES: Readonly<Record<RouteKey, NetworkFeature | null>> = {
  // La porte et l'accueil.
  home: CORE,
  enter: CORE,
  register: CORE,
  enterAfterSignOut: CORE,
  enterIdn: CORE,
  enterCode: CORE,
  welcome: CORE,
  // Le fil, les publications, les actus et les notifications.
  feed: CORE,
  feedDiscovery: CORE,
  post: CORE,
  stories: CORE,
  story: CORE,
  newStory: CORE,
  notifications: CORE,
  // Les personnes.
  explore: CORE,
  members: CORE,
  profile: CORE,
  profilePreview: CORE,
  profileTab: CORE,
  album: CORE,
  editAlbum: CORE,
  newAlbum: CORE,
  relations: CORE,
  bookmarks: CORE,
  sponsor: CORE,
  sponsorFor: CORE,
  // Le volet des conférences n'est pas servi ici (les directs restent fermés par le code).
  conference: CORE,
  // Les pays et leurs actus.
  communities: CORE,
  hub: CORE,
  hubWelcome: CORE,
  // iCom.
  messages: CORE,
  contextualConversation: CORE,
  groupConversation: CORE,
  callJournal: CORE,
  // La confiance et le compte.
  moderationDesk: CORE,
  settings: CORE,
  settingsFeed: CORE,
  settingsImages: CORE,
  settingsData: CORE,
  settingsReports: CORE,
  sponsorHelp: CORE,
  attestation: CORE,
  myData: CORE,
  // Les pages publiques et les fichiers de l'application installée.
  demo: CORE,
  charte: CORE,
  legalNotice: CORE,
  privacy: CORE,
  terms: CORE,
  communityRules: CORE,
  communityRule: CORE,
  contact: CORE,
  health: CORE,
  healthApi: CORE,
  appIcon: CORE,
  serviceWorker: CORE,
  offline: CORE,
  // Associations et entreprises : l'annuaire, une page, sa gestion, l'inscription, les adhésions.
  pages: "pages",
  page: "pages",
  pageClaim: "pages",
  newPage: "pages",
  pageManage: "pages",
  pageDecisions: "pages",
  associationMembers: "pages",
  myActivity: "pages",
  myAssociations: "pages",
  // Groupes et évènements.
  agenda: "groupsAndEvents",
  associationGroup: "groupsAndEvents",
  associationEvent: "groupsAndEvents",
  // Services : le catalogue, une offre, les demandes (du demandeur et de la page).
  services: "services",
  serviceOffer: "services",
  pageServices: "services",
  myServiceRequests: "services",
  serviceRequest: "services",
  activityRequest: "services",
  // Emploi et talents.
  jobs: "jobs",
  jobOffer: "jobs",
  talents: "jobs",
  pageOpenJobs: "jobs",
  myApplications: "jobs",
  // Entraide, mentorat, kit d'arrivée, mesure du pilote.
  mutualAid: "mutualAid",
  mutualAidItem: "mutualAid",
  mentoring: "mentoring",
  mentorProfile: "mentoring",
  myMentoring: "mentoring",
  arrivalKit: "arrivalKit",
  arrivalKitResource: "arrivalKit",
  pilotDashboard: "pilotMetrics",
}

/** La fonctionnalité dont relève ce chemin de membre, ou `null` (socle, hors de la coque, ou inconnu). */
export function featureOfPath(pathname: string): NetworkFeature | null {
  const key = routeKeyOf(pathname)
  return key === null ? null : ROUTE_FEATURES[key]
}

/** L'adresse mène-t-elle à une page servie (socle, ou module ouvert) ? Une entrée qui n'y mène pas ne s'offre pas. */
export function hrefServed(gate: FeatureGate, href: string): boolean {
  const feature = featureOfPath(href)
  return feature === null || gate.isOpen(feature)
}
