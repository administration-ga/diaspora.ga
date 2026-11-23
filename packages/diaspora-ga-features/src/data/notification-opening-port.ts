/**
 * DS-14 (ouverture) — la destination d'une notification poussée, relue AU MOMENT où la personne la
 * touche. La notification de l'appareil ne porte qu'une référence opaque (ni nom, ni aperçu, ni
 * adresse) ; la porte d'ouverture de l'application la confie au fournisseur, qui relit tout pour la
 * personne de la session : destinataire, sujet et garde actuelle, sonnerie d'un appel.
 *
 * Une référence inconnue, celle d'un autre, un avis retiré ou une cible qui ne se lit plus rendent
 * la MÊME réponse (`null`) : on n'apprend rien d'un avis qui n'est pas le sien. Rien n'est marqué lu.
 */
import type { Loadable, NoticeTarget } from "./types"

/** Ce qu'une notification poussée désigne encore, pour moi, à l'instant : jamais un contenu. */
export type NotificationOpeningView =
  /** Un appel : `ringing` dit s'il sonne ENCORE chez moi. */
  | { readonly channel: "call"; readonly ringing: boolean }
  /** Un avis de la cloche : son genre et les références relues de son objet. */
  | { readonly channel: "notice"; readonly notice: NoticeTarget }

/** La lecture d'une ouverture : `null` (même réponse pour tout refus), une destination, ou une panne à reprendre. */
export interface NotificationOpeningQuery {
  readonly state: Loadable<NotificationOpeningView | null>
  /** Relit la destination (après une panne) : jamais une réponse gardée d'une lecture précédente. */
  readonly retry: () => void
}

export interface NotificationOpeningCapability {
  /** La destination relue de la notification poussée `reference`, pour la personne de la session. */
  useOpening(reference: string): NotificationOpeningQuery
}
