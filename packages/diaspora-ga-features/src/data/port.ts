/**
 * L'interface de données de DIASPORA.GA — le « port » que l'interface consomme.
 *
 * Deux implémentations, une seule forme :
 *   · `demo` (aujourd'hui) — fournisseur FACTICE, en mémoire du navigateur,
 *     données de démonstration explicitement fictives, règles appliquées par
 *     `@diaspora-ga/domain` ;
 *   · `engine` (au câblage du moteur, PD2/PD4) — les queries et mutations
 *     Convex du moteur ANTSIA, bornées par `networkId = diaspora-ga`.
 *
 * Les lectures sont des HOOKS (comme `useQuery` de Convex : réactives, d'abord
 * « en chargement ») ; les écritures sont des actions qui rendent un résultat
 * à code FERMÉ (traduit par `errors.<code>`), jamais une exception à l'écran.
 */
import type { VideoPreparationPhase } from "@antsia/social-features/features/video-upload/video-preparation"
import type {
  AttestationOutcome,
  ConsentOrigin,
  ConsentPurpose,
  ContentModerationState,
  CountryCode,
  DirectoryVisibility,
  FacetInput,
  FeedScope,
  MembershipStatus,
  OnboardingConsentChoices,
  Reach,
} from "@diaspora-ga/domain"

import type { AssociationEventsCapability, AssociationGroupsCapability } from "./association-activities-port"

import type {
  BookmarkView,
  BookmarksPageQuery,
  BookmarksPageRequest,
  CommentPageQuery,
  CommentsPageRequest,
  CommentThreadView,
  CommentView,
  CountryHubView,
  ConsentView,
  EntryPrefillView,
  FeedPageQuery,
  FeedPageRequest,
  Loadable,
  MemberHitView,
  PageDetailView,
  OpenCountryView,
  OwnProfileView,
  PostView,
  NotificationView,
  NotificationsPageQuery,
  NotificationsPageRequest,
  ProfileImageView,
  ProfileView,
  ProfilePostsPageRequest,
  ReactionKind,
  RelationView,
  RepliesPageRequest,
  ReportReason,
  SessionView,
  SponsorDashboardView,
  SuggestionView,
  UnreadCountView,
} from "./types"

import type { ActionErrorCode } from "./errors"
import type { AssociationsCapability } from "./associations-port"
import type { DataRightsCapability } from "./data-rights-port"
import type { PageAdminCapability } from "./page-admin-port"
import type { PagesCapability } from "./pages-port"
import type { PagePublicationsCapability } from "./page-publications-port"
import type { ServiceRequestsCapability } from "./service-requests-port"
import type { ServiceReviewsCapability } from "./service-reviews-port"
import type { ServicesCapability } from "./services-port"
import type { ContentReportsCapability } from "./content-reports-port"
import type { MutualAidCapability } from "./mutual-aid-port"
import type { ArrivalKitCapability } from "./arrival-kit-port"
import type { MentoringCapability } from "./mentoring-port"
import type { JobsCapability } from "./jobs-port"
import type { ModerationDeskCapability } from "./moderation-desk-port"
import type { ConversationsCapability } from "./conversations-port"
import type { DemoAccountsCapability } from "./demo-accounts-port"
import type { DemoGateCapability } from "./demo-gate-port"
import type { PageDecisionsCapability } from "./page-decisions-port"
import type { EntryDoorsView } from "./entry-doors-port"
import type { CallSettingsCapability } from "./call-settings-port"
import type { DeviceNotificationsCapability } from "./device-notifications-port"
import type { NetworkFeature, NetworkFeaturesCapability } from "./network-features-port"
import type { MemberBrowseCapability } from "./member-browse-port"
import type { NotificationOpeningCapability } from "./notification-opening-port"
import type { PostSearchCapability } from "./post-search-port"

export type ActionResult<T = null> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ActionErrorCode }

/** Les origines d'un geste fait hors de l'accueil : les réglages, ou l'invite de première visite. */
export type ConsentGestureOrigin = Extract<ConsentOrigin, "settings" | "prompt">

/** Images du profil commun aux réseaux ; la personne authentifiée est seule propriétaire. */
export type ProfileImageUsage = "avatar" | "cover"

export interface ProfileImagesActions {
  set(usage: ProfileImageUsage, file: File): Promise<ActionResult<ProfileImageView>>
  /** Retire la référence de l'image, sans effacer le profil ni le fichier stocké. */
  clear(usage: ProfileImageUsage): Promise<ActionResult<ProfileImageView>>
}

/** Gestes personnels sur le profil commun ; aucune portée de réseau implicite. */
export interface ProfilePublication {
  useMyProfile(): Loadable<OwnProfileView | null>
  /** Modifie les seuls textes ; ne publie ni ne rétablit jamais le profil. */
  updateIdentity?(personId: string, input: { displayName: string; headline: string }): Promise<ActionResult>
  setPrivacy(personId: string, isPrivate: boolean): Promise<ActionResult>
  withdraw(personId: string): Promise<ActionResult>
  republish(personId: string): Promise<ActionResult>
}

/**
 * Lot A4 de l'accueil en un écran (décision du 25/11/2026) : ce que le moteur propose d'après le
 * retour d'IDN (`EntryPrefillView`). Capacité FACULTATIVE : un fournisseur qui ne la sert pas, ou
 * un moteur qui n'a pas encore la fonction, laisse l'écran à la saisie ordinaire, sans erreur.
 * `null` : rien à proposer (compte par code, profil déjà né, pré-remplissage échu, refus ou panne).
 */
export interface EntryPrefillCapability {
  useEntryPrefill(): Loadable<EntryPrefillView | null>
}

/** Choix privés du lecteur dans DIASPORA.GA, sans effet sur ses relations. */
export type ContentPreferenceKind = "hiddenPosts" | "mutedAuthors"

export interface ContentPreferenceAuthor {
  readonly kind: "person" | "page"
  readonly displayName: string
  readonly handle: string | null
  readonly avatarUrl: string | null
}

export interface ContentPreferenceItem {
  readonly choiceId: string
  /** Zéro si un ancien choix ne porte pas de date connue. */
  readonly at: number
  readonly postId: string | null
  readonly body: string | null
  readonly author: ContentPreferenceAuthor | null
}

export interface ContentPreferencesPage {
  readonly items: readonly ContentPreferenceItem[]
  readonly continueCursor: string | null
  readonly isDone: boolean
}

export interface ContentPreferencesRequest {
  readonly personId: string
  readonly kind: ContentPreferenceKind
  readonly cursor: string | null
}

export type ContentPreferencesQuery = Loadable<ContentPreferencesPage> & {
  readonly retry?: () => Promise<unknown>
}

export interface ContentPreferences {
  usePage(args: ContentPreferencesRequest): ContentPreferencesQuery
  restore(args: { personId: string; kind: ContentPreferenceKind; choiceId: string }): Promise<ActionResult<{ restored: boolean }>>
}

/** L'identité qu'IDN rendrait au retour OIDC, SIMULÉE par l'écran de démonstration (`/entrer/idn`). */
export interface IdnSignInInput {
  readonly firstName: string
  readonly lastName: string
  readonly loa: number
  readonly gaboneseNationality: boolean | null
}

export interface CodeDestination {
  readonly kind: "email" | "phone"
  readonly value: string
}

/**
 * L'entrée en un écran (EXF-DG-02, amendé par la décision du 25/11/2026) : identité, résidence,
 * une phrase qui dit ce que les membres verront, un bouton. Le clic est le consentement au profil
 * social ; l'écran envoie l'annuaire et les notifications à « non » (proposés après l'entrée).
 *
 * L'identité commune (EA-04) : `handle` et `displayName` ne servent qu'à une personne qui n'a
 * encore aucun profil. Un profil déjà publié (membre d'ANTSIA, retour après un départ) n'est ni
 * redemandé ni réécrit : ces champs sont alors ignorés. Un profil retiré se republie d'abord, par
 * le geste de la personne (`profilePublication.republish`) ; sinon l'entrée est refusée
 * (`profile_republish_required`). Le fournisseur relit le profil à chaque essai : une entrée
 * interrompue se reprend sans rien publier deux fois.
 */
export interface JoinInput {
  readonly facet: FacetInput
  readonly handle?: string
  readonly displayName?: string
  readonly consents: OnboardingConsentChoices
  readonly directoryVisibility: DirectoryVisibility
}

/** Ce que rend une entrée : le pays du hub, et le statut que les faits donnent à l'adhésion. */
export interface JoinedView {
  readonly country: CountryCode
  readonly status: MembershipStatus
}

/**
 * FD-02 : où en est le dépôt d'un média, tel que le composeur l'annonce — l'analyse puis la
 * conversion d'une vidéo (progression de 0 à 1, phases du module du moteur), puis l'envoi.
 */
export type MediaUploadPhase = VideoPreparationPhase | { readonly phase: "uploading" }

/** Ce que l'écran suit et peut arrêter pendant un dépôt de média (FD-02). */
export interface MediaUploadOptions {
  /**
   * L'annulation : le geste « Annuler la conversion », la fermeture ou le départ du composeur.
   * Le dépôt annulé rend `media_cancelled` ; rien n'est déposé ni retenu.
   */
  readonly signal?: AbortSignal
  /** L'avancement : analyse et conversion d'une vidéo, puis envoi du fichier préparé. */
  readonly onPhase?: (phase: MediaUploadPhase) => void
}

/**
 * Un fichier déposé, prêt à rejoindre une publication. `ref` est opaque pour
 * l'écran (identifiant de stockage du moteur, ou clé de la démonstration) ; un
 * dépôt ne publie rien tant qu'une publication ne l'embarque pas.
 */
export interface UploadedMedia {
  readonly ref: string
  readonly kind: "image" | "video"
  readonly mimeType: string
  readonly sizeBytes: number
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
}

export interface PublishMediaInput {
  readonly upload: UploadedMedia
  /** Texte alternatif : ce que la personne qui ne voit pas l'image doit en savoir. */
  readonly altText: string
}

export interface PublishInput {
  /** Facultatif dès qu'un média porte la publication (une photo sans légende est légitime). */
  readonly body: string
  readonly reach: Reach
  readonly country?: CountryCode
  readonly audience: "public" | "connections"
  /** « Publier aussi sur ANTSIA » — geste explicite, ignoré hors audience publique. */
  readonly alsoOnRoot: boolean
  /** Quatre photos au plus, ou une vidéo seule, dans l'ordre choisi. */
  readonly media?: readonly PublishMediaInput[]
  /**
   * Partage cité : la publication citée (publique et publiée). Un partage ne
   * joint aucun média (il montre ceux de l'original) ; son texte est facultatif.
   */
  readonly sharedPostId?: string
  /**
   * Idempotence (EXF-DG-10) : la même clé rejouée (réseau coupé, double envoi)
   * rend la publication déjà créée au lieu d'en créer une seconde.
   */
  readonly idempotencyKey?: string
}

/**
 * Ce qu'une publication est devenue à l'envoi (FD-04), tel que le fournisseur le dit :
 * publiée, ou retenue en relecture (visible de son seul auteur). `null` : le fournisseur
 * n'a pas rendu l'état ; l'écran n'annonce alors ni « publiée » ni « en relecture ».
 */
export interface PublishOutcome {
  readonly moderation: ContentModerationState | null
}

/** Commenter une publication ; une réponse à une réponse rejoint sa racine (un seul niveau). */
export interface CommentInput {
  readonly postId: string
  readonly body: string
  readonly parentCommentId?: string
}

/** Signaler une publication : un motif parmi six, une précision facultative. */
export interface ReportInput {
  readonly postId: string
  readonly reason: ReportReason
  readonly note?: string
}

/**
 * CH-817 E5 — une connexion par code lancée pour un acteur de démonstration choisi dans la feuille
 * de la pastille « Compte démo » (`demoActor: true`) : l'adresse vient du catalogue. Porte armée,
 * le moteur ne laisse ni envoyer ce code ni s'y connecter sans le jeton d'une session de porte ;
 * le fournisseur du moteur le joint alors aux DEUX requêtes, pour une adresse déclarée d'un acteur
 * et une session de porte présente dans l'onglet seulement — jamais pour une adresse saisie au
 * formulaire ordinaire. Le jeton ne quitte jamais le fournisseur ; la démonstration l'ignore.
 */
export interface SignInCodeOptions {
  readonly demoActor?: boolean
}

export interface DiasporaGaActions {
  /**
   * Entrer par IDN (EA-02).
   *   · Démonstration : l'identité simulée de `/entrer/idn` ouvre la session ; sans elle, `idn_invalid`.
   *   · Moteur : SANS argument (une identité passée est ignorée, aucun nom civil ne part). Départ
   *     vers IDN par le client d'authentification du moteur (fournisseur `idn`), retour sur
   *     `/bienvenue` sans aucun paramètre ; `ok` veut dire que le navigateur part chez IDN.
   */
  signInWithIdn(input?: IdnSignInInput): Promise<ActionResult>
  /**
   * Demander un code. `demoCode` : le code à recopier, quand le fournisseur peut le montrer
   * (moteur : porte de démonstration non armée seulement, `open` — développement local compris) ;
   * sinon `null`. Porte armée, la feuille de la pastille est la seule à relire un code.
   */
  requestCode(destination: CodeDestination, options?: SignInCodeOptions): Promise<ActionResult<{ demoCode: string | null }>>
  /**
   * Vérifier le code reçu. `destination` : l'adresse à laquelle il est parti, que l'écran garde
   * dans l'onglet (EA-08, MO-04) — la saisie reprend après un rechargement ou un aller-retour vers
   * la messagerie, sans redemander de code. Sans elle, le fournisseur reprend l'adresse du
   * dernier envoi de cette session ; sans envoi connu, `code_expired`. `options` : comme pour
   * `requestCode` (acteur de démonstration de la feuille).
   */
  verifyCode(code: string, destination?: CodeDestination, options?: SignInCodeOptions): Promise<ActionResult>
  /** Révocation de toutes les sessions côté serveur, puis purge locale (EXT-DG-01). */
  signOutEverywhere(): Promise<void>
  checkHandle(handle: string): Promise<ActionResult<{ available: boolean }>>
  join(input: JoinInput): Promise<ActionResult<JoinedView>>
  /**
   * Déposer une photo ou une vidéo avant de publier ; les règles du moteur jugent le fichier
   * d'abord. Une vidéo est préparée avant l'envoi (FD-02) : `options` en suit l'avancement et
   * peut l'annuler.
   */
  uploadMedia(file: File, options?: MediaUploadOptions): Promise<ActionResult<UploadedMedia>>
  publish(input: PublishInput): Promise<ActionResult<PublishOutcome>>
  react(postId: string, kind: ReactionKind | null): Promise<ActionResult>
  /**
   * Commenter ou répondre (EXF-DG-12) ; l'auteur de la publication et la personne à qui l'on
   * répond sont avisés. Rend l'identifiant du commentaire créé : l'écran le montre aussitôt,
   * même hors des pages déjà lues (FD-03).
   */
  comment(input: CommentInput): Promise<ActionResult<{ readonly commentId: string }>>
  /** Modifier son commentaire publié, si la publication reste lisible. Capacité facultative du fournisseur. */
  editComment?(commentId: string, body: string): Promise<ActionResult>
  /** Retirer un commentaire — le sien, ou n'importe lequel sous sa propre publication. */
  removeComment(commentId: string): Promise<ActionResult>
  /** Enregistrer une publication, ou la retirer des enregistrements (signet, privé). */
  toggleBookmark(postId: string): Promise<ActionResult<{ bookmarked: boolean }>>
  /** Ne plus voir une publication — pour soi seulement. */
  hidePost(postId: string): Promise<ActionResult>
  /** Enregistrer sur le compte le thème choisi (Réglages > Langue et apparence). Capacité facultative du fournisseur. */
  saveAccountTheme?(theme: string): Promise<ActionResult>
  /** Enregistrer sur le compte la langue choisie en session (`fr`, `en`). Capacité facultative du fournisseur. */
  saveAccountLocale?(locale: string): Promise<ActionResult>
  /** Mettre un auteur en sourdine : ses publications quittent mes fils, sans qu'il l'apprenne. */
  muteAuthor(personId: string): Promise<ActionResult>
  /** Signaler une publication ; elle est aussitôt masquée pour la personne qui signale. */
  reportPost(input: ReportInput): Promise<ActionResult>
  /** Retirer MA publication, partout où elle est lue. */
  removePost(postId: string): Promise<ActionResult>
  /** Modifier le texte de MA publication ; la carte dira « modifiée ». */
  editPost(postId: string, body: string): Promise<ActionResult>
  /**
   * FD-10 : épingler MA publication (personnelle, hors groupe, publiée) en tête de mon mur dans
   * DIASPORA.GA. Une seule épingle : la nouvelle remplace l'ancienne, qui reste publiée.
   * Capacité facultative du fournisseur, comme les trois suivantes.
   */
  pinOnMyWall?(postId: string): Promise<ActionResult>
  /** FD-10 : retirer l'épingle de mon mur ; la publication reste publiée, à sa place. */
  unpinMyWall?(): Promise<ActionResult>
  /**
   * FD-10 : ne plus lire MA publication dans ANTSIA. Elle reste lisible dans DIASPORA.GA, pour la
   * même audience ; ce geste ne se défait pas (rien ne la republie sur ANTSIA).
   */
  withdrawFromRoot?(postId: string): Promise<ActionResult>
  /** FD-10 : recevoir, ou ne plus recevoir, un avis à chaque nouveau commentaire d'une publication lisible (bascule privée). */
  toggleCommentNotifications?(postId: string): Promise<ActionResult<{ readonly notifying: boolean }>>
  /** « Ne plus me proposer » : un choix privé, réversible, que l'autre n'apprend pas. */
  dismissSuggestion(handle: string): Promise<ActionResult>
  /** Demander une connexion. Un blocage, dans un sens ou dans l'autre, rend la même réponse, sans rien écrire. */
  connect(personId: string): Promise<ActionResult>
  /** Répondre à une demande reçue (le destinataire seul). */
  respondToConnection(connectionId: string, accept: boolean): Promise<ActionResult>
  follow(handle: string): Promise<ActionResult>
  unfollow(personId: string): Promise<ActionResult>
  /** Bloquer : la relation et les abonnements de la paire tombent, partout. */
  block(personId: string): Promise<ActionResult>
  unblock(personId: string): Promise<ActionResult>
  /** Marquer un avis lu (destinataire seul) ; tout marquer lu. */
  markNotificationRead(notificationId: string): Promise<ActionResult>
  markAllNotificationsRead(): Promise<ActionResult>
  sponsor(handle: string): Promise<ActionResult>
  revokeSponsorship(sponsorshipId: string): Promise<ActionResult>
  requestAttestation(): Promise<ActionResult<{ outcome: AttestationOutcome }>>
  /**
   * Accorder ou retirer une finalité. `origin` : d'où vient le geste — les réglages (par défaut)
   * ou l'invite de première visite (`prompt`) ; un retrait n'a pas d'origine dans le journal.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean, origin?: ConsentGestureOrigin): Promise<ActionResult>
  /**
   * EA-03 : faire relire son statut quand ses faits ont changé hors de DIASPORA.GA ; à
   * n'appeler que si l'adhésion le signale (`statusOutdated`). Capacité facultative du
   * fournisseur (la démonstration dérive le statut à chaque lecture).
   */
  refreshMembership?(): Promise<ActionResult<{ changed: boolean }>>
  /** Quitte cette seule adhésion, sans retirer le profil ni les consentements communs. */
  leaveDiasporaGa(): Promise<ActionResult>
  updateFacet(input: FacetInput): Promise<ActionResult>
  setDirectoryVisibility(level: DirectoryVisibility): Promise<ActionResult>
  exportMyData(): Promise<ActionResult<string>>
  deleteMyAccount(): Promise<ActionResult>
}

export interface DemoAccountView {
  readonly personId: string
  readonly displayName: string
  readonly handle: string | null
  readonly descriptionKey: string
  readonly current: boolean
}

/** Commandes réservées au mode démonstration (comptes fictifs, remise à zéro). */
export interface DemoControls {
  useAccounts(): Loadable<readonly DemoAccountView[]>
  switchTo(personId: string): Promise<void>
  reset(): Promise<void>
}

export interface DiasporaGaDataSource {
  readonly kind: "demo" | "engine"
  readonly associationGroups?: AssociationGroupsCapability
  readonly associationEvents?: AssociationEventsCapability
  /** Disponible seulement si le fournisseur sait gérer les images du profil commun. */
  readonly profileImages?: ProfileImagesActions | null
  readonly profilePublication?: ProfilePublication
  /** Le pré-remplissage de l'accueil d'après IDN (lot A4) ; absent : la saisie ordinaire. */
  readonly entryPrefill?: EntryPrefillCapability
  readonly contentPreferences?: ContentPreferences
  /** Pages : fiche réelle, abonnement, annuaire (DG-007, `pages-port.ts`). */
  readonly pages?: PagesCapability
  /** Parole et mur des pages, indépendants de leur identité et de leur équipe. */
  readonly pagePublications?: PagePublicationsCapability
  /** Gestion des pages : création, revendication, équipe (DG-008, `page-admin-port.ts`). */
  readonly pageAdmin?: PageAdminCapability
  /** Catalogue des services des pages professionnelles (DG-011/012, `services-port.ts`). */
  readonly services?: ServicesCapability
  /** Demandes, propositions et rendez-vous (DG-014/015, `service-requests-port.ts`). */
  readonly serviceRequests?: ServiceRequestsCapability
  /** Droits personnels : export, effacement, décisions et recours (DG-026, `data-rights-port.ts`). */
  readonly dataRights?: DataRightsCapability
  /** Associations : adhésion distincte de l'abonnement, responsables, rôles (DG-010, `associations-port.ts`). */
  readonly associations?: AssociationsCapability
  /** Avis admissibles sur une prestation et réponse de la page (DG-016, `service-reviews-port.ts`). */
  readonly serviceReviews?: ServiceReviewsCapability
  /** Signaler un contenu de la vague H par la porte unique de modération (G9, `content-reports-port.ts`). */
  readonly contentReports?: ContentReportsCapability
  /** Entraide (DG-024 a, `mutual-aid-port.ts`). */
  readonly mutualAid?: MutualAidCapability
  /** Kit d'arrivée (DG-024 b, `arrival-kit-port.ts`). */
  readonly arrivalKit?: ArrivalKitCapability
  /** Mentorat (DG-024 c, `mentoring-port.ts`). */
  readonly mentoring?: MentoringCapability
  /** Talents et emploi (DG-025, `jobs-port.ts`). */
  readonly jobs?: JobsCapability
  /** Modération par pays (PD6 · G9, `moderation-desk-port.ts`). */
  readonly moderationDesk?: ModerationDeskCapability
  /** Décisions qui ont retiré un contenu porté par une page, et leur recours (P16 · G9, `page-decisions-port.ts`). */
  readonly pageDecisions?: PageDecisionsCapability
  /** Le fil de mise en relation d'un objet, lu et ouvert depuis l'objet (CC-6, `conversations-port.ts`). */
  readonly conversations?: ConversationsCapability
  /** Comptes de démonstration par acteur, DÉVELOPPEMENT LOCAL du moteur seulement (`demo-accounts-port.ts`). */
  readonly demoAccounts?: DemoAccountsCapability
  /**
   * CH-817 (lot A1) : la porte des comptes de démonstration du moteur (numéro WhatsApp autorisé,
   * code de 6 chiffres et 1 lettre, session courte de cet onglet ; `demo-gate-port.ts`). Absente
   * en démonstration, qui garde ses propres comptes fictifs sans porte.
   */
  readonly demoGate?: DemoGateCapability
  /** Réglages d'appel et de présence de la personne, valables aussi dans ANTSIA (IM-02, `call-settings-port.ts`). */
  readonly callSettings?: CallSettingsCapability
  /**
   * DS-14 (volet push) : abonner CET appareil aux notifications du navigateur, et l'en retirer
   * (`device-notifications-port.ts`). En démonstration : rien n'est envoyé, l'état le dit.
   */
  readonly deviceNotifications?: DeviceNotificationsCapability
  /**
   * Les fonctionnalités activables du réseau (ADR-0041 du moteur, `network-features-port.ts`) :
   * les clés ouvertes, et pour l'administration du réseau, leur état et la bascule.
   */
  readonly networkFeatures?: NetworkFeaturesCapability
  /**
   * Parcourir l'annuaire par pays ouvert, ville et confiance (CH-816 P3, `member-browse-port.ts`),
   * à côté de la recherche par nom : mêmes membres, même règle, vingt par fenêtre.
   */
  readonly memberBrowse?: MemberBrowseCapability
  /**
   * DS-14 (ouverture) : la destination relue d'une notification poussée sur l'appareil
   * (`notification-opening-port.ts`). Absente (démonstration : rien n'est poussé), la porte
   * d'ouverture mène à la page des notifications.
   */
  readonly notificationOpening?: NotificationOpeningCapability
  /**
   * Chercher dans les publications lisibles du réseau (DS-11, volet recherche, `post-search-port.ts`) :
   * la même garde que le fil, une fenêtre de plus à chaque « Voir plus », jusqu'à la borne.
   */
  readonly postSearch?: PostSearchCapability
  /**
   * Posés par `gateSource` seulement : les fonctionnalités ouvertes de la source montée, et
   * si leur lecture a répondu. Absents : la source n'est pas gardée (elle sert tout ce qu'elle porte).
   */
  readonly openFeatures?: readonly NetworkFeature[]
  readonly featuresReady?: boolean
  useSession(): Loadable<SessionView>
  /**
   * Les portes d'entrée que ce déploiement sait vraiment servir (EA-02, `entry-doors-port.ts`).
   * Facultative : sans elle, la porte reste celle d'avant (`UNREAD_ENTRY_DOORS`).
   */
  useEntryDoors?(): Loadable<EntryDoorsView>
  useOpenCountries(): Loadable<readonly OpenCountryView[]>
  useCountryHub(country: CountryCode): Loadable<CountryHubView>
  useFeed(args: { scope: FeedScope; hubCountry?: CountryCode }): Loadable<readonly PostView[]>
  /** Une fenêtre du même fil, avec son curseur serveur et sa reprise indépendante. */
  useFeedPage(args: FeedPageRequest): FeedPageQuery
  useProfile(handle: string): Loadable<ProfileView | null>
  /** Le mur gardé du profil, paginé indépendamment de sa fiche. */
  useProfilePostsPage(args: ProfilePostsPageRequest): FeedPageQuery
  /** Ma relation avec une personne (connexion, abonnement, mon blocage). */
  useRelation(personId: string): Loadable<RelationView>
  /**
   * L'annuaire opt-in : rien sous `MEMBER_SEARCH_MIN_LENGTH` caractères ; réservé
   * aux membres actifs ; le filtre de pays restreint, il n'ouvre jamais rien.
   */
  useMemberSearch(args: { query: string; country?: CountryCode }): Loadable<readonly MemberHitView[]>
  /** Une publication seule ; `null` : introuvable ou illisible pour ce lecteur (même réponse). */
  usePost(postId: string): Loadable<PostView | null>
  /** Mes signets, du plus récent ; une publication devenue illisible disparaît de la liste. */
  useBookmarks(): Loadable<readonly BookmarkView[]>
  /** Page native des mêmes signets ; conserve les métadonnées même après filtrage. */
  useBookmarksPage(args: BookmarksPageRequest): BookmarksPageQuery
  /** Des membres à rencontrer (EXF-DG-18) : six au plus, réservées aux membres actifs. */
  useSuggestions(): Loadable<readonly SuggestionView[]>
  /**
   * Une page des commentaires d'une publication (FD-03), des plus anciens aux plus récents,
   * chacun avec l'aperçu de ses réponses ; la page suivante se lit par son curseur.
   */
  useCommentsPage(args: CommentsPageRequest): CommentPageQuery<CommentThreadView>
  /** Une page des réponses d'une racine (FD-03), dans l'ordre ; la suite se lit par son curseur. */
  useRepliesPage(args: RepliesPageRequest): CommentPageQuery<CommentView>
  /** La cloche : les avis les plus récents, et le compte des non-lus. */
  useNotifications(): Loadable<readonly NotificationView[]>
  /**
   * NP-04 : une page des MÊMES avis, du plus récent au plus ancien, sur le curseur du serveur ;
   * la page des notifications lit la suivante à la demande, sans limite de nombre.
   */
  useNotificationsPage(args: NotificationsPageRequest): NotificationsPageQuery
  useUnreadCount(): Loadable<UnreadCountView>
  usePage(handle: string): Loadable<PageDetailView | null>
  useHandleSuggestions(displayName: string): readonly string[]
  useSponsorDashboard(): Loadable<SponsorDashboardView>
  useMyConsents(): Loadable<readonly ConsentView[]>
  readonly actions: DiasporaGaActions
  readonly demo: DemoControls | null
}
