/**
 * La nature de chaque page (« une page = une vue », décision du 24/11/2026, § 3 ; plan du lot 2,
 * § 5) — module PUR, tenu par chemin de page sous `src/app` (la nature appartient à une page, pas à
 * une clé de route) :
 *   · `stream` : une page de flux, le document défile ; rien n'est empilé sous la collection ;
 *   · `view` : le document ne défile pas dès 600 px de haut ; l'écran le demande à sa coque
 *     (`layout="view"`) ;
 *   · `reference` : la porte, la vitrine, les transits — exemptés et nommés ;
 *   · `pending` : en attente de son lot. Cette liste ne fait que diminuer.
 * Le cliquet `ratchets/route-views.test.ts` vérifie que la table et le dossier des routes
 * concordent, et qu'une page `view` monte bien un écran qui demande la vue.
 */
export type RouteView = "stream" | "view" | "reference" | "pending"

export const ROUTE_VIEWS: Readonly<Record<string, RouteView>> = {
  // ── Vues : les textes du site (lot 1), les réglages (lot 2a) et « Mes données » (lot 2b) ──
  "/mentions-legales": "view",
  "/confidentialite": "view",
  "/conditions-utilisation": "view",
  "/regles-communaute": "view",
  "/contact": "view",
  "/parametres": "view",
  "/mes-donnees": "view",

  // ── Flux : le document défile (à confirmer au lot 6) ──
  "/fil": "stream",
  "/communautes": "stream",
  "/pays/[iso]": "stream",
  "/explorer": "stream",
  "/membres": "stream",
  "/pages": "stream",
  "/pages/[handle]": "stream",
  "/pages/[handle]/groupe": "stream",
  "/services": "stream",
  "/emploi": "stream",
  "/talents": "stream",
  "/entraide": "stream",
  "/mentorat": "stream",
  "/kit-arrivee": "stream",
  "/agenda": "stream",
  "/notifications": "stream",
  "/publication/[id]": "stream",
  "/profil/[handle]": "stream",
  "/profil/[handle]/albums/[albumId]": "stream",
  "/relations": "stream",
  "/enregistrements": "stream",

  // ── Références : la porte, la vitrine, la charte, les transits ──
  "/": "reference",
  "/entrer": "reference",
  "/mobile/ouvrir": "reference",
  "/mobile/retour": "reference",
  "/passerelle/consulat": "reference",
  "/passerelle/retour": "reference",
  "/passerelle/consentement": "reference",
  "/entrer/code": "reference",
  "/entrer/idn": "reference",
  "/bienvenue": "reference",
  "/demo": "reference",
  "/charte": "reference",
  "/sante-fonctionnelle": "reference",
  // Une redirection.
  "/evenements": "reference",
  // Le transit d'une notification poussée.
  "/notifications/ouvrir": "reference",

  // ── En attente de leur lot ──
  "/moderation": "pending",
  "/mon-activite": "pending",
  "/mon-activite/demandes/[requestId]": "pending",
  "/mes-demandes": "pending",
  "/mes-demandes/[requestId]": "pending",
  "/mes-associations": "pending",
  "/mes-candidatures": "pending",
  "/mes-mentorats": "pending",
  "/parrainer": "pending",
  "/verification": "pending",
  "/nouvelle-page": "pending",
  "/pages/[handle]/gerer": "pending",
  "/pages/[handle]/adherents": "pending",
  "/pages/[handle]/revendiquer": "pending",
  "/pages/[handle]/evenements/[eventId]": "pending",
  "/services/[offerId]": "pending",
  "/emploi/[jobId]": "pending",
  "/entraide/[itemId]": "pending",
  "/mentorat/[mentorId]": "pending",
  "/kit-arrivee/[resourceId]": "pending",
  // Les trois surfaces du moteur : à reclasser `reference` si elles ne peuvent pas porter nos volets.
  "/messages/[[...chemin]]": "pending",
  "/actus/[[...chemin]]": "pending",
  "/direct/[id]": "pending",
}
