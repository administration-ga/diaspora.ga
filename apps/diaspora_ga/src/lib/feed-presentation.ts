/**
 * Ce que l'écran du fil OFFRE au membre (CH-816, lot P2) — module PUR, déclaration de l'application.
 *
 * Décision du propriétaire du 22/11/2026 (fiche de lancement du réseau simple, § 2) : au lancement,
 * le fil n'a que deux onglets — le pays de résidence et « Toute la diaspora » — et ni « Récents »,
 * ni « Pour vous », ni la bascule Liste / Découverte. Rien n'est retiré du domaine : les quatre
 * portées (`FEED_SCOPES`) et le mode Découverte (DG-017) restent écrits, testés et branchés ; ils
 * reviendront quand le volume le justifiera, en changeant une ligne ici.
 *
 * Qui lit cette déclaration : l'écran du fil (onglets, bascule, adresse de découverte), et tout
 * écran qui proposerait un jour de choisir une portée du fil.
 */
import { DEFAULT_FEED_SCOPE, type FeedScope } from "@diaspora-ga/domain"

/** Les portées offertes, dans l'ordre des onglets (`FEED_SCOPES` en garde quatre). */
export const OFFERED_FEED_SCOPES: readonly FeedScope[] = ["mon_pays", "diaspora"]

/** La bascule Liste / Découverte (DG-017) : retirée au lancement ; `true` la ramène, adresse comprise. */
export const FEED_DISCOVERY_OFFERED: boolean = false

/**
 * La portée montrée pour une portée demandée (adresse, lien partagé) : offerte, elle-même ; sinon
 * la portée par défaut si elle est offerte, à défaut la première offerte. Une adresse qui demande
 * « Récents » ou « Pour vous » montre donc le fil du pays, son onglet actif.
 */
export function offeredFeedScope(requested: FeedScope, offered: readonly FeedScope[] = OFFERED_FEED_SCOPES): FeedScope {
  if (offered.includes(requested)) return requested
  if (offered.includes(DEFAULT_FEED_SCOPE)) return DEFAULT_FEED_SCOPE
  return offered[0] ?? DEFAULT_FEED_SCOPE
}

/** La découverte s'ouvre-t-elle ? Seulement demandée par son adresse ET offerte ; sinon, la liste. */
export function showsFeedDiscovery(requested: boolean, offered: boolean = FEED_DISCOVERY_OFFERED): boolean {
  return offered && requested
}
