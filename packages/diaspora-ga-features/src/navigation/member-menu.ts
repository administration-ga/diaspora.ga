/**
 * Le menu des membres de diaspora.ga — module PUR (fiche CH-815, D4 et § 5, « l'aperçu du menu
 * ne peut pas mentir »).
 *
 * Le menu reste du CODE ; les modules du réseau (ADR-0041 du moteur) sont le seul levier. Cette
 * fonction dit, pour des modules ouverts et une situation de membre, le menu EXACT que la coque
 * de diaspora.ga monte : la barre (rail du bureau et barre basse du téléphone, même liste), le
 * menu du compte (profil, réglages, « Mon espace », mes données), son groupe « Informations » et
 * les formats de « Créer ». La coque des membres la lit pour monter ses entrées ; l'aperçu
 * d'admin.diaspora.ga la lit pour montrer le menu avant d'ouvrir un module. Un test commun de
 * diaspora.ga verrouille que la coque rend exactement ce qu'elle renvoie.
 *
 * Chaque entrée porte la clé de son adresse dans la table des routes de diaspora.ga (jamais une
 * adresse : l'application la compose) et la clé de son libellé dans l'espace `diaspora-ga`. Le
 * module dont relève son adresse et le public qui la voit sont DÉCLARÉS ici, dans une seule
 * table, que la fonction lit : diaspora.ga prouve par ses tests que le module déclaré est bien
 * celui de sa table des adresses, et que « Communautés » s'offre avec les mêmes modules.
 */
import { NETWORK_FEATURE_PARENTS, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import type { MembershipStatus } from "@diaspora-ga/domain"

import { MEMBERS_APP_CODE_SWITCH_STATES, type CodeSwitchState, type MembersAppCodeSwitch } from "./code-switches"

// ═══════════════════════════════════════════════════════════════
// Les entrées
// ═══════════════════════════════════════════════════════════════

/** La barre, dans l'ordre du rendu (DG-005) : cinq entrées au plus. `explore` s'affiche « Membres ». */
export const MEMBER_BAR_ENTRIES = ["feed", "explore", "services", "communities", "messages"] as const
/** « Mon espace » : les entrées personnelles du menu du compte, dans leur ordre… */
export const MEMBER_PERSONAL_ENTRIES = ["myRequests", "myActivity", "myAssociations", "myApplications", "myMentoring", "relations", "bookmarks", "sponsor"] as const
/**
 * … puis celles des responsables que le serveur reconnaît : le guichet de modération seul. La
 * mesure du pilote n'est plus une adresse de diaspora.ga (fiche CH-815, lot A6) : elle se lit
 * dans l'application d'administration, section « Mesure ».
 */
export const MEMBER_RESPONSIBLE_ENTRIES = ["moderation"] as const
/** Le compte, en tête du menu du compte ; « Mes données » le ferme. */
export const MEMBER_ACCOUNT_ENTRIES = ["profile", "settings"] as const
export const MEMBER_DATA_ENTRY = "myData" as const
/** Le groupe « Informations » du menu du compte : les textes du site. */
export const MEMBER_INFORMATION_ENTRIES = ["legalNotice", "privacy", "terms", "communityRules", "contact", "charte"] as const
/**
 * Les formats de « Créer », dans l'ordre : un live, une actu, puis les deux inscriptions. Le live
 * passe en tête comme la conférence du réseau de l'administration, juste après la publication
 * (`creationEntries` du socle : publication, conférence, actu) ; « Publier » a ici son bouton à part.
 */
export const MEMBER_CREATE_FORMATS = ["live", "story", "association", "company"] as const

export type MemberBarEntryId = (typeof MEMBER_BAR_ENTRIES)[number]
export type MemberMenuEntryId =
  | MemberBarEntryId
  | (typeof MEMBER_PERSONAL_ENTRIES)[number]
  | (typeof MEMBER_RESPONSIBLE_ENTRIES)[number]
  | (typeof MEMBER_ACCOUNT_ENTRIES)[number]
  | typeof MEMBER_DATA_ENTRY
  | (typeof MEMBER_INFORMATION_ENTRIES)[number]
export type MemberCreateFormatId = (typeof MEMBER_CREATE_FORMATS)[number]

/** Toutes les entrées, dans l'ordre où le menu les présente. */
export const MEMBER_MENU_ENTRY_IDS: readonly MemberMenuEntryId[] = [
  ...MEMBER_BAR_ENTRIES,
  ...MEMBER_ACCOUNT_ENTRIES,
  ...MEMBER_PERSONAL_ENTRIES,
  ...MEMBER_RESPONSIBLE_ENTRIES,
  MEMBER_DATA_ENTRY,
  ...MEMBER_INFORMATION_ENTRIES,
]

/** Les clés de la table des routes de diaspora.ga qu'une entrée du menu désigne. */
export type MemberMenuRouteKey =
  | "feed"
  | "explore"
  | "services"
  | "communities"
  | "messages"
  | "profile"
  | "settings"
  | "myServiceRequests"
  | "myActivity"
  | "myAssociations"
  | "myApplications"
  | "myMentoring"
  | "relations"
  | "bookmarks"
  | "sponsor"
  | "moderationDesk"
  | "settingsData"
  | "legalNotice"
  | "privacy"
  | "terms"
  | "communityRules"
  | "contact"
  | "charte"
  | "newStory"
  | "newPage"

/**
 * Qui voit une entrée, quand son module est ouvert :
 *  · `everyone` — tout membre que la coque accueille ;
 *  · `icom` — iCom ouvert pour ce membre (mode moteur, adhésion qui peut écrire) ;
 *  · `engineNetwork` — le réseau de lecture du moteur (adhésion ni suspendue ni quittée) ;
 *  · `pageTeam` — une page où il tient un rôle vivant, ou une de ses pages en sommeil ;
 *  · `associationMember` — une adhésion à une association, ou une demande en cours ;
 *  · `moderator` — le guichet de modération que le serveur lui reconnaît ;
 *  · `publisher` — il peut publier et iCom sert les actus ;
 *  · `registrant` — son adhésion voit l'inscription d'une page (`canSeeRegistration`).
 */
export const MEMBER_MENU_AUDIENCES = ["everyone", "icom", "engineNetwork", "pageTeam", "associationMember", "moderator", "publisher", "registrant"] as const
export type MemberMenuAudience = (typeof MEMBER_MENU_AUDIENCES)[number]

/** La règle d'une entrée : son adresse, son libellé, le module de son adresse et son public. */
export interface MemberMenuEntryRule {
  readonly routeKey: MemberMenuRouteKey
  /** Clé de l'espace `diaspora-ga`, en toutes lettres (cliquet des clés de diaspora.ga). */
  readonly labelKey: string
  /** Le module dont relève l'adresse (`null` : le socle, toujours servi). */
  readonly feature: NetworkFeature | null
  readonly audience: MemberMenuAudience
  /** L'entrée ne s'offre qu'avec l'un de ces modules ouvert (« Communautés »). */
  readonly offeredWith?: readonly NetworkFeature[]
}

/**
 * Les modules rangés sous « Communautés » (groupes et évènements, emploi, entraide, mentorat, kit
 * d'arrivée), dans l'ordre des clés du moteur. diaspora.ga les DÉRIVE de ses deux tables
 * (`featuresUnderDestination("communities")`) et prouve par un test que c'est cette liste.
 */
export const MEMBER_COMMUNITY_FEATURES: readonly NetworkFeature[] = ["groupsAndEvents", "jobs", "mutualAid", "mentoring", "arrivalKit"]

const CORE = null

export const MEMBER_MENU_ENTRIES: Readonly<Record<MemberMenuEntryId, MemberMenuEntryRule>> = {
  // La barre (menu léger, CH-816) : Fil et Membres toujours ; Services avec son module ;
  // Communautés dès qu'un module rangé sous elle est ouvert ; Messages avec iCom.
  feed: { routeKey: "feed", labelKey: "nav.feed", feature: CORE, audience: "everyone" },
  explore: { routeKey: "explore", labelKey: "nav.members", feature: CORE, audience: "everyone" },
  services: { routeKey: "services", labelKey: "nav.services", feature: "services", audience: "everyone" },
  communities: { routeKey: "communities", labelKey: "nav.communities", feature: CORE, audience: "everyone", offeredWith: MEMBER_COMMUNITY_FEATURES },
  messages: { routeKey: "messages", labelKey: "nav.messages", feature: CORE, audience: "icom" },
  // Le compte.
  profile: { routeKey: "profile", labelKey: "nav.profile", feature: CORE, audience: "everyone" },
  settings: { routeKey: "settings", labelKey: "nav.settings", feature: CORE, audience: "everyone" },
  // « Mon espace » : une entrée n'y paraît qu'avec un contenu, ou quand son module est ouvert.
  myRequests: { routeKey: "myServiceRequests", labelKey: "nav.myRequests", feature: "services", audience: "everyone" },
  myActivity: { routeKey: "myActivity", labelKey: "nav.myActivity", feature: "pages", audience: "pageTeam" },
  myAssociations: { routeKey: "myAssociations", labelKey: "nav.myAssociations", feature: "pages", audience: "associationMember" },
  myApplications: { routeKey: "myApplications", labelKey: "nav.myApplications", feature: "jobs", audience: "everyone" },
  myMentoring: { routeKey: "myMentoring", labelKey: "nav.myMentoring", feature: "mentoring", audience: "everyone" },
  relations: { routeKey: "relations", labelKey: "nav.relations", feature: CORE, audience: "engineNetwork" },
  bookmarks: { routeKey: "bookmarks", labelKey: "bookmarks.title", feature: CORE, audience: "everyone" },
  sponsor: { routeKey: "sponsor", labelKey: "nav.sponsor", feature: CORE, audience: "everyone" },
  // Les responsables : le serveur rejuge chaque lecture derrière ces entrées.
  moderation: { routeKey: "moderationDesk", labelKey: "nav.moderation", feature: CORE, audience: "moderator" },
  myData: { routeKey: "settingsData", labelKey: "nav.myData", feature: CORE, audience: "everyone" },
  // Les textes du site, mêmes libellés que le pied des pages publiques.
  legalNotice: { routeKey: "legalNotice", labelKey: "footer.legalNotice", feature: CORE, audience: "everyone" },
  privacy: { routeKey: "privacy", labelKey: "footer.privacy", feature: CORE, audience: "everyone" },
  terms: { routeKey: "terms", labelKey: "footer.terms", feature: CORE, audience: "everyone" },
  communityRules: { routeKey: "communityRules", labelKey: "footer.community", feature: CORE, audience: "everyone" },
  contact: { routeKey: "contact", labelKey: "footer.contact", feature: CORE, audience: "everyone" },
  charte: { routeKey: "charte", labelKey: "footer.charte", feature: CORE, audience: "everyone" },
}

/** La règle d'un format de « Créer ». */
export interface MemberCreateFormatRule {
  /**
   * La clé de l'adresse du format. `null` : le format n'a pas d'adresse, il ouvre EN PLACE la surface
   * de création du moteur — la conférence, comme « Créer → Conférence » du moteur
   * (`requestConferenceLaunch`, consommé par l'hôte du direct de la couche de communication).
   */
  readonly routeKey: "newStory" | "newPage" | null
  /** La nature de la page à inscrire (`newPage` seulement). */
  readonly pageKind: "association" | "company" | null
  readonly labelKey: string
  readonly hintKey: string
  readonly feature: NetworkFeature | null
  readonly audience: MemberMenuAudience
  /** L'interrupteur de CODE qui doit être ouvert pour offrir le format (`null` : aucun). Ni un module ni un droit. */
  readonly codeSwitch: MembersAppCodeSwitch | null
}

/**
 * Un live (le direct du moteur) quand l'interrupteur de code `live` est ouvert ; une actu ; puis
 * l'inscription d'une association et d'une entreprise (AS-05) quand les pages sont ouvertes. Les
 * groupes thématiques n'y sont pas (décision 3 du plan 07). Le live suit le public de l'actu
 * (`publisher` : publier ET iCom ouvert) : sans iCom, l'hôte du direct du moteur n'est pas monté et
 * le geste ne mènerait à rien. Il ouvre en place la création du moteur, comme « Créer → Conférence »
 * du moteur (`creation-controller`) ; « live » est le mot de DIASPORA.GA (décision du 26/11/2026).
 */
export const MEMBER_CREATE_RULES: Readonly<Record<MemberCreateFormatId, MemberCreateFormatRule>> = {
  story: { routeKey: "newStory", pageKind: null, labelKey: "nav.create.story", hintKey: "nav.create.storyHint", feature: CORE, audience: "publisher", codeSwitch: null },
  live: { routeKey: null, pageKind: null, labelKey: "nav.create.live", hintKey: "nav.create.liveHint", feature: CORE, audience: "publisher", codeSwitch: "live" },
  association: { routeKey: "newPage", pageKind: "association", labelKey: "nav.create.association", hintKey: "nav.create.associationHint", feature: "pages", audience: "registrant", codeSwitch: null },
  company: { routeKey: "newPage", pageKind: "company", labelKey: "nav.create.company", hintKey: "nav.create.companyHint", feature: "pages", audience: "registrant", codeSwitch: null },
}

/** Les positions des interrupteurs de code qu'un menu lit. */
export type MemberCodeSwitchStates = Readonly<Record<MembersAppCodeSwitch, CodeSwitchState>>

// ═══════════════════════════════════════════════════════════════
// La situation du membre
// ═══════════════════════════════════════════════════════════════

/**
 * Les adhésions qui voient « Inscrire une association / une entreprise » : tout membre en règle.
 * Le serveur exige ensuite `verifiee`, et l'écran d'inscription dit à un membre non vérifié comment
 * le devenir. Une adhésion suspendue ou quittée n'inscrit rien.
 */
export const REGISTERING_STATUSES: readonly MembershipStatus[] = ["en_attente", "declaree", "verifiee"]

export function canSeeRegistration(status: MembershipStatus): boolean {
  return REGISTERING_STATUSES.includes(status)
}

/** Ce que la coque sait du membre pour décider de ses entrées, hors modules. */
export interface MemberMenuSituation {
  readonly icom: boolean
  readonly engineNetwork: boolean
  readonly canPublish: boolean
  readonly status: MembershipStatus
  readonly holdsPageRole: boolean
  readonly holdsAssociation: boolean
  readonly moderator: boolean
}

export interface MemberMenuInput extends MemberMenuSituation {
  /**
   * Les modules SERVIS au membre (ce que la garde de la source dit ouvert). La règle du module
   * exigé est celle du moteur : la coque reçoit des clés déjà servies, la fonction ne la rejoue pas.
   */
  readonly openFeatures: readonly NetworkFeature[]
  /**
   * Les interrupteurs de code lus (absents : ceux du code, `MEMBERS_APP_CODE_SWITCH_STATES`). La
   * coque et l'aperçu d'admin.diaspora.ga n'en passent pas : ils montrent donc ce que le code sert.
   * Seuls les tests posent ici une autre position.
   */
  readonly codeSwitches?: MemberCodeSwitchStates
}

/** La situation la plus large : tout public touché. Sert à dire tout ce qu'un module PEUT ajouter. */
export const MEMBER_MENU_WIDEST_SITUATION: MemberMenuSituation = {
  icom: true,
  engineNetwork: true,
  canPublish: true,
  status: "verifiee",
  holdsPageRole: true,
  holdsAssociation: true,
  moderator: true,
}

/** Le public est-il touché par cette situation ? */
export function audienceReached(audience: MemberMenuAudience, situation: MemberMenuSituation): boolean {
  switch (audience) {
    case "everyone":
      return true
    case "icom":
      return situation.icom
    case "engineNetwork":
      return situation.engineNetwork
    case "pageTeam":
      return situation.holdsPageRole
    case "associationMember":
      return situation.holdsAssociation
    case "moderator":
      return situation.moderator
    case "publisher":
      return situation.canPublish && situation.icom
    case "registrant":
      return canSeeRegistration(situation.status)
  }
}

// ═══════════════════════════════════════════════════════════════
// Le menu
// ═══════════════════════════════════════════════════════════════

export interface MemberMenuEntry {
  readonly id: MemberMenuEntryId
  readonly routeKey: MemberMenuRouteKey
  readonly labelKey: string
}

export interface MemberCreateEntry {
  readonly id: MemberCreateFormatId
  readonly routeKey: MemberCreateFormatRule["routeKey"]
  readonly pageKind: MemberCreateFormatRule["pageKind"]
  readonly labelKey: string
  readonly hintKey: string
}

export interface MemberMenu {
  /** Le rail du bureau : la barre, dans l'ordre. */
  readonly rail: readonly MemberMenuEntry[]
  /** La barre basse du téléphone : la même liste que le rail. */
  readonly phoneBar: readonly MemberMenuEntry[]
  /** « Mon espace » : les entrées personnelles puis celles des responsables (dans le menu du compte). */
  readonly personal: readonly MemberMenuEntry[]
  /** Le menu du compte : profil, réglages, « Mon espace », mes données. */
  readonly account: readonly MemberMenuEntry[]
  /** Le groupe « Informations » du menu du compte. */
  readonly information: readonly MemberMenuEntry[]
  /** « Créer » : sous « Publier » au bureau, dans la feuille du compte au téléphone. */
  readonly create: readonly MemberCreateEntry[]
}

/** L'entrée paraît-elle ? Son module servi, le module qui l'offre servi, son public touché. */
function shown(rule: MemberMenuEntryRule | MemberCreateFormatRule, open: ReadonlySet<NetworkFeature>, situation: MemberMenuSituation): boolean {
  if (rule.feature !== null && !open.has(rule.feature)) return false
  if ("offeredWith" in rule && rule.offeredWith !== undefined && !rule.offeredWith.some((feature) => open.has(feature))) return false
  return audienceReached(rule.audience, situation)
}

/** Le code permet-il le format ? Sans interrupteur, toujours ; avec, seulement s'il est ouvert. */
export function codeSwitchAllows(rule: Pick<MemberCreateFormatRule, "codeSwitch">, switches: MemberCodeSwitchStates = MEMBERS_APP_CODE_SWITCH_STATES): boolean {
  return rule.codeSwitch === null || switches[rule.codeSwitch] === "open"
}

/** Le menu exact des membres pour ces modules servis et cette situation. */
export function memberMenu(input: MemberMenuInput): MemberMenu {
  const open = new Set(input.openFeatures)
  const switches = input.codeSwitches ?? MEMBERS_APP_CODE_SWITCH_STATES
  const pick = (ids: readonly MemberMenuEntryId[]): MemberMenuEntry[] =>
    ids
      .filter((id) => shown(MEMBER_MENU_ENTRIES[id], open, input))
      .map((id) => ({ id, routeKey: MEMBER_MENU_ENTRIES[id].routeKey, labelKey: MEMBER_MENU_ENTRIES[id].labelKey }))
  const bar = pick(MEMBER_BAR_ENTRIES)
  const personal = pick([...MEMBER_PERSONAL_ENTRIES, ...MEMBER_RESPONSIBLE_ENTRIES])
  const offered = (id: MemberCreateFormatId) => codeSwitchAllows(MEMBER_CREATE_RULES[id], switches) && shown(MEMBER_CREATE_RULES[id], open, input)
  const create = MEMBER_CREATE_FORMATS.filter(offered).map((id): MemberCreateEntry => {
    const rule = MEMBER_CREATE_RULES[id]
    return { id, routeKey: rule.routeKey, pageKind: rule.pageKind, labelKey: rule.labelKey, hintKey: rule.hintKey }
  })
  return {
    rail: bar,
    phoneBar: bar,
    personal,
    account: [...pick(MEMBER_ACCOUNT_ENTRIES), ...personal, ...pick([MEMBER_DATA_ENTRY])],
    information: pick(MEMBER_INFORMATION_ENTRIES),
    create,
  }
}

// ═══════════════════════════════════════════════════════════════
// Ce qu'un module change au menu
// ═══════════════════════════════════════════════════════════════

/** Où se tient une entrée qui change : la barre (rail et téléphone), le menu du compte, ou « Créer ». */
export const MEMBER_MENU_PLACEMENTS = ["bar", "account", "create"] as const
export type MemberMenuPlacement = (typeof MEMBER_MENU_PLACEMENTS)[number]

export interface MemberMenuChange {
  readonly placement: MemberMenuPlacement
  readonly id: MemberMenuEntryId | MemberCreateFormatId
  readonly labelKey: string
  /** Le public de l'entrée : qui la verra (ou ne la verra plus). */
  readonly audience: MemberMenuAudience
}

function audienceOf(placement: MemberMenuPlacement, id: MemberMenuEntryId | MemberCreateFormatId): MemberMenuAudience {
  return placement === "create" ? MEMBER_CREATE_RULES[id as MemberCreateFormatId].audience : MEMBER_MENU_ENTRIES[id as MemberMenuEntryId].audience
}

/**
 * Les entrées présentes dans `after` et absentes de `before`, par endroit (barre, compte, « Créer »),
 * dans l'ordre du menu. Les retraits se lisent en inversant les deux menus. Le groupe
 * « Informations » ne dépend d'aucun module : il n'y figure jamais.
 */
export function menuDifference(before: MemberMenu, after: MemberMenu): MemberMenuChange[] {
  const lists: Readonly<Record<MemberMenuPlacement, readonly [readonly { readonly id: string; readonly labelKey: string }[], readonly { readonly id: string; readonly labelKey: string }[]]>> = {
    bar: [before.rail, after.rail],
    account: [before.account, after.account],
    create: [before.create, after.create],
  }
  return MEMBER_MENU_PLACEMENTS.flatMap((placement) => {
    const [was, now] = lists[placement]
    const present = new Set(was.map((entry) => entry.id))
    return now
      .filter((entry) => !present.has(entry.id))
      .map((entry): MemberMenuChange => {
        const id = entry.id as MemberMenuEntryId | MemberCreateFormatId
        return { placement, id, labelKey: entry.labelKey, audience: audienceOf(placement, id) }
      })
  })
}

/** Les modules qu'un module exige ouverts, du plus proche au plus lointain. */
export function requiredFeatures(feature: NetworkFeature): NetworkFeature[] {
  const chain: NetworkFeature[] = []
  for (let parent = NETWORK_FEATURE_PARENTS[feature]; parent !== null && !chain.includes(parent); parent = NETWORK_FEATURE_PARENTS[parent]) chain.push(parent)
  return chain
}

/**
 * Tout ce qu'un module AJOUTE au menu des membres, quel que soit l'état du réseau : le menu de la
 * situation la plus large, ses modules exigés ouverts, avec et sans lui. Une entrée que d'autres
 * modules offrent aussi (« Communautés ») y figure : c'est lui qui l'apporte quand il est seul.
 */
export function featureMenuAdditions(feature: NetworkFeature, situation: MemberMenuSituation = MEMBER_MENU_WIDEST_SITUATION): MemberMenuChange[] {
  const required = requiredFeatures(feature)
  return menuDifference(memberMenu({ ...situation, openFeatures: required }), memberMenu({ ...situation, openFeatures: [...required, feature] }))
}
