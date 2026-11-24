/**
 * Les textes du site vus par l'application (LX-05) — module PUR : l'adresse et le
 * libellé court de chaque texte, partagés par le pied de page, le menu du compte
 * et les réglages. Leur version, leur date et leurs rubriques vivent dans le
 * domaine (`LEGAL_TEXTS` de `@diaspora-ga/domain`).
 */
import { isCommunityRule, type LegalTextKind } from "@diaspora-ga/domain"
import type { MEMBER_INFORMATION_ENTRIES } from "@diaspora-ga/features/navigation"

import { anchors, COMMUNITY_RULE_ANCHORS, routes } from "./routes"

/** L'adresse de chaque texte, prise dans la table des routes. */
export const LEGAL_TEXT_ROUTES: Readonly<Record<LegalTextKind, () => string>> = {
  notice: routes.legalNotice,
  privacy: routes.privacy,
  terms: routes.terms,
  community: routes.communityRules,
  contact: routes.contact,
}

/** Une entrée du groupe « Informations » du menu des membres. */
export type InformationEntryId = (typeof MEMBER_INFORMATION_ENTRIES)[number]

/**
 * Le texte qu'ouvre chaque entrée « Informations » dans la page flottante de la coque ; `null` :
 * l'entrée n'est pas un texte (la charte graphique, une page vivante), elle reste un lien
 * ordinaire. Table exhaustive : une entrée ajoutée au menu doit y dire ce qu'elle ouvre.
 */
export const INFORMATION_ENTRY_TEXTS: Readonly<Record<InformationEntryId, LegalTextKind | null>> = {
  legalNotice: "notice",
  privacy: "privacy",
  terms: "terms",
  communityRules: "community",
  contact: "contact",
  charte: null,
}

/** L'identifiant du sommaire d'un texte (sans croisillon) : la cible de son ancre. */
export function legalSummaryAnchor(): string {
  return anchors.legalSummary.slice(1)
}

/**
 * L'ancre d'une rubrique dans la page de son texte (`#…`), ou celle du sommaire (`null`) : les
 * liens natifs du sommaire et du pagineur de la page publique ; le retour du navigateur remonte
 * ainsi d'une rubrique.
 */
export function legalSectionFragment(kind: LegalTextKind, section: string | null): string {
  return section === null ? anchors.legalSummary : `#${legalSectionAnchor(kind, section)}`
}

/**
 * L'adresse complète d'une rubrique (la page du texte, à l'ancre de la rubrique), ou de son
 * sommaire (`null`) : celle qu'ouvre un clic modifié (Cmd-clic) depuis la page flottante.
 */
export function legalSectionHref(kind: LegalTextKind, section: string | null): string {
  return `${LEGAL_TEXT_ROUTES[kind]()}${legalSectionFragment(kind, section)}`
}

/** Le libellé court de chaque texte : le même partout où il est proposé. */
export const LEGAL_TEXT_LABELS: Readonly<Record<LegalTextKind, string>> = {
  notice: "footer.legalNotice",
  privacy: "footer.privacy",
  terms: "footer.terms",
  community: "footer.community",
  contact: "footer.contact",
}

export interface LegalSectionLink {
  readonly href: () => string
  /** La clé du libellé : celui que le pied de page et le menu donnent déjà à cette destination. */
  readonly label: string
}

/**
 * Le renvoi qu'une rubrique peut offrir sous son texte : vers ce qui existe aujourd'hui dans
 * le site (« Mes données », ouverte même sans adhésion, un autre texte, la page de contact),
 * jamais vers une adresse que personne n'a fournie. Les coordonnées, elles, sont dans le texte.
 * Chaque rubrique nommée ici existe dans le registre du domaine (test du module).
 */
export const LEGAL_SECTION_LINKS: Readonly<Record<LegalTextKind, Readonly<Record<string, LegalSectionLink>>>> = {
  notice: {
    illegalContent: { href: routes.communityRules, label: "footer.community" },
    personalData: { href: routes.privacy, label: "footer.privacy" },
    contact: { href: routes.contact, label: "footer.contact" },
  },
  privacy: {
    exercise: { href: routes.myData, label: "footer.myData" },
    complaint: { href: routes.contact, label: "footer.contact" },
  },
  terms: {
    conduct: { href: routes.communityRules, label: "footer.community" },
    moderation: { href: routes.communityRules, label: "footer.community" },
    personalData: { href: routes.privacy, label: "footer.privacy" },
    termination: { href: routes.myData, label: "footer.myData" },
    contact: { href: routes.contact, label: "footer.contact" },
  },
  community: {
    measures: { href: routes.myData, label: "footer.myData" },
  },
  contact: {
    report: { href: routes.communityRules, label: "footer.community" },
    data: { href: routes.myData, label: "footer.myData" },
    dataProtection: { href: routes.privacy, label: "footer.privacy" },
    legalRequests: { href: routes.legalNotice, label: "footer.legalNotice" },
  },
}

/**
 * La date d'une édition (AAAA-MM-JJ), dite dans la langue de la personne. Lue en
 * temps universel : une date civile ne recule pas d'un jour dans un fuseau à l'ouest.
 */
export function formatLegalTextDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
}

/**
 * L'ancre d'une rubrique dans sa page : celle de la règle pour les règles de la communauté
 * (les motifs de signalement y renvoient, `routes.communityRule`), sinon l'identifiant de la
 * rubrique écrit en minuscules et tirets (`dataProtection` → `data-protection`).
 */
export function legalSectionAnchor(kind: LegalTextKind, section: string): string {
  if (kind === "community" && isCommunityRule(section)) return COMMUNITY_RULE_ANCHORS[section]
  return section.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
