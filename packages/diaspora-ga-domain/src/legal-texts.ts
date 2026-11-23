/**
 * Les textes d'information du site (LX-05) : mentions légales, confidentialité,
 * conditions d'utilisation, règles de la communauté et contact.
 *
 * Ce module tient la VERSION, la DATE et l'ÉTAT de chaque texte, comme `consents.ts`
 * tient la version et la date des textes de consentement : changer un texte change sa
 * version et sa date. Il tient aussi ses rubriques, dans l'ordre d'affichage — des
 * identifiants de clés de texte, jamais un contenu.
 *
 * Le fond est au propriétaire et à son conseil juridique (porte A11, lot DS-07). Trois états
 * (`LEGAL_TEXT_STATUSES`) : à fournir, provisoire, définitif. Les cinq textes sont RÉDIGÉS
 * depuis le 23/11/2026, sur demande du propriétaire, d'après ce que le service fait et
 * d'après les textes en vigueur (loi n° 001/2011 modifiée par la loi n° 025/2023, ordonnance
 * n° 0011/PR/2026 ratifiée par la loi n° 003/2026) ; ils restent PROVISOIRES tant que leur
 * relecture n'est pas faite. Seul un texte définitif lève la porte de mise en ligne.
 */

export const LEGAL_TEXT_KINDS = ["notice", "privacy", "terms", "community", "contact"] as const
export type LegalTextKind = (typeof LEGAL_TEXT_KINDS)[number]

/**
 * L'état d'un texte :
 *  · `missing` — À FOURNIR : la charpente seule ; chaque rubrique dit ce qui reste à
 *    fournir, et l'écran garde le marqueur « TODO JURISTE » visible ;
 *  · `provisional` — PROVISOIRE : rédigé d'après ce que le service fait réellement, en
 *    attente de la relecture du juriste et de la validation du propriétaire ; l'écran garde
 *    un marqueur « provisoire » visible, distinct du précédent, et chaque passage qui attend
 *    une règle de droit dit « À fournir » en nommant la question posée au juriste (`awaiting`) ;
 *  · `final` — DÉFINITIF : relu et validé ; aucun marqueur.
 * Le jour où un texte change d'état, sa version et sa date changent aussi.
 */
export const LEGAL_TEXT_STATUSES = ["missing", "provisional", "final"] as const
export type LegalTextStatus = (typeof LEGAL_TEXT_STATUSES)[number]

/**
 * Les questions posées au juriste sur le droit applicable à la modération (plan 14 du
 * dossier de finalisation du 10/11/2026, § 7, décision 1) : Q1 textes applicables, Q2
 * protection des données, Q3 règlement européen sur les services numériques, Q4 mentions de
 * l'éditeur, Q5 âge d'entrée, Q6 délais de traitement hors du Gabon, Q7 réquisitions et
 * conservation, Q8 statut des modérateurs bénévoles. Un passage « À fournir » d'un texte
 * provisoire nomme celle dont il attend la réponse.
 */
export const LAWYER_QUESTIONS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"] as const
export type LawyerQuestion = (typeof LAWYER_QUESTIONS)[number]

/**
 * Les règles de la communauté (MD-05), dans l'ordre d'affichage : les rubriques du texte
 * `community`. Chaque motif de signalement renvoie à l'une d'elles (`@diaspora-ga/features`,
 * `data/community-rules`).
 */
export const COMMUNITY_RULES = [
  "spirit",
  "respect",
  "scams",
  "impersonation",
  "politics",
  "privacy",
  "prohibited",
  "authorship",
  "integrity",
  "pages",
  "reporting",
  "measures",
] as const
export type CommunityRule = (typeof COMMUNITY_RULES)[number]

export function isCommunityRule(value: string): value is CommunityRule {
  return (COMMUNITY_RULES as readonly string[]).includes(value)
}

export interface LegalTextEdition {
  /** Version du texte affiché ; elle change avec le texte. */
  readonly version: string
  /** Date de cette version, au format AAAA-MM-JJ. */
  readonly date: string
  /** L'état du texte : à fournir, provisoire ou définitif (`LEGAL_TEXT_STATUSES`). */
  readonly status: LegalTextStatus
  /** Les rubriques, dans l'ordre d'affichage : `legal.<texte>.<rubrique>.title` et `.body`. */
  readonly sections: readonly string[]
  /**
   * Les rubriques dont un passage attend le juriste, avec la question posée : ce passage
   * (`legal.<texte>.<rubrique>.pending`) dit « À fournir » et nomme la question. Vide pour un
   * texte à fournir (tout y manque) comme pour un texte définitif (rien n'y manque).
   */
  readonly awaiting: Readonly<Record<string, readonly LawyerQuestion[]>>
}

/**
 * L'édition en vigueur de chaque texte. Les cinq textes sont rédigés depuis le 23/11/2026 et
 * PROVISOIRES : aucun passage n'attend plus une réponse (`awaiting` vide), mais aucun n'est
 * définitif tant que le propriétaire et son conseil ne l'ont pas relu. Les mentions légales
 * suivent l'article 25 de l'ordonnance n° 0011/PR/2026 ; la confidentialité, les articles 70 à
 * 73, 98, 104 et 171 de la loi n° 001/2011 modifiée.
 */
const EDITIONS: Readonly<Record<LegalTextKind, LegalTextEdition>> = {
  notice: {
    version: "0.2",
    date: "2026-11-23",
    status: "provisional",
    sections: ["publisher", "director", "hosting", "service", "intellectualProperty", "illegalContent", "rightOfReply", "personalData", "contact", "law"],
    awaiting: {},
  },
  privacy: {
    version: "0.2",
    date: "2026-11-23",
    status: "provisional",
    sections: [
      "controller",
      "framework",
      "data",
      "neverCollected",
      "purposes",
      "consents",
      "visibility",
      "recipients",
      "transfers",
      "retention",
      "security",
      "rights",
      "exercise",
      "minors",
      "cookies",
      "automated",
      "breach",
      "complaint",
      "changes",
    ],
    awaiting: {},
  },
  terms: {
    version: "0.2",
    date: "2026-11-23",
    status: "provisional",
    sections: [
      "purpose",
      "acceptance",
      "access",
      "account",
      "free",
      "conduct",
      "content",
      "pages",
      "exchanges",
      "consular",
      "moderation",
      "intellectualProperty",
      "personalData",
      "availability",
      "liability",
      "termination",
      "changes",
      "law",
      "contact",
    ],
    awaiting: {},
  },
  community: {
    version: "0.3",
    date: "2026-11-23",
    status: "provisional",
    sections: COMMUNITY_RULES,
    awaiting: {},
  },
  contact: {
    version: "0.2",
    date: "2026-11-23",
    status: "provisional",
    sections: ["report", "emergency", "messages", "data", "publisher", "dataProtection", "legalRequests", "regulators", "consular"],
    awaiting: {},
  },
}

/** Le registre, figé : aucun écran ne peut le réécrire. */
export const LEGAL_TEXTS: Readonly<Record<LegalTextKind, LegalTextEdition>> = Object.freeze(EDITIONS)

/** Les textes que le juriste et le propriétaire doivent encore fournir : chacun garde son marqueur « TODO JURISTE ». */
export function pendingLegalTexts(): LegalTextKind[] {
  return LEGAL_TEXT_KINDS.filter((kind) => LEGAL_TEXTS[kind].status === "missing")
}

/** Les textes qui ne sont pas définitifs — à fournir ou provisoires : chacun tient fermée la porte de mise en ligne (PD6). */
export function legalTextsBlockingRelease(): LegalTextKind[] {
  return LEGAL_TEXT_KINDS.filter((kind) => LEGAL_TEXTS[kind].status !== "final")
}
