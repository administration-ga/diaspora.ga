/**
 * Capacité « notifications de cet appareil » du port (DS-14, volet push).
 *
 * Abonner CET appareil (ce navigateur) aux notifications de DIASPORA.GA, et l'en désabonner.
 * Le moteur porte tout, sans changement pour ce lot (`notifications/pushSubscriptions` :
 * `configuration`, `listMine`, `subscribe`, `unsubscribe`) ; l'application ne fait que les
 * gestes du navigateur (autorisation, souscription de son script de fond unique).
 *
 * Ce qui part vers l'appareil : un avis NEUTRE (la marque et « nouvelle activité ») et une
 * référence opaque — jamais un contenu, un nom ni un aperçu (charge fermée du moteur, relue
 * par le script de fond). L'accord « notifications » du réseau est posé AU GESTE d'activation,
 * explicitement ; il se retire dans « Consentements », ce qui coupe tout envoi, sur tous les
 * appareils. « Désactiver » ne retire que CET appareil.
 */
import type { ActionResult, ConsentGestureOrigin } from "./port"
import type { Loadable } from "./types"

/**
 * Où en est CET appareil, dans l'ordre où l'écran le dit :
 *  · `unsupported` : ce navigateur ne reçoit pas de notification poussée (sur iPhone : seulement
 *    une fois DIASPORA.GA ajoutée à l'écran d'accueil) ;
 *  · `unavailable` : le serveur n'est pas configuré pour envoyer (clés, registre des
 *    applications) — ou, en démonstration, rien n'est envoyé ;
 *  · `denied` : la personne a bloqué les notifications de ce site dans son navigateur ;
 *  · `off` : prêt, non abonné ; `on` : abonné sur cet appareil, pour cette session.
 */
export const DEVICE_NOTIFICATION_STATES = ["unsupported", "unavailable", "denied", "off", "on"] as const
export type DeviceNotificationState = (typeof DEVICE_NOTIFICATION_STATES)[number]

export interface DeviceNotificationsView {
  readonly state: DeviceNotificationState
  /** Cet appareil porte encore un abonnement (navigateur ou serveur) : « Désactiver » le retire. */
  readonly subscribedHere: boolean
}

/** Ce que l'adaptateur a relevé, du navigateur et du serveur. */
export interface DeviceNotificationFacts {
  readonly supported: boolean
  readonly configured: boolean
  readonly permission: "default" | "granted" | "denied"
  /** Le navigateur porte une souscription, et le serveur une ligne active de cet appareil pour cette session. */
  readonly subscribed: boolean
}

/** L'état dit à l'écran — une règle, la même pour le moteur et la démonstration. */
export function deviceNotificationState(facts: DeviceNotificationFacts): DeviceNotificationState {
  if (!facts.supported) return "unsupported"
  if (!facts.configured) return "unavailable"
  if (facts.permission === "denied") return "denied"
  return facts.subscribed ? "on" : "off"
}

/** Codes de refus propres à l'activation (fragment `device-notifications.json`). */
export const DEVICE_NOTIFICATIONS_ERROR_CODES = [
  // Le serveur n'est pas configuré pour ce navigateur (clé, registre, service push refusé).
  "push_unavailable",
  // La personne a refusé l'autorisation dans son navigateur.
  "push_denied",
  // L'autorisation a été fermée sans réponse, ou le geste a été interrompu.
  "push_cancelled",
  // Ce navigateur ne reçoit pas de notification poussée.
  "push_unsupported",
] as const
export type DeviceNotificationsErrorCode = (typeof DEVICE_NOTIFICATIONS_ERROR_CODES)[number]

export interface DeviceNotificationsCapability {
  /** L'état de CET appareil pour la personne affichée ; la session d'une autre personne : `not_found`. */
  useDevice(personId: string): Loadable<DeviceNotificationsView>
  /**
   * Le geste « Activer » : demande l'autorisation du navigateur, pose l'accord « notifications »
   * du réseau, puis abonne CET appareil. Rien n'est écrit si le navigateur refuse. `origin` : d'où
   * vient le geste dans le journal des consentements — les réglages (par défaut) ou l'invite de
   * première visite (`prompt`).
   */
  enable(personId: string, options?: { readonly origin?: ConsentGestureOrigin }): Promise<ActionResult>
  /** Retire CET appareil (serveur, puis navigateur) ; l'accord reste, retirable dans « Consentements ». */
  disable(personId: string): Promise<ActionResult>
}
