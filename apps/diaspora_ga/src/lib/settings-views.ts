/**
 * Les sous-vues des réglages (« une page = une vue », lot 2a, plan du 24/11/2026, § 3) — module
 * PUR : leurs identifiants, dans l'ordre de la liste, les ancres de leurs sections (la canonique en
 * premier : c'est l'adresse de l'entrée), la table ancre → sous-vue et les clés de libellé, écrites
 * en toutes lettres. Une sous-vue porte au plus deux cartes sœurs ; un formulaire ne se coupe pas.
 *
 * Les ancres sont celles des sections, inchangées : chaque lien qui menait à une section des
 * réglages (`routes.settingsFeed`, `settingsImages`, `settingsData`, `settingsReports`,
 * `sponsorHelp`, `#profil` du profil, `#annuaire` des membres, les avis de la cloche) tombe sur la
 * sous-vue qui la porte ; l'écran amène sa section en tête du volet (une ancre secondaire, la
 * seconde section d'une sous-vue, n'y est pas d'elle-même). `#informations`, l'ancienne rubrique
 * des textes, ne désigne plus rien.
 */
import { anchors } from "./routes"

export const SETTINGS_VIEWS = ["compte", "profil", "pays", "fil", "appels", "affichage", "consentements", "parrainage", "donnees"] as const
export type SettingsViewId = (typeof SETTINGS_VIEWS)[number]

/** Les ancres des sections de chaque sous-vue, la canonique en premier. */
export const SETTINGS_VIEW_ANCHORS = {
  compte: ["adhesions", "session"],
  profil: ["profil", "images"],
  pays: ["facette"],
  fil: ["mon-fil", "annuaire"],
  appels: ["messages-et-appels"],
  affichage: ["apparence", "notifications-appareil"],
  consentements: ["consentements"],
  parrainage: ["parrainage"],
  donnees: ["mes-donnees", "mes-signalements"],
} as const satisfies Readonly<Record<SettingsViewId, readonly [string, ...string[]]>>

export type SettingsAnchor = (typeof SETTINGS_VIEW_ANCHORS)[SettingsViewId][number]

/** Toutes les ancres des réglages, celles que lit `useHashView`. */
export const SETTINGS_ANCHORS: readonly SettingsAnchor[] = SETTINGS_VIEWS.flatMap((view): readonly SettingsAnchor[] => SETTINGS_VIEW_ANCHORS[view])

/** Le libellé de chaque sous-vue : une clé neuve, ou celle du titre de sa section quand il la nomme déjà. */
export const SETTINGS_VIEW_LABELS: Readonly<Record<SettingsViewId, string>> = {
  compte: "settings.views.account",
  profil: "settings.views.profile",
  pays: "settings.views.country",
  fil: "settings.views.feed",
  appels: "settings.calls.title",
  affichage: "settings.views.display",
  consentements: "settings.consents",
  parrainage: "settings.views.sponsor",
  donnees: "settings.data",
}

const VIEW_OF_ANCHOR: ReadonlyMap<string, SettingsViewId> = new Map(SETTINGS_VIEWS.flatMap((view) => SETTINGS_VIEW_ANCHORS[view].map((anchor) => [anchor, view] as const)))

/** La sous-vue qui porte la section de cette ancre (sans croisillon) ; `null` : aucune, la vue par défaut. */
export function settingsViewOfAnchor(anchor: string): SettingsViewId | null {
  return VIEW_OF_ANCHOR.get(anchor) ?? null
}

/** L'adresse de l'entrée d'une sous-vue, dans la page : l'ancre de sa section canonique. */
export function settingsViewFragment(view: SettingsViewId): string {
  return `#${SETTINGS_VIEW_ANCHORS[view][0]}`
}

/** L'identifiant de la liste des rubriques (sans croisillon) : la cible de la ligne de retour. */
export function settingsListAnchor(): string {
  return anchors.settingsList.slice(1)
}
