/**
 * Le repère « déconnexion explicite » de ce navigateur (CH-863, lot D2 ; ADR-0045 du moteur).
 *
 * Sur la porte d'arrivée depuis consulat.ga, DIASPORA.GA peut demander au moteur d'accepter la
 * session identite.ga encore vivante, sans ressaisie. Jamais après que la personne s'est
 * déconnectée elle-même dans ce navigateur (« Se déconnecter partout », depuis le menu du compte,
 * les réglages ou l'accueil, ou « Ce n'est pas moi » de la carte d'arrivée) : la prochaine entrée
 * redemande l'identité. Le repère est posé par la porte unique de la sortie (`useSignOutEverywhere`),
 * et effacé à la prochaine entrée réussie (une session ouverte vue par la garde des pages).
 *
 * POURQUOI cette clé survit à la sortie : la déconnexion de partout du moteur purge, dans le stockage
 * local et dans celui de l'onglet, toute clé préfixée `antsia:` ou `antia:` (état personnel), puis
 * DIASPORA.GA purge ses brouillons (`diaspora-ga:brouillon:`). Le repère est écrit AVANT la sortie,
 * sous une clé qu'aucune des deux purges ne reconnaît, dans le stockage LOCAL (il vaut pour le
 * navigateur, pas pour l'onglet). Il ne contient rien de personnel : un drapeau, sans date ni compte.
 * Un test prouve qu'il survit aux deux purges.
 *
 * Un stockage illisible (navigation privée stricte, données bloquées) se lit comme « déconnecté » :
 * la porte demande alors toujours l'identité. Rien n'est écrit côté serveur.
 */

/** Hors des préfixes que purge le moteur (`antsia:`, `antia:`) et du préfixe des brouillons. */
export const EXPLICIT_SIGN_OUT_KEY = "diaspora-ga:sortie-explicite"

type MarkerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Le stockage de ce navigateur, ou `null` (rendu serveur, stockage refusé). */
function deviceStorage(): MarkerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** Retient la déconnexion explicite. Un stockage refusé ne retient rien : il se lit déjà comme « déconnecté ». */
export function rememberExplicitSignOut(storage: MarkerStorage | null = deviceStorage()): void {
  try {
    storage?.setItem(EXPLICIT_SIGN_OUT_KEY, "1")
  } catch {
    // Stockage refusé : la lecture prudente vaut repère.
  }
}

/** Une déconnexion explicite depuis la dernière entrée réussie ? Prudent : illisible vaut oui. */
export function explicitSignOutHappened(storage: MarkerStorage | null = deviceStorage()): boolean {
  if (storage === null) return true
  try {
    return storage.getItem(EXPLICIT_SIGN_OUT_KEY) !== null
  } catch {
    return true
  }
}

/** Efface le repère : une entrée a réussi depuis la déconnexion. */
export function forgetExplicitSignOut(storage: MarkerStorage | null = deviceStorage()): void {
  try {
    storage?.removeItem(EXPLICIT_SIGN_OUT_KEY)
  } catch {
    // Rien à effacer.
  }
}
