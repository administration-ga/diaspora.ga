"use client"

/**
 * Adaptateur moteur de la capacité « notifications de cet appareil » (DS-14, volet push).
 * PROPRIÉTAIRE : ce lot.
 *
 * Fonctions du moteur EXISTANTES — aucun changement du moteur (`notifications/pushSubscriptions`) :
 *   · `configuration({ networkId })` : les applications déclarées pour le réseau, la clé publique
 *     VAPID, la disponibilité du push web — sans clé privée ni souscription ;
 *   · `listMine({ networkId })` : mes abonnements actifs (empreinte, appareil, session courante),
 *     sans clé ;
 *   · `subscribe(…)` (débit `notification.subscribe`, adresse du service push relue contre
 *     `WEB_PUSH_ALLOWED_ORIGINS`), `unsubscribe(…)` (sur soi, même suspendu) ;
 *   · `people/consents:recordConsent` : l'accord « notifications » du RÉSEAU, celui que le moteur
 *     relit avant tout envoi (`notificationConsent`), posé au geste, après l'autorisation du
 *     navigateur et avant l'abonnement.
 *
 * Sans configuration du serveur (variables absentes, application `diaspora_ga` absente du registre
 * `NOTIFICATION_APPLICATIONS_JSON`), l'état est `unavailable` et l'activation ne demande rien au
 * navigateur. Chaque geste relit d'abord la personne de la session : un changement de personne le
 * ferme (`not_found`) avant toute écriture.
 */
import { useStableConvexAuth } from "@antsia/api/hooks"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  deviceNotificationState,
  type ActionErrorCode,
  type ActionResult,
  type DeviceNotificationsCapability,
  type DeviceNotificationsView,
  type Loadable,
} from "@diaspora-ga/features/data"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"

import {
  browserPush,
  type BrowserPushSnapshot,
  currentDeviceSubscriptions,
  disableWebNotifications,
  enableWebNotifications,
  NOTIFICATION_APPLICATION_ID,
  type PushBrowser,
  type PushResult,
} from "@/lib/web-push"

import { engineActionErrorCode } from "./engine-errors"
import { type EngineSourceDeps, failed, LOADING, ready, Refusal, resolveDiasporaGaNetworkId, useLoaded, useNetworkId } from "./engine-kit"

type PushConfiguration = FunctionReturnType<typeof api.modules.notifications.pushSubscriptions.configuration>

/**
 * La clé publique VAPID si le serveur PEUT envoyer à DIASPORA.GA : push web disponible, application
 * `diaspora_ga` déclarée pour le réseau, clé publique servie. `null` : indisponible.
 */
export function webPushPublicKey(configuration: PushConfiguration | null): string | null {
  if (!configuration?.available.web || !configuration.vapidPublicKey) return null
  return configuration.applications.some((application) => application.applicationId === NOTIFICATION_APPLICATION_ID) ? configuration.vapidPublicKey : null
}

/** L'issue d'une activation refusée par le navigateur, en code fermé. */
export function pushRefusalCode(reason: Extract<PushResult, { ok: false }>["reason"]): ActionErrorCode {
  if (reason === "denied") return "push_denied"
  if (reason === "unavailable") return "push_unavailable"
  if (reason === "unsupported") return "push_unsupported"
  return "push_cancelled"
}

/**
 * Les refus de l'activation, en codes FERMÉS. Le moteur refuse une adresse de service push que
 * son registre ne connaît pas (`invalidArgument`) : pour la personne, c'est « indisponible ».
 */
export function deviceNotificationsErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof Refusal) return error.code
  if (engineErrorCode(error) === "invalidArgument") return "push_unavailable"
  return engineActionErrorCode(error)
}

async function run(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work()
    return { ok: true, value: null }
  } catch (error) {
    return { ok: false, code: deviceNotificationsErrorCode(error) }
  }
}

export function createEngineDeviceNotifications(deps: EngineSourceDeps, browser: PushBrowser = browserPush()): DeviceNotificationsCapability {
  /** Le geste ne vaut que pour la personne affichée : une autre session le ferme avant toute écriture. */
  async function expectPerson(personId: string): Promise<void> {
    const person = await deps.convex.query(api.modules.people.persons.getMyPerson, {})
    if (!person) throw new Refusal("not_signed_in")
    if (person._id !== personId) throw new Refusal("not_found")
  }

  return {
    useDevice(personId: string): Loadable<DeviceNotificationsView> {
      const auth = useStableConvexAuth()
      const signedIn = auth.isAuthenticated
      const network = useNetworkId()
      const networkId = network.state === "ready" ? network.value : null
      const person = useLoaded(api.modules.people.persons.getMyPerson, signedIn ? {} : "skip")
      const configuration = useLoaded(api.modules.notifications.pushSubscriptions.configuration, signedIn && networkId ? { networkId } : "skip")
      const devices = useLoaded(api.modules.notifications.pushSubscriptions.listMine, signedIn && networkId ? { networkId } : "skip")
      const rows = devices.state === "ready" ? devices.value : null
      const [snapshot, setSnapshot] = useState<BrowserPushSnapshot | null>(null)
      // Le navigateur se relit quand mes abonnements changent (après un geste ici, ou ailleurs) :
      // une lecture seule, aucune demande d'autorisation au montage.
      useEffect(() => {
        let current = true
        void browser.snapshot().then((value) => {
          if (current) setSnapshot(value)
        })
        return () => {
          current = false
        }
      }, [rows])
      if (auth.isUnauthenticated) return failed("not_signed_in")
      if (!signedIn) return LOADING
      if (network.state === "error") return failed(network.code)
      if (network.state === "ready" && networkId === null) return failed("network_unavailable")
      if (person.state === "error") return failed(person.code)
      if (configuration.state === "error") return failed(configuration.code)
      if (devices.state === "error") return failed(devices.code)
      if (person.state !== "ready" || configuration.state !== "ready" || rows === null || snapshot === null || person.value === null) return LOADING
      if (person.value._id !== personId) return failed("not_found")
      const mine = currentDeviceSubscriptions(rows, snapshot.hash, browser.deviceId())
      const subscribed = snapshot.hash !== null && mine.some((row) => row.currentSession !== false)
      return ready({
        state: deviceNotificationState({ supported: snapshot.supported, configured: webPushPublicKey(configuration.value) !== null, permission: snapshot.permission, subscribed }),
        subscribedHere: snapshot.hash !== null || mine.length > 0,
      })
    },

    enable: (personId, options) => run(async () => {
      await expectPerson(personId)
      if (!(await browser.snapshot()).supported) throw new Refusal("push_unsupported")
      const networkId = await resolveDiasporaGaNetworkId(deps.convex)
      const publicKey = webPushPublicKey(await deps.convex.query(api.modules.notifications.pushSubscriptions.configuration, { networkId }))
      // Serveur non configuré : rien n'est demandé au navigateur, rien n'est écrit.
      if (publicKey === null) throw new Refusal("push_unavailable")
      const result = await enableWebNotifications({
        register: browser.register,
        requestPermission: browser.requestPermission,
        deviceId: browser.ensureDeviceId,
        current: () => true,
        // L'origine du geste : les réglages, ou l'invite de première visite (`prompt`).
        recordConsent: () => deps.convex.mutation(api.modules.people.consents.recordConsent, { networkId, purpose: "notifications", origin: options?.origin ?? "settings" }),
        subscribe: (input) => deps.convex.mutation(api.modules.notifications.pushSubscriptions.subscribe, { networkId, ...input }),
        unsubscribe: (subscriptionId) => deps.convex.mutation(api.modules.notifications.pushSubscriptions.unsubscribe, { networkId, subscriptionId: subscriptionId as Id<"pushSubscriptions"> }),
      }, publicKey)
      if (!result.ok) throw new Refusal(pushRefusalCode(result.reason))
    }),

    disable: (personId) => run(async () => {
      await expectPerson(personId)
      const networkId = await resolveDiasporaGaNetworkId(deps.convex)
      const rows = await deps.convex.query(api.modules.notifications.pushSubscriptions.listMine, { networkId })
      await disableWebNotifications({
        subscription: await browser.subscription(),
        subscriptions: rows,
        deviceId: browser.deviceId(),
        unsubscribe: (subscriptionId) => deps.convex.mutation(api.modules.notifications.pushSubscriptions.unsubscribe, { networkId, subscriptionId: subscriptionId as Id<"pushSubscriptions"> }),
      })
    }),
  }
}
