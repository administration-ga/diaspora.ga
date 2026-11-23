/**
 * Table des routes d'admin.diaspora.ga — le SEUL fichier de l'application où une
 * adresse s'écrit (cliquet local « aucune adresse en dur »). Toutes les adresses du
 * contrat CH-815 y sont déclarées dès le squelette (lot A4) ; la barre latérale ne
 * montre que les sections qui existent dans le code (`sections.ts`), chaque lot
 * ajoutant la sienne.
 */

/** Paramètre posé après une sortie de session dont la révocation ou le nettoyage ne sont pas confirmés. */
const SIGN_OUT_PARAM = "deconnexion"
const SIGN_OUT_INCOMPLETE = "incomplete"

const DASHBOARD = "/"
const SIGN_IN = "/entrer"

export const routes = {
  /**
   * Connexion par identité numérique seule (D3), et seule adresse de retour d'IDN
   * (revue A1, F2) : nue, sans paramètre ni fragment. La section demandée avant la
   * connexion n'est jamais portée par une adresse (`requested-section.ts`).
   */
  signIn: () => SIGN_IN,
  signedOut: (incomplete: boolean) =>
    incomplete ? `${SIGN_IN}?${new URLSearchParams({ [SIGN_OUT_PARAM]: SIGN_OUT_INCOMPLETE }).toString()}` : SIGN_IN,
  // Pilotage
  dashboard: () => DASHBOARD,
  metrics: () => "/mesure",
  journal: () => "/journal",
  // Application des membres
  modules: () => "/modules",
  menuPreview: () => "/apercu",
  // Communauté
  institutions: () => "/institutions",
  founders: () => "/fondateurs",
  countries: () => "/pays",
  // Confiance
  appeals: () => "/recours",
  team: () => "/equipe",
  rules: () => "/regles",
  // Exploitation
  health: () => "/sante-fonctionnelle",
  healthApi: () => "/api/sante-fonctionnelle",
} as const

/** L'entrée a-t-elle été rouverte par une sortie de session incomplète ? */
export function signOutWasIncomplete(search: string): boolean {
  return new URLSearchParams(search).get(SIGN_OUT_PARAM) === SIGN_OUT_INCOMPLETE
}

/** Ancre du contenu principal (lien d'évitement) : l'identifiant et son lien. */
const CONTENT_ID = "contenu"
export const anchors = {
  contentId: CONTENT_ID,
  content: `#${CONTENT_ID}`,
} as const
