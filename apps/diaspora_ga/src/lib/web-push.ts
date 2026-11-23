// Dupliqué de ANTSIA/apps/antsia_ga/src/components/notification-controls.tsx @ 967e731b — adaptations : seules les étapes du NAVIGATEUR sont reprises (`webPushKey`, `browserCredentialHash`, `currentDeviceSubscriptions`, `enableWebNotifications`, `disableWebNotifications`, schéma de la souscription), sorties du composant dans un module de bibliothèque ; identifiant d'application `diaspora_ga` (celui de l'application du catalogue du moteur) au lieu de `antsia_ga` ; script de fond UNIQUE du site (`routes.serviceWorker()`, portée `routes.home()`, MO-05) au lieu de la route du worker d'antsia.ga ; navigateur sans script de fond ou script retiré (`SERVICE_WORKER_RETIRED`) : refus `unsupported` ; identifiant de l'appareil sous la clé `diaspora-ga:appareil-notifications` ; identifiants d'abonnement en chaînes (le type du moteur reste dans l'adaptateur) ; préférences, récapitulatif et plafond non repris (DS-14, volet préférences).
/**
 * Les notifications du NAVIGATEUR (DS-14, volet push) : ce que la page fait elle-même pour
 * abonner CET appareil, sans rien demander au montage.
 *
 *  · l'autorisation du navigateur n'est demandée qu'au geste « Activer » ;
 *  · l'accord « notifications » du réseau est posé APRÈS l'autorisation et AVANT l'abonnement :
 *    un refus du navigateur n'écrit rien ;
 *  · une souscription créée ici puis refusée par le serveur est annulée dans le navigateur ;
 *  · « Désactiver » retire les seules lignes de CET appareil, et ferme la souscription du
 *    navigateur même si le réseau échoue.
 *
 * Aucune clé privée ici : la clé publique VAPID vient de la configuration du moteur
 * (`notifications/pushSubscriptions:configuration`) ; l'adresse du service push est relue par le
 * moteur contre son registre (`WEB_PUSH_ALLOWED_ORIGINS`).
 */
import { z } from "zod"

import { routes } from "./routes"
import { SERVICE_WORKER_RETIRED } from "./service-worker"

/**
 * L'application que le registre des notifications du moteur (`NOTIFICATION_APPLICATIONS_JSON`)
 * doit déclarer pour le réseau `diaspora-ga` — le même identifiant que l'application du catalogue
 * de déploiement du moteur (`DIASPORA_SLICE_MANIFEST.application`).
 */
export const NOTIFICATION_APPLICATION_ID = "diaspora_ga"

/** La clé locale de l'identifiant de CET appareil (aléatoire, jamais lié à la personne ici). */
const DEVICE_ID_KEY = "diaspora-ga:appareil-notifications"

/** Le script de fond ne prend jamais la main : au-delà, l'activation échoue proprement. */
const WORKER_READY_TIMEOUT_MS = 10_000

export type PushPermissionState = "default" | "granted" | "denied"

/** Une ligne d'abonnement telle que le moteur la rend (`listMine`), sans clé. */
export interface DeviceSubscriptionRow {
  readonly subscriptionId: string
  readonly applicationId: string
  readonly deviceId: string
  readonly provider: string
  readonly credentialHash?: string
  readonly currentSession?: boolean
  readonly active: boolean
}

export interface WebCredential {
  readonly provider: "web"
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
}

export type PushResult = { readonly ok: true; readonly credentialHash: string } | { readonly ok: false; readonly reason: "denied" | "unavailable" | "cancelled" | "unsupported" }

/** Ce que ce navigateur sait et porte, lu sans rien demander. */
export interface BrowserPushSnapshot {
  readonly supported: boolean
  readonly permission: PushPermissionState
  /** L'empreinte de la souscription de notre script de fond, ou `null` s'il n'y en a pas. */
  readonly hash: string | null
}

/** Les gestes du navigateur, remplaçables dans les tests (`jsdom` n'a ni script de fond ni service push). */
export interface PushBrowser {
  snapshot(): Promise<BrowserPushSnapshot>
  /** L'identifiant de cet appareil s'il existe déjà ; `null` sinon (jamais créé à la lecture). */
  deviceId(): string | null
  ensureDeviceId(): string
  register(): Promise<ServiceWorkerRegistration>
  requestPermission(): Promise<PushPermissionState>
  /** La souscription de notre script de fond, s'il y en a une. */
  subscription(): Promise<PushSubscription | null>
}

const browserSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine((value) => new URL(value).protocol === "https:"),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/u), auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/u) }),
})

/** La clé publique VAPID (base64url) en octets, comme `pushManager.subscribe` l'attend. */
export function webPushKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/")
  const bytes = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4))
  return Uint8Array.from(bytes, (letter) => letter.charCodeAt(0))
}

/** La même empreinte que le moteur (`web|<adresse>`, SHA-256) : reconnaître sa ligne sans jamais lire sa clé. */
export async function browserCredentialHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`web|${endpoint}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Les lignes actives de CET appareil pour DIASPORA.GA : par l'empreinte du navigateur, sinon par l'identifiant local. */
export function currentDeviceSubscriptions<Row extends DeviceSubscriptionRow>(rows: readonly Row[], hash: string | null, deviceId: string | null): Row[] {
  return rows.filter((row) => row.provider === "web" && row.applicationId === NOTIFICATION_APPLICATION_ID && row.active && (row.credentialHash && hash ? row.credentialHash === hash : !!deviceId && row.deviceId === deviceId))
}

/** Une nouvelle souscription refusée par le serveur est annulée dans le navigateur. */
export async function enableWebNotifications(operations: {
  readonly register: () => Promise<ServiceWorkerRegistration>
  readonly requestPermission: () => Promise<PushPermissionState>
  readonly recordConsent: () => Promise<unknown>
  readonly subscribe: (input: { applicationId: string; deviceId: string; credential: WebCredential }) => Promise<{ subscriptionId: string }>
  readonly unsubscribe: (subscriptionId: string) => Promise<unknown>
  readonly deviceId: () => string
  readonly current: () => boolean
}, publicKey: string): Promise<PushResult> {
  if (!publicKey) return { ok: false, reason: "unavailable" }
  const registration = await operations.register()
  if (!operations.current()) return { ok: false, reason: "cancelled" }
  const permission = await operations.requestPermission()
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "cancelled" }
  if (!operations.current()) return { ok: false, reason: "cancelled" }
  const previous = await registration.pushManager.getSubscription()
  let subscription: PushSubscription | null = null
  let created = false
  let serverId: string | null = null
  try {
    subscription = previous ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: webPushKey(publicKey) })
    created = previous === null
    const parsed = browserSubscriptionSchema.parse(subscription.toJSON())
    const hash = await browserCredentialHash(parsed.endpoint)
    if (!operations.current()) {
      if (created) await subscription.unsubscribe()
      return { ok: false, reason: "cancelled" }
    }
    await operations.recordConsent()
    if (!operations.current()) {
      if (created) await subscription.unsubscribe()
      return { ok: false, reason: "cancelled" }
    }
    const written = await operations.subscribe({ applicationId: NOTIFICATION_APPLICATION_ID, deviceId: operations.deviceId(), credential: { provider: "web", ...parsed } })
    serverId = written.subscriptionId
    if (!operations.current()) {
      await operations.unsubscribe(serverId)
      if (created) await subscription.unsubscribe()
      return { ok: false, reason: "cancelled" }
    }
    return { ok: true, credentialHash: hash }
  } catch (error) {
    if (serverId) await operations.unsubscribe(serverId).catch(() => undefined)
    if (created && subscription) await subscription.unsubscribe().catch(() => undefined)
    throw error
  }
}

/** Désactive les seules lignes du navigateur courant ; le navigateur se ferme même si le réseau échoue. */
export async function disableWebNotifications(operations: {
  readonly subscription: PushSubscription | null
  readonly subscriptions: readonly DeviceSubscriptionRow[]
  readonly deviceId: string | null
  readonly unsubscribe: (subscriptionId: string) => Promise<unknown>
}): Promise<void> {
  try {
    const hash = operations.subscription ? await browserCredentialHash(operations.subscription.endpoint) : null
    const rows = currentDeviceSubscriptions(operations.subscriptions, hash, operations.deviceId)
    for (const row of rows) await operations.unsubscribe(row.subscriptionId)
  } finally {
    if (operations.subscription) await operations.subscription.unsubscribe()
  }
}

// ── Le navigateur réel ────────────────────────────────────────────────────────

/** Le navigateur sait-il recevoir des notifications poussées ? Sur iPhone : seulement l'application installée. */
export function pushSupported(): boolean {
  return !SERVICE_WORKER_RETIRED && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

function permissionNow(): PushPermissionState {
  return typeof Notification === "undefined" ? "default" : Notification.permission
}

function storedDeviceId(): string | null {
  try {
    const value = window.localStorage.getItem(DEVICE_ID_KEY)
    return value && /^[A-Za-z0-9_-]{8,128}$/u.test(value) ? value : null
  } catch {
    return null
  }
}

function ensureStoredDeviceId(): string {
  const existing = storedDeviceId()
  if (existing) return existing
  const value = crypto.randomUUID()
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, value)
  } catch {
    // Sans stockage local, l'empreinte du navigateur suffit à reconnaître cet appareil.
  }
  return value
}

/** Le script de fond du site, inscrit (idempotent) puis actif ; jamais un autre script de l'origine. */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registered = await navigator.serviceWorker.register(routes.serviceWorker(), { scope: routes.home(), updateViaCache: "none" })
  if (registered.active) return registered
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("pushWorkerUnavailable")), WORKER_READY_TIMEOUT_MS)
      }),
    ])
    if (ready.scope !== registered.scope) throw new Error("pushWorkerScopeMismatch")
    return ready
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function ownSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(routes.home())
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** Le navigateur réel ; une lecture qui échoue dit « pas d'abonnement », jamais une erreur à l'écran. */
export function browserPush(): PushBrowser {
  return {
    async snapshot() {
      if (!pushSupported()) return { supported: false, permission: "default", hash: null }
      try {
        const subscription = await ownSubscription()
        return { supported: true, permission: permissionNow(), hash: subscription ? await browserCredentialHash(subscription.endpoint) : null }
      } catch {
        return { supported: true, permission: permissionNow(), hash: null }
      }
    },
    deviceId: storedDeviceId,
    ensureDeviceId: ensureStoredDeviceId,
    register: activeRegistration,
    requestPermission: async () => await Notification.requestPermission(),
    subscription: async () => {
      if (!pushSupported()) return null
      try {
        return await ownSubscription()
      } catch {
        return null
      }
    },
  }
}
