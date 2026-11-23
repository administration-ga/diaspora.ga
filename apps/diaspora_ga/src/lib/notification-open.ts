// Dupliqué de ANTSIA/apps/antsia_ga/src/lib/notification-open.ts @ c7abff4c — adaptations : le paramètre vit dans la table des routes de diaspora.ga (`NOTIFICATION_REFERENCE_PARAM`) ; `null` au lieu de `undefined` pour une référence illisible.
/**
 * DS-14 (ouverture) — la référence d'une notification poussée, lue dans l'adresse de la porte
 * d'ouverture. Module PUR. Une notification ne transporte qu'une référence OPAQUE, jamais une
 * destination libre : tout ce qui n'a pas la forme d'un identifiant du moteur (valeur répétée
 * comprise) est écarté, et la porte mène alors à la page des notifications.
 */

/** Plus longue qu'un identifiant du moteur, ce n'en est pas un (même borne que la porte du moteur). */
const REFERENCE_MAX_LENGTH = 64

/** La référence lisible d'une adresse de la porte d'ouverture, ou `null`. */
export function parseNotificationReference(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= REFERENCE_MAX_LENGTH && !/[^a-zA-Z0-9_-]/.test(value) ? value : null
}
