"use client"

import type { CountryCode, FeedScope } from "@diaspora-ga/domain"
import { createContext, useContext, useMemo, type ReactNode } from "react"

import { type EntryDoorsView, UNREAD_ENTRY_DOORS } from "./entry-doors-port"
import { type FeatureGate, featureGateOf, gateSource, knownFeatures } from "./network-features-port"
import type { DiasporaGaDataSource } from "./port"
import type { BookmarksPageRequest, CommentsPageRequest, FeedPageRequest, Loadable, NotificationsPageRequest, ProfilePostsPageRequest, RepliesPageRequest } from "./types"

const DataSourceContext = createContext<DiasporaGaDataSource | null>(null)

/**
 * Fournit la source de données à l'arbre. La source est choisie UNE fois par
 * l'application (démonstration aujourd'hui, moteur demain) et ne change pas
 * pendant la vie de l'arbre : les hooks qu'elle expose sont donc appelés dans
 * un ordre stable.
 */
export function DataSourceProvider(props: { source: DiasporaGaDataSource; children: ReactNode }) {
  return <DataSourceContext.Provider value={props.source}>{props.children}</DataSourceContext.Provider>
}

const NO_FEATURES_OPEN: Loadable<readonly string[]> = { status: "ready", data: [] }

/**
 * Le fournisseur de l'APPLICATION (démonstration comme moteur, ADR-0041) : il lit les
 * fonctionnalités ouvertes du réseau, puis monte la source GARDÉE (`gateSource`) — les
 * capacités des modules fermés en sont absentes. La coque suppose une source stable : un
 * changement des clés ouvertes remonte l'arbre (`key`), jamais un changement de capacités
 * sous des hooks déjà appelés. Sans capacité, rien n'est ouvert.
 */
export function GatedDataSourceProvider(props: { source: DiasporaGaDataSource; children: ReactNode }) {
  const loaded = props.source.networkFeatures?.useOpen() ?? NO_FEATURES_OPEN
  const ready = loaded.status !== "loading"
  // Une lecture refusée (hors adhésion, réseau indisponible) n'ouvre rien.
  const signature = loaded.status === "ready" ? knownFeatures(loaded.data).join(",") : ""
  const { source } = props
  const gated = useMemo(() => gateSource(source, signature === "" ? [] : knownFeatures(signature.split(",")), ready), [source, signature, ready])
  return (
    <DataSourceProvider key={signature} source={gated}>
      {props.children}
    </DataSourceProvider>
  )
}

export function useDataSource(): DiasporaGaDataSource {
  const source = useContext(DataSourceContext)
  if (source === null) throw new Error("DataSourceProvider manquant : monter l'application dans son fournisseur de données.")
  return source
}

/** Les briques de lecture seules peuvent aussi être rendues hors application. */
export function useOptionalDataSource(): DiasporaGaDataSource | null {
  return useContext(DataSourceContext)
}

export const useSession = () => useDataSource().useSession()
/**
 * Les portes d'entrée ouvertes (EA-02). La source ne change pas pendant la vie de l'arbre :
 * l'appel facultatif est donc stable d'un rendu à l'autre.
 */
export const useEntryDoors = (): Loadable<EntryDoorsView> => useDataSource().useEntryDoors?.() ?? UNREAD_ENTRY_DOORS
export const useOpenCountries = () => useDataSource().useOpenCountries()
export const useCountryHub = (country: CountryCode) => useDataSource().useCountryHub(country)
export const useFeed = (args: { scope: FeedScope; hubCountry?: CountryCode }) => useDataSource().useFeed(args)
export const useFeedPage = (args: FeedPageRequest) => useDataSource().useFeedPage(args)
export const useProfile = (handle: string) => useDataSource().useProfile(handle)
export const useProfilePostsPage = (args: ProfilePostsPageRequest) => useDataSource().useProfilePostsPage(args)
export const useRelation = (personId: string) => useDataSource().useRelation(personId)
export const useMemberSearch = (args: { query: string; country?: CountryCode }) => useDataSource().useMemberSearch(args)
export const useCommentsPage = (args: CommentsPageRequest) => useDataSource().useCommentsPage(args)
export const useSuggestions = () => useDataSource().useSuggestions()
export const usePost = (postId: string) => useDataSource().usePost(postId)
export const useBookmarks = () => useDataSource().useBookmarks()
export const useBookmarksPage = (args: BookmarksPageRequest) => useDataSource().useBookmarksPage(args)
export const useRepliesPage = (args: RepliesPageRequest) => useDataSource().useRepliesPage(args)
export const useNotifications = () => useDataSource().useNotifications()
export const useNotificationsPage = (args: NotificationsPageRequest) => useDataSource().useNotificationsPage(args)
export const useUnreadCount = () => useDataSource().useUnreadCount()
export const usePage = (handle: string) => useDataSource().usePage(handle)
export const useHandleSuggestions = (displayName: string) => useDataSource().useHandleSuggestions(displayName)
export const useSponsorDashboard = () => useDataSource().useSponsorDashboard()
export const useMyConsents = () => useDataSource().useMyConsents()
export const useActions = () => useDataSource().actions

/** Les capacités facultatives des chantiers du plan global : `null` si le fournisseur ne les sert pas. */
export const usePagesCapability = () => useDataSource().pages ?? null
export const usePageAdmin = () => useDataSource().pageAdmin ?? null
export const useServices = () => useDataSource().services ?? null
export const useServiceRequests = () => useDataSource().serviceRequests ?? null
export const useDataRights = () => useDataSource().dataRights ?? null
export const useAssociations = () => useDataSource().associations ?? null
export const useAssociationGroups = () => useDataSource().associationGroups ?? null
export const useAssociationEvents = () => useDataSource().associationEvents ?? null
export const useServiceReviews = () => useDataSource().serviceReviews ?? null
export const useContentReports = () => useDataSource().contentReports ?? null
export const useMutualAid = () => useDataSource().mutualAid ?? null
export const useArrivalKit = () => useDataSource().arrivalKit ?? null
export const useMentoring = () => useDataSource().mentoring ?? null
export const useJobs = () => useDataSource().jobs ?? null
export const useModerationDesk = () => useDataSource().moderationDesk ?? null
export const usePageDecisions = () => useDataSource().pageDecisions ?? null
export const useConversations = () => useDataSource().conversations ?? null
export const useDemoAccounts = () => useDataSource().demoAccounts ?? null
export const useCallSettings = () => useDataSource().callSettings ?? null
/** DS-14 (volet push) : les notifications de cet appareil ; `null` si le fournisseur ne les sert pas. */
export const useDeviceNotifications = () => useDataSource().deviceNotifications ?? null
/** Les fonctionnalités activables du réseau (clés ouvertes ; état et bascule pour l'administration). */
export const useNetworkFeatures = () => useDataSource().networkFeatures ?? null
/** Parcourir l'annuaire par pays et par ville (CH-816 P3) ; `null` : la recherche par nom seule. */
export const useMemberBrowse = () => useDataSource().memberBrowse ?? null
/** Chercher dans les publications lisibles du réseau (DS-11) ; `null` : le fournisseur ne la sert pas. */
export const usePostSearchCapability = () => useDataSource().postSearch ?? null

/**
 * Les modules ouverts, pour la navigation et les adresses. Hors fournisseur, ou sur une
 * source non gardée (tests d'un écran), tout ce que la source porte est servi.
 */
export function useFeatureGate(): FeatureGate {
  return featureGateOf(useContext(DataSourceContext))
}
