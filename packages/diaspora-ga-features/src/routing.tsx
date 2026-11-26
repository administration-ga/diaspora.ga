"use client"

import type { CountryCode, FeedScope } from "@diaspora-ga/domain"
import { createContext, useContext, type ComponentProps, type ComponentType, type ReactNode } from "react"

/**
 * Adaptateur de routage — les surfaces de DIASPORA.GA ne connaissent AUCUNE URL
 * (cliquet `no-hardcoded-urls`) : l'application leur passe sa table de routes
 * (`apps/diaspora_ga/src/lib/routes.ts`) et son composant de lien. Même
 * principe que l'adaptateur du moteur (`useRoutes()`, PA6).
 */
export interface FeatureRoutes {
  profile(handle: string): string
  /** Une publication, ouverte seule (depuis la cloche, un signet, son horodatage). */
  post(postId: string): string
  page(handle: string): string
  associationEvent?(handle: string, eventId: string): string
  /** Avis de mise en relation (cloche) : ma demande, une demande reçue, les adhérents, mes associations. */
  serviceRequest?(requestId: string): string
  activityRequest?(requestId: string): string
  associationMembers?(handle: string): string
  myAssociations?(): string
  /** Avis de décision de modération (cloche) : mes décisions (« Mes données »), ou celles d'une page dont je signe. */
  myDecisions?(): string
  pageDecisions?(handle: string): string
  /** Accusé de réception et avis de décision d'un signalement (cloche, SU01d) : « Mes signalements ». */
  myReports?(): string
  /** Avis de la vie communautaire (cloche) : une question ou une mission d'entraide, mes mentorats, les candidatures reçues, mes candidatures, une ressource du kit. */
  mutualAidItem?(itemId: string): string
  myMentoring?(): string
  jobsActivity?(): string
  /** Le recrutement d'UNE page (onglet Emplois de sa gestion) : l'avis d'une candidature reçue y mène quand la page se lit. */
  pageJobs?(handle: string): string
  myApplications?(): string
  arrivalKitResource?(resourceId: string): string
  /** Avis d'une conversation de mise en relation (cloche, CC-6) : le fil, sous la messagerie de l'application. */
  contextualConversation?(threadId: string): string
  /** Les règles de la communauté (MD-05), page publique : la feuille de signalement y renvoie. */
  communityRules?(): string
  /** NP-04 : la page des notifications (« Tout voir » depuis la feuille de la cloche). */
  notifications?(): string
  /** NP-04 : l'album d'un profil (avis d'album publié), sur le profil de son auteur. */
  album?(handle: string, albumId: string): string
  /** NP-04 : l'agenda personnel (avis d'invitation à un évènement). */
  agenda?(): string
  /** IM-04 : une conversation de groupe d'iCom (message ou invitation de groupe), sous la messagerie de l'application. */
  groupConversation?(threadId: string): string
  /** IC-09 du moteur : une conversation à deux d'iCom (message reçu d'une relation), sous la messagerie de l'application. */
  personalConversation?(threadId: string): string
  /**
   * IM-04 : le journal d'appels d'iCom (appel manqué, message vocal) ; aucune route d'appel.
   * Absent quand l'application ne propose pas d'appel : aucun lien n'y mène alors.
   */
  callJournal?(): string
  /**
   * Lot A5 : la page d'un direct, où mène l'annonce d'un direct dans le fil. Absente quand cette
   * page n'est pas servie (direct fermé par le code, démonstration) : la carte dit alors le direct
   * sans lien.
   */
  conference?(sessionId: string): string
  hub(country: CountryCode): string
  /** Le filtre restreint le fil ; une carte peut conserver sa portée et le pays de son hub. */
  feed(tag?: string, context?: { readonly scope: FeedScope; readonly country?: CountryCode }): string
  sponsor(): string
  settings(): string
  attestation(): string
  enter(): string
}

export type LinkComponent = ComponentType<
  Omit<ComponentProps<"a">, "href"> & { href: string; children?: ReactNode }
>

interface RoutingValue {
  readonly routes: FeatureRoutes
  readonly Link: LinkComponent
}

const RoutingContext = createContext<RoutingValue | null>(null)

export function RoutingProvider(props: { routes: FeatureRoutes; Link: LinkComponent; children: ReactNode }) {
  return <RoutingContext.Provider value={{ routes: props.routes, Link: props.Link }}>{props.children}</RoutingContext.Provider>
}

export function useRouting(): RoutingValue {
  const value = useContext(RoutingContext)
  if (value === null) throw new Error("RoutingProvider manquant : l'application doit fournir sa table de routes.")
  return value
}

/**
 * La table de routes, ou `null` quand la brique est rendue hors de l'application (feuille de
 * signalement montée seule) : le lien qui en dépend se tait au lieu d'inventer une adresse.
 */
export function useOptionalRouting(): RoutingValue | null {
  return useContext(RoutingContext)
}
