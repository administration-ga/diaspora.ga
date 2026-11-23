/**
 * Démonstration de la capacité « notifications de cet appareil » (DS-14, volet push).
 *
 * La démonstration n'a pas de serveur d'envoi : rien n'y part vers un appareil. Elle le dit
 * (`unavailable`), et aucun geste n'y réussit — jamais un « activé » qui ne serait pas vrai,
 * jamais une demande d'autorisation du navigateur pour rien. Aucune donnée n'est écrite.
 */
import { deviceNotificationState, type DeviceNotificationsCapability, type DeviceNotificationsView } from "../data/device-notifications-port"
import type { ActionResult } from "../data/port"
import type { Loadable } from "../data/types"

/** Le même état pour tout le monde : le navigateur sait peut-être recevoir, la démonstration n'envoie rien. */
const DEMO_VIEW: Loadable<DeviceNotificationsView> = Object.freeze({
  status: "ready" as const,
  data: Object.freeze({
    state: deviceNotificationState({ supported: true, configured: false, permission: "default", subscribed: false }),
    subscribedHere: false,
  }),
})

const UNAVAILABLE: ActionResult = Object.freeze({ ok: false as const, code: "push_unavailable" as const })

export function createDemoDeviceNotifications(): DeviceNotificationsCapability {
  return {
    useDevice: () => DEMO_VIEW,
    enable: async () => UNAVAILABLE,
    disable: async () => UNAVAILABLE,
  }
}
