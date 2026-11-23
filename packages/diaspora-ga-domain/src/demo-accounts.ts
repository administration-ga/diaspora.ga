/**
 * Comptes de DÉMONSTRATION de DIASPORA.GA — développement local, ou déploiement de démonstration
 * déclaré du moteur, derrière sa porte (CH-817 : pastille « Compte démo », code WhatsApp).
 *
 * LA liste des acteurs, lue à la fois par la tranche `convex/modules/diaspora`
 * du moteur (catalogue et équipement, double garde des outils de développement)
 * et par l'application (panneau de la porte, accueil automatique). Un acteur par
 * type de membre, de page, de rôle et d'accès restreint (suspension, blocage,
 * hors réseau), sur une adresse réservée
 * (`<acteur>@demo.diaspora-ga.test` : le domaine `.test` n'est jamais routable).
 *
 * Ce module ne décrit QUE des données fictives : aucun nom réel, aucune
 * institution réelle. Les noms sont déjà écrits « Prénom NOM ».
 *
 * Le statut attendu de chaque acteur découle de SES faits (`grounds`) par la
 * règle officielle `deriveMembershipStatus` : le test le recalcule, aucune
 * exception n'est écrite ici.
 *
 * Catalogue par RÈGLE (CH-817) : la liste déclarée reste entière, mais un acteur
 * n'est PROPOSÉ que si les modules qu'il illustre (`requires`) et son pays sont
 * ouverts ; les acteurs de recette (`audience`) ne le sont qu'en développement
 * local (`diasporaGaDemoActorsOffered`).
 */
import type { CountryCode } from "./countries"
import type { MembershipStatus } from "./eligibility"
import type { EngineNetworkFeature } from "./engine"

/** Le domaine réservé des comptes de démonstration (RFC 2606 : jamais routable). */
export const DIASPORA_GA_DEMO_EMAIL_DOMAIN = "demo.diaspora-ga.test"

/** Les acteurs, dans l'ordre du panneau de la porte. */
export const DIASPORA_GA_DEMO_ACTORS = [
  "nouveau",
  "leger",
  "declare",
  "parraine",
  "verifie",
  "fondateur",
  "belgique",
  "canada",
  "association",
  "entreprise",
  "media",
  "communaute",
  "institution",
  "mentor",
  "talent",
  "moderateur",
  "administrateur",
  "suspendu",
  "suspendu-racine",
  "bloque",
  "exterieur",
] as const
export type DiasporaGaDemoActor = (typeof DIASPORA_GA_DEMO_ACTORS)[number]

/** Les groupes du panneau : membres par statut, pages par nature, rôles et services, accès restreints. */
export const DIASPORA_GA_DEMO_GROUPS = ["members", "pages", "roles", "access"] as const
export type DiasporaGaDemoGroup = (typeof DIASPORA_GA_DEMO_GROUPS)[number]

/** Les rôles de réseau qu'un acteur peut porter dans `diaspora-ga`. */
export const DIASPORA_GA_DEMO_ROLES = ["member", "network_moderator", "network_admin"] as const
export type DiasporaGaDemoRole = (typeof DIASPORA_GA_DEMO_ROLES)[number]

/**
 * Les gestes RÉELS que l'application joue pour l'acteur, une fois équipé. `associationEvent`
 * (EV-01) : deux évènements fictifs de la page d'association, créés par la capacité du port
 * sous une clé d'idempotence stable ; aucune politique de modération n'est posée, ils restent
 * « en attente » jusqu'à la décision de la modératrice au bureau.
 */
export const DIASPORA_GA_DEMO_GESTURES = ["mentor", "talent", "service", "job", "mission", "associationEvent"] as const
export type DiasporaGaDemoGesture = (typeof DIASPORA_GA_DEMO_GESTURES)[number]

/**
 * Le module du réseau dont chaque geste a besoin : un geste ne se joue que si son
 * module est ouvert (un module fermé refuserait l'écriture, et l'écran ne la montrerait pas).
 */
export const DIASPORA_GA_DEMO_GESTURE_FEATURES: Readonly<Record<DiasporaGaDemoGesture, EngineNetworkFeature>> = {
  mentor: "mentoring",
  talent: "jobs",
  service: "services",
  job: "jobs",
  mission: "mutualAid",
  associationEvent: "groupsAndEvents",
}

/**
 * À qui l'acteur s'adresse : `public`, la vitrine de la démonstration en ligne ;
 * `recette`, les essais, proposés en développement local seulement.
 */
export const DIASPORA_GA_DEMO_AUDIENCES = ["public", "recette"] as const
export type DiasporaGaDemoAudience = (typeof DIASPORA_GA_DEMO_AUDIENCES)[number]

/**
 * Le média et le collectif hors de la vitrine (CH-817) : le site n'inscrit lui-même que
 * l'association et l'entreprise, l'institution vient de l'administration. Recommandation
 * RÉVERSIBLE, tenue par cette seule constante : `"public"` les remet dans la vitrine.
 */
export const DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE: DiasporaGaDemoAudience = "recette"

/**
 * Les pays des acteurs de la démonstration. Ils ne s'ouvrent plus d'office (CH-817) : ouvrir un
 * pays est une décision de l'administration du réseau ; un acteur d'un pays fermé n'est ni
 * proposé ni équipé, et l'équipement ne crée que le hub qui manquerait à un pays déjà ouvert.
 */
export const DIASPORA_GA_DEMO_COUNTRIES = ["FR", "BE", "CA"] as const satisfies readonly CountryCode[]

/** Les faits fictifs dont le statut se dérive (mêmes faits que `MembershipGrounds`). */
export interface DiasporaGaDemoGrounds {
  /** Identité IDN fictive : niveau de garantie et nationalité gabonaise selon IDN. */
  readonly idn: { readonly loa: 1 | 2 | 3; readonly gaboneseNationality: boolean } | null
  /** Parrainé par l'acteur « verifie » (vérifié depuis assez longtemps pour parrainer). */
  readonly sponsored: boolean
  /** Attestation consulaire fictive (lien d'identité, jamais de donnée consulaire). */
  readonly consularAttestation: boolean
  /**
   * Admission fondatrice fictive, par décision tracée du réseau (EA-01), et sa
   * dispense d'ancienneté pour parrainer ; `null` sans décision.
   */
  readonly foundingAdmission: { readonly seniorityWaiver: boolean } | null
  /** Sanction fictive en cours dans DIASPORA.GA seulement (adhésion suspendue). */
  readonly suspended: boolean
  /**
   * Suspension fictive à la RACINE (ANTSIA), par le chemin de la console
   * (« suspendre partout ») : elle vaut dans tous les réseaux, DIASPORA.GA compris,
   * sans toucher au statut propre de l'adhésion DIASPORA.GA.
   */
  readonly suspendedAtRoot: boolean
}

export const DIASPORA_GA_DEMO_PAGE_KINDS = ["association", "company", "media", "community", "institution"] as const
export type DiasporaGaDemoPageKind = (typeof DIASPORA_GA_DEMO_PAGE_KINDS)[number]

export interface DiasporaGaDemoPage {
  readonly kind: DiasporaGaDemoPageKind
  /** Adresse de page (règle `assertPageHandle` du moteur). */
  readonly handle: string
  readonly name: string
  readonly city: string
  /** Niveau de confiance posé en démonstration ; « official » est réservé aux institutions. */
  readonly trust: "community" | "verified" | "official"
  /** Type d'association (`PAGE_ASSOCIATION_TYPES` du moteur), pour une association seulement. */
  readonly associationType: "cultural" | "solidarity" | "student" | null
  /** Secteur d'entreprise (`PAGE_COMPANY_SECTORS` du moteur), pour une entreprise seulement. */
  readonly sector: "food" | "services" | null
}

export interface DiasporaGaDemoProfile {
  /** Identifiant public (règle des identifiants du moteur). */
  readonly handle: string
  readonly givenNames: string
  readonly familyName: string
  readonly headline: string
}

export interface DiasporaGaDemoActorSpec {
  readonly actor: DiasporaGaDemoActor
  readonly group: DiasporaGaDemoGroup
  readonly country: CountryCode
  /** `null` : le compte s'arrête à l'accueil, sans profil (acteur « nouveau »). */
  readonly profile: DiasporaGaDemoProfile | null
  readonly grounds: DiasporaGaDemoGrounds
  /**
   * Le statut EFFECTIF dans DIASPORA.GA, celui que lit l'application (une suspension
   * de la racine vaut partout) ; `null` si le compte n'entre pas dans le réseau
   * (« nouveau », « exterieur »).
   */
  readonly expectedStatus: MembershipStatus | null
  /** Statut antidaté au-delà du délai de parrainage : peut parrainer dès l'équipement. */
  readonly canSponsor: boolean
  readonly role: DiasporaGaDemoRole
  /** Membre de l'équipe de modération de démonstration. */
  readonly moderationTeam: boolean
  readonly page: DiasporaGaDemoPage | null
  readonly gestures: readonly DiasporaGaDemoGesture[]
  /**
   * Les modules sans lesquels l'acteur n'illustre rien (le socle est toujours servi) :
   * les pages pour un acteur de page, le mentorat pour la mentore, l'emploi pour le talent.
   * Les gestes d'une page restent facultatifs : chacun attend son propre module.
   */
  readonly requires: readonly EngineNetworkFeature[]
  /** Vitrine en ligne (`public`) ou recette en développement local (`recette`). */
  readonly audience: DiasporaGaDemoAudience
  /**
   * L'acteur qui bloque celui-ci par le vrai blocage personnel du moteur, posé dès
   * que les deux comptes existent, quel que soit l'ordre d'équipement ; ou `null`.
   */
  readonly blockedBy: DiasporaGaDemoActor | null
  /**
   * Utilisateur extérieur au réseau : un compte ANTSIA (profil publié, adhésion à la
   * racine) SANS adhésion DIASPORA.GA. L'amorçage ne rejoue pas `join`, l'équipement
   * le traite sans adhésion.
   */
  readonly outsider: boolean
}

const NONE: DiasporaGaDemoGrounds = { idn: null, sponsored: false, consularAttestation: false, foundingAdmission: null, suspended: false, suspendedAtRoot: false }
const ATTESTED: DiasporaGaDemoGrounds = { ...NONE, consularAttestation: true }
const IDN_2: DiasporaGaDemoGrounds = { ...NONE, idn: { loa: 2, gaboneseNationality: true } }

function spec(
  input: Omit<DiasporaGaDemoActorSpec, "canSponsor" | "role" | "moderationTeam" | "page" | "gestures" | "requires" | "audience" | "blockedBy" | "outsider"> & Partial<DiasporaGaDemoActorSpec>,
): DiasporaGaDemoActorSpec {
  return { canSponsor: false, role: "member", moderationTeam: false, page: null, gestures: [], requires: [], audience: "public", blockedBy: null, outsider: false, ...input }
}

/** Un acteur de page n'illustre rien tant que les pages sont fermées. */
const PAGES: readonly EngineNetworkFeature[] = ["pages"]

export const DIASPORA_GA_DEMO_ACTOR_SPECS: Readonly<Record<DiasporaGaDemoActor, DiasporaGaDemoActorSpec>> = {
  nouveau: spec({ actor: "nouveau", group: "members", country: "FR", profile: null, grounds: NONE, expectedStatus: null }),
  leger: spec({
    actor: "leger", group: "members", country: "FR",
    profile: { handle: "demo.leger", givenNames: "Lucie", familyName: "NZAMBA", headline: "Compte léger de démonstration" },
    grounds: NONE, expectedStatus: "en_attente",
  }),
  declare: spec({
    actor: "declare", group: "members", country: "FR",
    profile: { handle: "demo.declare", givenNames: "Hervé", familyName: "MOUBAMBA", headline: "Membre déclaré par IDN (démonstration)" },
    grounds: { ...NONE, idn: { loa: 1, gaboneseNationality: true } }, expectedStatus: "declaree",
  }),
  parraine: spec({
    actor: "parraine", group: "members", country: "FR",
    profile: { handle: "demo.parraine", givenNames: "Sandrine", familyName: "ONDO", headline: "Membre parrainé (démonstration)" },
    grounds: { ...NONE, sponsored: true }, expectedStatus: "declaree",
  }),
  verifie: spec({
    actor: "verifie", group: "members", country: "FR",
    profile: { handle: "demo.verifie", givenNames: "Patrice", familyName: "MBOUMBA", headline: "Membre vérifié, parrain (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee", canSponsor: true,
  }),
  // EA-01 : vérifiée par décision du réseau, sans attestation ; la dispense lui permet de parrainer sans attendre 30 jours.
  fondateur: spec({
    actor: "fondateur", group: "members", country: "FR",
    profile: { handle: "demo.fondateur", givenNames: "Béatrice", familyName: "MOUSSAVOU", headline: "Membre fondatrice du réseau (démonstration)" },
    grounds: { ...NONE, foundingAdmission: { seniorityWaiver: true } }, expectedStatus: "verifiee",
  }),
  belgique: spec({
    actor: "belgique", group: "members", country: "BE",
    profile: { handle: "demo.belgique", givenNames: "Aïcha", familyName: "NGUEMA", headline: "Membre vérifiée à Bruxelles (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee",
  }),
  canada: spec({
    actor: "canada", group: "members", country: "CA",
    profile: { handle: "demo.canada", givenNames: "Ghislain", familyName: "ESSONO", headline: "Membre déclaré à Montréal (démonstration)" },
    grounds: IDN_2, expectedStatus: "declaree",
  }),
  association: spec({
    actor: "association", group: "pages", country: "FR",
    profile: { handle: "demo.association", givenNames: "Mireille", familyName: "ENGONE", headline: "Présidente d'association (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee",
    page: { kind: "association", handle: "demo-association-lyon", name: "Association des Gabonais de Lyon (démonstration)", city: "Lyon", trust: "verified", associationType: "cultural", sector: null },
    gestures: ["mission", "associationEvent"], requires: PAGES,
  }),
  entreprise: spec({
    actor: "entreprise", group: "pages", country: "FR",
    profile: { handle: "demo.entreprise", givenNames: "Fabrice", familyName: "NDONG", headline: "Traiteur, chef d'entreprise (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee",
    page: { kind: "company", handle: "demo-saveurs-du-gabon", name: "Saveurs du Gabon (démonstration)", city: "Paris", trust: "community", associationType: null, sector: "food" },
    gestures: ["service", "job"], requires: PAGES,
  }),
  media: spec({
    actor: "media", group: "pages", country: "FR",
    profile: { handle: "demo.media", givenNames: "Laure", familyName: "MINKO", headline: "Journaliste (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee",
    page: { kind: "media", handle: "demo-diaspora-info", name: "Diaspora Info (démonstration)", city: "Paris", trust: "verified", associationType: null, sector: null },
    requires: PAGES, audience: DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE,
  }),
  communaute: spec({
    actor: "communaute", group: "pages", country: "FR",
    profile: { handle: "demo.communaute", givenNames: "Arnaud", familyName: "BIYOGHE", headline: "Animateur d'un collectif (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee",
    page: { kind: "community", handle: "demo-collectif-bordeaux", name: "Collectif des étudiants de Bordeaux (démonstration)", city: "Bordeaux", trust: "community", associationType: null, sector: null },
    requires: PAGES, audience: DIASPORA_GA_DEMO_UNREGISTERED_PAGES_AUDIENCE,
  }),
  institution: spec({
    actor: "institution", group: "pages", country: "FR",
    profile: { handle: "demo.institution", givenNames: "Paul", familyName: "OBAME", headline: "Agent d'un poste consulaire fictif (démonstration)" },
    grounds: { ...IDN_2, consularAttestation: true }, expectedStatus: "verifiee",
    page: { kind: "institution", handle: "demo-poste-consulaire", name: "Poste consulaire de démonstration", city: "Paris", trust: "official", associationType: null, sector: null },
    requires: PAGES,
  }),
  mentor: spec({
    actor: "mentor", group: "roles", country: "FR",
    profile: { handle: "demo.mentor", givenNames: "Jeanne", familyName: "MAKAYA", headline: "Mentore bénévole (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee", gestures: ["mentor"], requires: ["mentoring"],
  }),
  talent: spec({
    actor: "talent", group: "roles", country: "FR",
    profile: { handle: "demo.talent", givenNames: "Kevin", familyName: "NDOUTOUME", headline: "Développeur en recherche d'emploi (démonstration)" },
    grounds: IDN_2, expectedStatus: "declaree", gestures: ["talent"], requires: ["jobs"],
  }),
  moderateur: spec({
    actor: "moderateur", group: "roles", country: "FR",
    profile: { handle: "demo.moderateur", givenNames: "Ruth", familyName: "ALLOGHO", headline: "Modératrice du réseau (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee", role: "network_moderator", moderationTeam: true,
  }),
  administrateur: spec({
    actor: "administrateur", group: "roles", country: "FR",
    profile: { handle: "demo.administrateur", givenNames: "Serge", familyName: "EYENE", headline: "Administrateur du réseau (démonstration)" },
    grounds: { ...IDN_2, consularAttestation: true }, expectedStatus: "verifiee", role: "network_admin",
  }),
  suspendu: spec({
    actor: "suspendu", group: "access", country: "FR",
    profile: { handle: "demo.suspendu", givenNames: "Marc", familyName: "OKOUMA", headline: "Membre suspendu (démonstration)" },
    grounds: { ...ATTESTED, suspended: true }, expectedStatus: "suspendue", audience: "recette",
  }),
  "suspendu-racine": spec({
    actor: "suspendu-racine", group: "access", country: "FR",
    profile: { handle: "demo.suspendu-racine", givenNames: "Christelle", familyName: "IVANGA", headline: "Compte suspendu sur ANTSIA (démonstration)" },
    grounds: { ...ATTESTED, suspendedAtRoot: true }, expectedStatus: "suspendue", audience: "recette",
  }),
  bloque: spec({
    actor: "bloque", group: "access", country: "FR",
    profile: { handle: "demo.bloque", givenNames: "Yannick", familyName: "MBADINGA", headline: "Membre bloqué par un autre membre (démonstration)" },
    grounds: ATTESTED, expectedStatus: "verifiee", blockedBy: "verifie", audience: "recette",
  }),
  exterieur: spec({
    actor: "exterieur", group: "access", country: "FR",
    profile: { handle: "demo.exterieur", givenNames: "Brice", familyName: "MOUNDOUNGA", headline: "Membre d'ANTSIA, hors de DIASPORA.GA (démonstration)" },
    grounds: NONE, expectedStatus: null, outsider: true, audience: "recette",
  }),
}

/** Ce qui est ouvert, là où le catalogue se lit. */
export interface DiasporaGaDemoOfferContext {
  /**
   * Les modules ouverts du réseau, tels que le moteur les calcule (`openFeaturesOf` :
   * un module n'y figure qu'avec son parent).
   */
  readonly openFeatures: readonly EngineNetworkFeature[]
  /** Les pays ouverts du réseau (`networks.openCountries`). */
  readonly openCountries: readonly string[]
  /** Développement local (`devToolsAllowed()` du moteur) : les acteurs de recette s'y ajoutent. */
  readonly local: boolean
}

/**
 * Les acteurs à PROPOSER, dans l'ordre du panneau : un acteur l'est si tous ses modules
 * et son pays sont ouverts ; un acteur de recette, en plus, en développement local
 * seulement. La liste déclarée ne change pas : un module ouvert plus tard fait reparaître
 * son acteur, sans rien réécrire.
 */
export function diasporaGaDemoActorsOffered(context: DiasporaGaDemoOfferContext): DiasporaGaDemoActor[] {
  const features = new Set<EngineNetworkFeature>(context.openFeatures)
  const countries = new Set<string>(context.openCountries)
  return DIASPORA_GA_DEMO_ACTORS.filter((actor) => {
    const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
    if (spec.audience === "recette" && !context.local) return false
    return countries.has(spec.country) && spec.requires.every((feature) => features.has(feature))
  })
}

/** L'adresse réservée d'un acteur. */
export function diasporaGaDemoEmailOf(actor: DiasporaGaDemoActor): string {
  return `${actor}@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}`
}

/** L'acteur d'une adresse réservée, ou `null` (casse et espaces ignorés). */
export function diasporaGaDemoActorOfEmail(email: string): DiasporaGaDemoActor | null {
  const normalized = email.trim().toLowerCase()
  return DIASPORA_GA_DEMO_ACTORS.find((actor) => diasporaGaDemoEmailOf(actor) === normalized) ?? null
}

/** Le nom affiché d'un acteur, « Prénom NOM », ou `null` sans profil. */
export function diasporaGaDemoDisplayName(actor: DiasporaGaDemoActor): string | null {
  const profile = DIASPORA_GA_DEMO_ACTOR_SPECS[actor].profile
  return profile === null ? null : `${profile.givenNames} ${profile.familyName}`
}
