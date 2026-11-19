/**
 * Capacité « gestion des pages » du port (DG-008) — créer une page, la
 * revendiquer, gérer son équipe de signataires. PROPRIÉTAIRE : chantier « gestion
 * des pages » (vague G1).
 *
 * CONTRAT FIGÉ consommé par d'autres chantiers (services, « Mon activité ») :
 * `useMyPages()` et `ManagedPageView` — ne pas en changer la forme sans le
 * coordinateur ; on peut seulement AJOUTER des membres. Les ajouts de DG-008
 * sont donc FACULTATIFS : `ManagedPageView` gagne des champs optionnels, et
 * tout le reste vit sous `management` (absent : l'écran dit « indisponible »).
 *
 * Les règles d'écran sont CELLES du moteur (`@antsia/social-domain/pages`,
 * `uploadPolicy`, `audit`), importées et dites en codes fermés : l'écran refuse
 * exactement ce que le moteur refuserait, et le moteur reste l'autorité.
 *
 * Trois notions jamais confondues (docs/14 §G2) :
 *   · le STATUT déclaré d'une personne (son adhésion) ;
 *   · la page VÉRIFIÉE (revendication validée par la modération du réseau) ;
 *   · l'AUTORITÉ officielle (institution, décision tracée hors de DIASPORALE).
 * Une page créée par un membre naît « Communauté » ; aucun geste de cette
 * capacité ne la rend « Officiel ».
 */
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { DECISION_REASON_MAX } from "@antsia/social-domain/audit"
import {
  assertPageHandle,
  assertPageName,
  derivePageHandle,
  isPageSignatoryRole,
  MEMBER_PAGE_OWNER_KINDS,
  normalizePageClaimNote,
  normalizePageDescription,
  normalizePageShortName,
  PAGE_CLAIM_EVIDENCE_MAX,
  PAGE_CLAIM_NOTE_MAX_LENGTH,
  PAGE_CLAIM_STATUSES,
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_HANDLE_MAX_LENGTH,
  PAGE_HANDLE_MIN_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_ROLES,
  PAGE_SHORT_NAME_MAX_LENGTH,
  PAGE_SIGNATORIES_MAX,
  PAGE_SLEEP_DAYS,
  PAGE_SLEEP_MS,
  PAGE_TEAM_ROLES,
  type PageSleepState,
  type PageTeamRole,
} from "@antsia/social-domain/pages"
import { isMimeAllowedForUsage, normalizeMimeType, UPLOAD_USAGES } from "@antsia/social-domain/uploadPolicy"
import { isDomainViolation } from "@antsia/social-domain/violation"
import { canMemberCreatePageKind, type CountryCode, type PageOwnerKind, type PageTrustLevel } from "@diasporale/domain"

import type { ActionErrorCode } from "./errors"
import type { ActionResult } from "./port"
import type { AssociationType, CompanySector, Loadable } from "./types"

export {
  DECISION_REASON_MAX,
  derivePageHandle,
  PAGE_CLAIM_EVIDENCE_MAX,
  PAGE_CLAIM_NOTE_MAX_LENGTH,
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_HANDLE_MAX_LENGTH,
  PAGE_HANDLE_MIN_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_SHORT_NAME_MAX_LENGTH,
  PAGE_SIGNATORIES_MAX,
  // AS-11a : la durée du sommeil, celle du moteur (trente jours), dite à la confirmation.
  PAGE_SLEEP_DAYS,
  PAGE_SLEEP_MS,
}

/** Codes de refus propres à la gestion des pages (fragment `page-admin.json`). */
export const PAGE_ADMIN_ERROR_CODES = [
  // Créer une page : adhésion vérifiée, nature créable, identité bornée.
  "page_verified_required",
  "page_kind_reserved",
  "page_name_invalid",
  "page_short_name_too_long",
  "page_description_too_long",
  "page_city_invalid",
  "page_city_too_long",
  "page_association_type_invalid",
  "page_sector_invalid",
  "page_handle_length",
  "page_handle_charset",
  "page_handle_taken",
  "page_country_required",
  "page_country_invalid",
  "page_post_country_required",
  // Parler et gérer au nom d'une page : un rôle VIVANT, relu à chaque acte.
  "page_role_required",
  "page_last_admin",
  "page_signatories_full",
  "page_signatory_identity_required",
  "page_signatory_self",
  "page_member_not_found",
  "page_member_handle_required",
  "page_invitation_gone",
  // AS-10 : « Transmettre la page » sans membre choisi.
  "page_team_member_required",
  // Revendiquer une page (EXF-AN-17) : pièces privées, mandat, consentement.
  "page_not_claimable",
  "page_already_verified",
  "page_already_claimed",
  "page_claim_pending",
  "page_claim_evidence_count",
  "page_claim_evidence_type",
  "page_claim_evidence_too_large",
  "page_claim_note_too_long",
  "page_claim_mandate_required",
  "page_claim_consent_required",
  "page_claim_closed",
  // Logo et bannière (garde des fichiers du moteur).
  "page_image_type_invalid",
  "page_image_too_large",
  // AS-11a : la page dort depuis plus de trente jours ; seule l'équipe de modération peut agir.
  "page_sleep_expired",
] as const

export type PageAdminErrorCode = (typeof PAGE_ADMIN_ERROR_CODES)[number]

/**
 * Rôle VIVANT de qui PARLE au nom de la page : `admin` publie et gère,
 * `signatory` (affiché « Éditeur ») publie. Jamais un modérateur (AS-10) : ce nom
 * garde le sens du moteur (`PageRole`, `viewer.role`, `myPages`).
 */
export type ManagedPageRole = "admin" | "signatory"

/** Les rôles qui parlent au nom de la page, dans l'ordre d'affichage (ceux du moteur). */
export const MANAGED_PAGE_ROLES: readonly ManagedPageRole[] = PAGE_ROLES

/**
 * AS-10 — le rôle dans l'ÉQUIPE de la page, CELUI du moteur (une seule source :
 * `PAGE_TEAM_ROLES`, `PageTeamRole`, `isPageSignatoryRole`), dans son ordre :
 *   · `admin` publie et gère (identité, équipe, revendication, boutique, groupe) ;
 *   · `signatory`, affiché « Éditeur » dans DIASPORALE, publie sans gérer ;
 *   · `moderator` retire les commentaires sous les publications de la page, voit
 *     l'équipe et s'en retire ; il ne publie pas et ne parle jamais au nom de la page
 *     (`isPageSignatoryRole` le dit).
 */
export { isPageSignatoryRole, PAGE_TEAM_ROLES, type PageTeamRole }

/**
 * MON rôle VIVANT dans l'équipe d'une page lue. Un fournisseur antérieur à AS-10
 * ne connaît que les rôles qui parlent : son `myRole` en tient lieu.
 */
export function myTeamRoleOf(page: Pick<ManagedPageDetailView, "myRole" | "myTeamRole">): PageTeamRole | null {
  return page.myTeamRole === undefined ? page.myRole : page.myTeamRole
}

/** Une page au nom de laquelle la personne parle dans DIASPORALE (invitation acceptée, rôle vivant). */
export interface ManagedPageView {
  readonly id: string
  readonly handle: string
  readonly name: string
  readonly ownerKind: PageOwnerKind
  readonly role: ManagedPageRole
  /** Badge CALCULÉ par le serveur (confiance de la page) — ajout DG-008, facultatif. */
  readonly badge?: PageTrustLevel
  /** Pays de la page — ajout DG-008, facultatif. */
  readonly country?: CountryCode | null
}

/**
 * AS-10 — une page dont la personne fait partie de l'ÉQUIPE vivante (invitation
 * acceptée), modérateur compris : « Mes pages » y montre ce que chaque rôle peut faire.
 */
export interface TeamPageView extends Omit<ManagedPageView, "role"> {
  readonly teamRole: PageTeamRole
}

// ═══════════════════════════════════════════════════════════════
// Natures, statuts, mandats — listes fermées
// ═══════════════════════════════════════════════════════════════

/** Les natures qu'un MEMBRE peut créer (celles du moteur) : jamais une institution. */
export const MEMBER_PAGE_KINDS = MEMBER_PAGE_OWNER_KINDS
export type MemberPageKind = (typeof MEMBER_PAGE_KINDS)[number]

export function isMemberPageKind(value: string | null | undefined): value is MemberPageKind {
  return value !== null && value !== undefined && (MEMBER_PAGE_KINDS as readonly string[]).includes(value)
}

/**
 * Les natures qu'un membre INSCRIT dans DIASPORALE (AS-05, décision 2 du plan 07) :
 * association et entreprise au pilote. Le moteur en accepte davantage ; l'écran les
 * propose seules, et chaque adaptateur refuse les autres (`page_kind_reserved`).
 */
export const REGISTRABLE_PAGE_KINDS: readonly MemberPageKind[] = Object.freeze(MEMBER_PAGE_KINDS.filter((kind) => canMemberCreatePageKind(kind)))

export function isRegistrablePageKind(value: string | null | undefined): value is MemberPageKind {
  return isMemberPageKind(value) && canMemberCreatePageKind(value)
}

/** États d'une revendication (ceux du moteur) ; seule `pending` se tranche ou se retire. */
export const PAGE_CLAIM_STATES = PAGE_CLAIM_STATUSES
export type PageClaimStatus = (typeof PAGE_CLAIM_STATES)[number]

/**
 * Le mandat DÉCLARÉ du demandeur — une déclaration, jamais une preuve : les
 * pièces jointes le prouvent, la modération en juge. Il ouvre la note de la
 * revendication, dans la langue du demandeur.
 */
export const PAGE_CLAIM_MANDATES = ["legal_representative", "board_member", "owner_manager", "mandated_member", "other"] as const
export type PageClaimMandate = (typeof PAGE_CLAIM_MANDATES)[number]

/** Longueur des précisions libres : la note entière (mandat compris) tient dans la borne du moteur. */
export const PAGE_CLAIM_DETAILS_MAX_LENGTH = PAGE_CLAIM_NOTE_MAX_LENGTH - 120

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

/** La carte d'une page : de quoi la reconnaître et l'ouvrir, rien d'autre. */
export interface PageRefView {
  readonly id: string
  readonly handle: string
  readonly name: string
  readonly ownerKind: PageOwnerKind
  /** Badge CALCULÉ par le serveur : `official`, `verified` ou `community`. */
  readonly badge: PageTrustLevel
  readonly country: CountryCode | null
}

/** Une page, vue par qui la gère (ou s'apprête à la revendiquer). */
export interface ManagedPageDetailView extends PageRefView {
  readonly shortName: string | null
  readonly description: string | null
  /** Présentation facultative ; `undefined` : fournisseur antérieur à cette capacité. */
  readonly city?: string | null
  readonly associationType?: AssociationType | null
  readonly sector?: CompanySector | null
  /** Images servies par la garde des fichiers ; `null` : aucune, ou retenue pendant l'analyse. */
  readonly logoUrl: string | null
  readonly bannerUrl: string | null
  /** MON rôle VIVANT qui parle au nom de la page, relu à chaque lecture ; `null` : lecteur, ou modérateur. */
  readonly myRole: ManagedPageRole | null
  /**
   * AS-10 : MON rôle VIVANT dans l'équipe, modérateur compris (`viewer.teamRole` du moteur) ;
   * `undefined` : fournisseur antérieur, lire `myRole` (voir `myTeamRoleOf`).
   */
  readonly myTeamRole?: PageTeamRole | null
}

/** Un membre de l'équipe (invitations comprises) ; l'équipe vivante seule le voit, modérateurs compris. */
export interface PageSignatoryView {
  readonly personId: string
  /** Profil PUBLIÉ ; `null` : profil retiré (nom neutre). */
  readonly handle: string | null
  readonly displayName: string | null
  readonly role: PageTeamRole
  /** Invitation acceptée ? Une invitation en attente ne donne aucun droit. */
  readonly accepted: boolean
  readonly since: number
  readonly isMe: boolean
}

/** Une invitation à rejoindre l'équipe d'une page, en attente de MA réponse. */
export interface PageInvitationView {
  readonly page: PageRefView
  readonly role: PageTeamRole
  readonly invitedAt: number
}

/**
 * Une revendication, telle que son demandeur la lit (« Mes revendications »).
 * L'instruction vit au bureau de modération (AS-01, capacité « modération par pays »).
 */
export interface PageClaimView {
  readonly id: string
  readonly page: PageRefView
  readonly claimant: { readonly personId: string; readonly handle: string | null; readonly displayName: string | null }
  readonly status: PageClaimStatus
  readonly note: string | null
  readonly evidenceCount: number
  readonly decisionReason: string | null
  readonly createdAt: number
  readonly decidedAt: number | null
}

/**
 * AS-11a — une page EN SOMMEIL dont je fais partie de l'équipe (`mySleepingPages`
 * du moteur). Absente partout comme une page retirée, elle ne se lit plus qu'ici :
 *   · `asleep` : tout administrateur de la page la réactive jusqu'à `sleepEndsAt` ;
 *   · `expired` : le délai est passé, la réactivation est refusée
 *     (`page_sleep_expired`) et rien n'est effacé : seule l'équipe de modération agit.
 * `canWake` est jugé par le serveur (administrateur, délai, aucune mesure de la
 * modération) ; l'écran ne le déduit jamais du rôle.
 */
export interface SleepingPageView extends PageRefView {
  readonly teamRole: PageTeamRole
  readonly sleepEndsAt: number
  readonly state: SleepingPageState
  readonly canWake: boolean
}

/** Les états d'une page en sommeil vus de « Mes pages » : ceux du moteur (`PageSleepState`), hors `none`. */
export type SleepingPageState = Exclude<PageSleepState, "none">

export type PageImageSlot = "logo" | "banner"

export interface PageImageView {
  readonly url: string | null
  readonly withheld: MediaWithheld | null
}

// ═══════════════════════════════════════════════════════════════
// Écritures
// ═══════════════════════════════════════════════════════════════

export interface CreatePageInput {
  readonly name: string
  readonly ownerKind: MemberPageKind
  /** Facultative : sans elle, le moteur dérive l'adresse du nom. */
  readonly handle?: string
  readonly shortName?: string
  readonly description?: string
  readonly city?: string
  readonly associationType?: AssociationType
  readonly sector?: CompanySector
  /** Le pays est le contexte permanent de DIASPORALE : une page en déclare un. */
  readonly country: CountryCode
}

/** Les champs d'identité ; `null` efface un champ facultatif. L'adresse ne change pas ici. */
export interface PageIdentityInput {
  readonly name: string
  readonly shortName: string | null
  readonly description: string | null
  readonly country: CountryCode | null
  /** Omettre conserve la valeur ; `null` efface explicitement ce champ. */
  readonly city?: string | null
  readonly associationType?: AssociationType | null
  readonly sector?: CompanySector | null
}

export interface PageClaimInput {
  readonly pageId: string
  readonly note?: string
  /** Une à cinq pièces, déposées NEUVES au moment de l'envoi, privées. */
  readonly evidence: readonly File[]
}

/** Tout ce que DG-008 ajoute au contrat — facultatif pour les fournisseurs qui ne le servent pas. */
export interface PageManagement {
  /** Le fournisseur sait lire et enregistrer ville et catégorie sans ignorer ces champs. */
  readonly supportsPresentation?: true
  /** Une page lisible d'ici et MON rôle vivant (`null` : introuvable ou illisible, même réponse). */
  useManagedPage(handle: string): Loadable<ManagedPageDetailView | null>
  /** L'équipe d'une page, dans l'ordre administrateurs, éditeurs, modérateurs ; refusée (`page_role_required`) dès que je n'y ai plus de rôle vivant. */
  useSignatories(pageId: string | null): Loadable<readonly PageSignatoryView[]>
  useMyInvitations(): Loadable<readonly PageInvitationView[]>
  /** Mes revendications dans DIASPORALE, les plus récentes d'abord (cinquante au plus). */
  useMyClaims(): Loadable<readonly PageClaimView[]>

  createPage(input: CreatePageInput): Promise<ActionResult<{ pageId: string; handle: string }>>
  updateIdentity(pageId: string, input: PageIdentityInput): Promise<ActionResult<{ changed: boolean }>>
  /** Logo ou bannière (`null` : retirer) — facultatif : un fournisseur sans dépôt de fichier l'omet. */
  setImage?(pageId: string, slot: PageImageSlot, file: File | null): Promise<ActionResult<PageImageView>>
  /**
   * Habiliter (invitation) ou changer le rôle d'un membre de l'équipe — un administrateur
   * vivant. Le rôle d'un membre déjà ACCEPTÉ change aussitôt, sans invitation
   * (`invited: false`) ; le dernier administrateur ne se rétrograde pas.
   */
  grantRole(pageId: string, handle: string, role: PageTeamRole): Promise<ActionResult<{ personId: string; role: PageTeamRole; invited: boolean }>>
  /** Retirer un membre (administrateur), ou se retirer soi-même, quel que soit son rôle ; le dernier administrateur reste. */
  revokeRole(pageId: string, personId: string): Promise<ActionResult<{ revoked: boolean }>>
  respondToInvitation(pageId: string, accept: boolean): Promise<ActionResult<{ role: PageTeamRole | null }>>
  requestClaim(input: PageClaimInput): Promise<ActionResult<{ claimId: string }>>
  /** Retirer MA revendication en attente ; ses pièces sont purgées. `withdrawn: false` : déjà tranchée. */
  withdrawClaim(claimId: string): Promise<ActionResult<{ withdrawn: boolean }>>

  /**
   * AS-11a — mettre la page en sommeil : un administrateur VIVANT d'une page de nature
   * créable par un membre (jamais une institution). Page, offres, emplois, évènements
   * et publications disparaissent pour tout le monde ; rien n'est écrit sur ces objets
   * et personne n'est prévenu. Rend l'échéance de la réactivation. Facultatif :
   * absent, l'écran ne propose pas le geste.
   */
  putToSleep?(pageId: string): Promise<ActionResult<{ sleepEndsAt: number }>>
  /**
   * AS-11a — réactiver une page en sommeil : tout administrateur de la page, tant que le
   * délai court ; échu, `page_sleep_expired`. Le réveil rend tout ce que le sommeil masquait.
   */
  wake?(pageId: string): Promise<ActionResult<{ status: "active" }>>
  /** AS-11a — les pages en sommeil dont je fais partie de l'équipe, bornées par le moteur. */
  useMySleepingPages?(): Loadable<readonly SleepingPageView[]>
}

export interface PageAdminCapability {
  /** Mes pages (rôle vivant qui parle au nom de la page), dans le réseau DIASPORALE ; jamais une page que je modère seulement. */
  useMyPages(): Loadable<readonly ManagedPageView[]>
  /**
   * AS-10 : les pages dont je fais partie de l'équipe vivante, modérateur compris
   * (`myTeamPages` du moteur). Absent : fournisseur antérieur, « Mes pages » lit `useMyPages`.
   */
  useMyTeamPages?(): Loadable<readonly TeamPageView[]>
  /** Création, revendication et équipe (DG-008) ; l'instruction est au bureau de modération (AS-01). Absent : indisponible. */
  readonly management?: PageManagement
}

// ═══════════════════════════════════════════════════════════════
// Règles d'écran — celles du moteur, dites en codes fermés
// ═══════════════════════════════════════════════════════════════

/** Les règles du domaine des pages que l'écran sait dire (même table que l'adaptateur du moteur). */
export const PAGE_RULE_CODES: Readonly<Record<string, PageAdminErrorCode>> = {
  PAGE_HANDLE_LENGTH: "page_handle_length",
  PAGE_HANDLE_CHARSET: "page_handle_charset",
  PAGE_NAME_LENGTH: "page_name_invalid",
  PAGE_SHORT_NAME_TOO_LONG: "page_short_name_too_long",
  PAGE_DESCRIPTION_TOO_LONG: "page_description_too_long",
  PAGE_CLAIM_NOTE_TOO_LONG: "page_claim_note_too_long",
}

function ruleRefusal(rule: () => unknown): PageAdminErrorCode | null {
  try {
    rule()
    return null
  } catch (error) {
    if (isDomainViolation(error)) return PAGE_RULE_CODES[error.code] ?? null
    throw error
  }
}

/** L'adresse qu'aura la page : celle saisie, sinon dérivée du nom (même repli que le moteur). */
export function pageHandleFor(input: { readonly name: string; readonly handle?: string | undefined }): string {
  const typed = input.handle?.trim() ?? ""
  return derivePageHandle(typed.length > 0 ? typed : input.name)
}

export function pageNameRefusal(name: string): PageAdminErrorCode | null {
  return ruleRefusal(() => assertPageName(name))
}

export function pageHandleRefusal(input: { readonly name: string; readonly handle?: string | undefined }): PageAdminErrorCode | null {
  const typed = input.handle?.trim() ?? ""
  return ruleRefusal(() => assertPageHandle(typed.length > 0 ? typed : input.name))
}

export function pageShortNameRefusal(shortName: string): PageAdminErrorCode | null {
  return ruleRefusal(() => normalizePageShortName(shortName))
}

export function pageDescriptionRefusal(description: string): PageAdminErrorCode | null {
  return ruleRefusal(() => normalizePageDescription(description))
}

export function pageClaimNoteRefusal(note: string): PageAdminErrorCode | null {
  return ruleRefusal(() => normalizePageClaimNote(note))
}

/** Les pièces d'une revendication : PDF ou photo, dix mégaoctets au plus (politique `page_claim_evidence`). */
export const PAGE_CLAIM_EVIDENCE_ACCEPT = UPLOAD_USAGES.page_claim_evidence.mimeTypes.join(",")
export const PAGE_CLAIM_EVIDENCE_MAX_BYTES = UPLOAD_USAGES.page_claim_evidence.maxBytes

/** Une pièce seule : son type et son poids, jugés comme le moteur les jugera au rattachement. */
export function pageEvidenceRefusal(file: Pick<File, "type" | "size">): ActionErrorCode | null {
  if (!isMimeAllowedForUsage("page_claim_evidence", normalizeMimeType(file.type))) return "page_claim_evidence_type"
  if (file.size <= 0 || file.size > PAGE_CLAIM_EVIDENCE_MAX_BYTES) return "page_claim_evidence_too_large"
  return null
}

/** L'ensemble des pièces : une à cinq, chacune recevable. */
export function pageEvidenceSetRefusal(files: readonly Pick<File, "type" | "size">[]): ActionErrorCode | null {
  if (files.length < 1 || files.length > PAGE_CLAIM_EVIDENCE_MAX) return "page_claim_evidence_count"
  for (const file of files) {
    const refusal = pageEvidenceRefusal(file)
    if (refusal) return refusal
  }
  return null
}

const IMAGE_USAGE = { logo: "page_logo", banner: "page_banner" } as const

/** Le logo (5 Mo) et la bannière (10 Mo) : images JPEG, PNG ou WebP (politique du moteur). */
export const PAGE_IMAGE_ACCEPT = UPLOAD_USAGES.page_logo.mimeTypes.join(",")
export const PAGE_IMAGE_MAX_BYTES: Readonly<Record<PageImageSlot, number>> = {
  logo: UPLOAD_USAGES.page_logo.maxBytes,
  banner: UPLOAD_USAGES.page_banner.maxBytes,
}

export function pageImageRefusal(slot: PageImageSlot, file: Pick<File, "type" | "size">): ActionErrorCode | null {
  if (!isMimeAllowedForUsage(IMAGE_USAGE[slot], normalizeMimeType(file.type))) return "page_image_type_invalid"
  if (file.size <= 0 || file.size > PAGE_IMAGE_MAX_BYTES[slot]) return "page_image_too_large"
  return null
}
