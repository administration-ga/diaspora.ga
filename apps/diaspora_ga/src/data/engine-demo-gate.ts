"use client"

/**
 * La porte des comptes de démonstration — adaptateur MOTEUR de la capacité `demoGate`
 * (CH-817, lot A1 ; le moteur la sert depuis les lots E1 à E4 d'ANTSIA).
 *
 * - L'état (`closed`, `open`, `unavailable`, `gated`) se lit dans la configuration publique de
 *   l'authentification (`platform/authentication.configuration`, champ `demoGate`). Un moteur
 *   d'avant la porte ne le publie pas : la page se conduit comme avant (porte non armée), le
 *   catalogue du moteur décidant seul de ce qui s'affiche.
 * - Demander et vérifier un code se fait par les deux routes HTTP du moteur, appelées DIRECTEMENT
 *   par le navigateur sur l'origine des actions HTTP (`NEXT_PUBLIC_CONVEX_SITE_URL`) : le relais
 *   d'authentification de ce site retire l'adresse du visiteur, dont la porte a besoin pour ses
 *   seaux. Corps JSON, `Content-Type: application/json` (le moteur l'exige), sans témoin ni cache,
 *   sans redirection.
 * - Le jeton de la session de porte ne vit que dans le `sessionStorage` de cet onglet (et dans la
 *   mémoire de la page quand ce stockage est refusé), jamais dans une adresse, un journal, un témoin
 *   ni le `localStorage`. Il est oublié à son échéance, que la page tient elle-même : une requête du
 *   moteur fige son horloge, un abonnement ne se rouvre pas seul à l'échéance.
 * - CH-817 E5 : le verrou réel du moteur est la CONNEXION. Porte armée, il refuse d'envoyer un code de
 *   connexion à une adresse de la famille réservée (`…@demo.diaspora-ga.test`), et de s'y connecter,
 *   sans ce jeton dans l'en-tête `X-Demo-Gate-Token` (constante du contrat). Le refus est indistinct :
 *   l'envoi répond comme un envoi réel (aucun code n'existe), la connexion comme un code faux. La source
 *   moteur pose l'en-tête sur ces DEUX requêtes pour un acteur choisi dans la feuille seulement
 *   (`engine-source.ts`, option `demoActor`).
 * - Le jeton accompagne aussi les deux lectures, second verrou : le catalogue (tranche des comptes de
 *   démonstration du moteur) et le code relu par la feuille (`devTools.latestOtp`), pour les seules
 *   adresses déclarées des acteurs. Une adresse ordinaire ne le reçoit jamais.
 * - Un 429 (`request` comme `verify`) est un refus de l'ADRESSE, visible et immédiat : son délai
 *   (`retryAfterMs`, ou `Retry-After`) passe à l'écran, qui dit l'attente.
 *
 * Aucun numéro n'est gardé ici : il part dans la demande, puis seule la feuille le garde en mémoire
 * le temps de renvoyer un code.
 */
import {
  DEMO_GATE_CHALLENGE_ID_PATTERN,
  DEMO_GATE_PATHS,
  DEMO_GATE_SESSION_TTL_SECONDS,
  DEMO_GATE_STATES,
  DEMO_GATE_TOKEN_PATTERN,
  normalizeDemoGateCode,
  normalizeDemoGatePhone,
  type DemoGateScope,
  type DemoGateState,
} from "@antsia/social-contracts/demoGate"
import { api } from "@convex/_generated/api"
import { diasporaGaDemoActorOfEmail } from "@diaspora-ga/domain"
import type { DemoGateCapability, DemoGateChallengeView, DemoGateResult, DemoGateSessionView, Loadable } from "@diaspora-ga/features/data"
import { useMemo, useSyncExternalStore } from "react"

import { failed, LOADING, ready, useLoaded } from "./engine-kit"

/** La portée de DIASPORA.GA dans la porte du moteur : sa liste de numéros est la sienne. */
export const DEMO_GATE_SCOPE: DemoGateScope = "diaspora-ga"

/**
 * La clé de la session de porte dans le `sessionStorage` de l'onglet. Sans le préfixe purgé par
 * « Se déconnecter partout » : la session de porte est celle du VISITEUR, pas du compte de
 * démonstration ; elle survit à la sortie d'un acteur pour en essayer un autre, jusqu'à son
 * échéance (trente minutes au plus), et disparaît avec l'onglet.
 */
export const DEMO_GATE_STORAGE_KEY = "diaspora-ga:demo-gate"

/** Une demande admise répond après quatre secondes (plancher du moteur, l'envoi WhatsApp borné à trois) : vingt suffisent. */
const REQUEST_TIMEOUT_MS = 20_000
/** Le plus long délai qu'accepte `setTimeout` (au-delà, il partirait aussitôt). */
const MAX_TIMER_MS = 2_147_483_647

/** La session de porte, telle que l'onglet la garde. */
export interface StoredDemoGateSession {
  readonly token: string
  /** L'échéance, à l'horloge de CET appareil. */
  readonly expiresAt: number
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** La session de porte de l'onglet : lue, gardée, oubliée ; ses abonnés sont prévenus de chaque changement. */
export interface DemoGateTokenStore {
  /** La session valide, ou `null` ; une session échue est oubliée à la lecture. */
  current(): StoredDemoGateSession | null
  /** Pour `useSyncExternalStore` : la même référence tant que rien ne change, sans effet de bord visible. */
  snapshot(): StoredDemoGateSession | null
  save(session: StoredDemoGateSession): void
  clear(): void
  subscribe(listener: () => void): () => void
}

/** Le `sessionStorage` du navigateur, ou `null` (rendu serveur, stockage refusé par le navigateur). */
function browserSessionStorage(): SessionStorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

function parseStoredSession(raw: string | null | undefined): StoredDemoGateSession | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return null
    const { token, expiresAt } = value as Record<string, unknown>
    if (typeof token !== "string" || !DEMO_GATE_TOKEN_PATTERN.test(token)) return null
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null
    return { token, expiresAt }
  } catch {
    return null
  }
}

/**
 * La session de porte de l'onglet. Le stockage refusé (navigation privée, données du site
 * bloquées) ne casse rien : la session reste dans la mémoire de la page, rien n'est écrit ailleurs.
 */
export function createDemoGateTokenStore(options: { readonly storage?: () => SessionStorageLike | null; readonly now?: () => number } = {}): DemoGateTokenStore {
  const storage = options.storage ?? browserSessionStorage
  const now = options.now ?? Date.now
  const listeners = new Set<() => void>()
  let loaded = false
  let session: StoredDemoGateSession | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function persist(value: StoredDemoGateSession | null): void {
    try {
      const target = storage()
      if (value === null) target?.removeItem(DEMO_GATE_STORAGE_KEY)
      else target?.setItem(DEMO_GATE_STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Stockage refusé : la session reste dans la mémoire de cette page, nulle part ailleurs.
    }
  }

  function schedule(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (session === null) return
    timer = setTimeout(expire, Math.min(MAX_TIMER_MS, Math.max(0, session.expiresAt - now())))
  }

  function expire(): void {
    timer = null
    if (session !== null && session.expiresAt <= now()) set(null)
    else schedule()
  }

  function set(value: StoredDemoGateSession | null): void {
    loaded = true
    session = value
    persist(value)
    schedule()
    for (const listener of [...listeners]) listener()
  }

  function load(): void {
    if (loaded) return
    loaded = true
    let raw: string | null = null
    try {
      raw = storage()?.getItem(DEMO_GATE_STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    const stored = parseStoredSession(raw)
    session = stored !== null && stored.expiresAt > now() ? stored : null
    if (stored !== null && session === null) persist(null)
    schedule()
  }

  return {
    current() {
      load()
      if (session !== null && session.expiresAt <= now()) set(null)
      return session
    },
    snapshot() {
      load()
      return session
    },
    save(value) {
      set(value)
    },
    clear() {
      set(null)
    },
    subscribe(listener) {
      load()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** La session de porte de l'onglet, partagée par l'adaptateur de la porte et les deux lectures qui la portent. */
export const demoGateTokens: DemoGateTokenStore = createDemoGateTokenStore()

/** La session de porte, lue de façon réactive (abonnement au magasin de l'onglet). */
export function useDemoGateTokenSession(tokens: DemoGateTokenStore): StoredDemoGateSession | null {
  return useSyncExternalStore(tokens.subscribe, tokens.snapshot, () => null)
}

/**
 * Le jeton de porte qui accompagne les requêtes d'un compte de démonstration de cette adresse, ou
 * `null` : seulement pour l'adresse DÉCLARÉE d'un acteur de DIASPORA.GA (celles du catalogue), et
 * une session valide. Une autre adresse de la famille réservée, ou une adresse ordinaire, jamais.
 */
export function demoGateTokenFor(email: string, tokens: DemoGateTokenStore): string | null {
  if (diasporaGaDemoActorOfEmail(email) === null) return null
  return tokens.current()?.token ?? null
}

/** L'état publié par le moteur ; absent (moteur d'avant la porte), la conduite d'avant : porte non armée. */
export function toDemoGateState(value: string | undefined): DemoGateState {
  if (value === undefined) return "open"
  return (DEMO_GATE_STATES as readonly string[]).includes(value) ? (value as DemoGateState) : "unavailable"
}

/** L'origine des actions HTTP du moteur, ou `null` si la variable est absente ou n'est pas une origine http(s). */
export function demoGateOrigin(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null
  try {
    const url = new URL(siteUrl)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

interface GateReply {
  readonly status: number
  readonly body: Record<string, unknown> | null
  readonly retryAfter: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Le délai d'un refus pour trop d'essais : le corps d'abord, l'en-tête `Retry-After` (en secondes) sinon. */
function retryAfterMsOf(reply: GateReply): number | undefined {
  const fromBody = reply.body?.retryAfterMs
  if (typeof fromBody === "number" && Number.isFinite(fromBody) && fromBody >= 0) return fromBody
  const seconds = Number(reply.retryAfter)
  return reply.retryAfter !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : undefined
}

export interface EngineDemoGateOptions {
  readonly siteUrl: string | null | undefined
  readonly tokens?: DemoGateTokenStore
  readonly fetch?: typeof fetch
  readonly now?: () => number
}

export function createEngineDemoGate(options: EngineDemoGateOptions): DemoGateCapability {
  const origin = demoGateOrigin(options.siteUrl)
  const tokens = options.tokens ?? demoGateTokens
  // Appelé sans objet porteur : `fetch` détaché de `globalThis` refuserait de partir dans un navigateur.
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init))
  const now = options.now ?? Date.now

  /** Un appel à une route de la porte ; `null` quand le réseau n'a rien rendu (hors ligne, délai, refus du navigateur). */
  async function post(path: string, body: Record<string, string>): Promise<GateReply | null> {
    if (origin === null) return null
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    }
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    try {
      const response = await send(new URL(path, origin).toString(), init)
      let parsed: unknown = null
      try {
        parsed = await response.json()
      } catch {
        parsed = null
      }
      return { status: response.status, body: isRecord(parsed) ? parsed : null, retryAfter: response.headers.get("retry-after") }
    } catch {
      return null
    }
  }

  return {
    useGateState(): Loadable<DemoGateState> {
      const configuration = useLoaded(api.modules.platform.authentication.configuration, {})
      const value = configuration.state === "ready" ? toDemoGateState(configuration.value.demoGate) : null
      const code = configuration.state === "error" ? configuration.code : null
      // Une projection mémorisée : un Loadable neuf à chaque rendu relancerait ses lecteurs sans fin.
      return useMemo<Loadable<DemoGateState>>(() => {
        if (code !== null) return failed(code)
        return value === null ? LOADING : ready(value)
      }, [value, code])
    },
    reachable: origin !== null,
    useSession(): DemoGateSessionView | null {
      const session = useDemoGateTokenSession(tokens)
      const expiresAt = session?.expiresAt ?? null
      return useMemo(() => (expiresAt === null ? null : { expiresAt }), [expiresAt])
    },
    async requestCode(phone, locale): Promise<DemoGateResult<DemoGateChallengeView>> {
      const normalized = normalizeDemoGatePhone(phone)
      if (normalized === null) return { ok: false, code: "phone_invalid" }
      if (origin === null) return { ok: false, code: "demo_gate_unavailable" }
      const sentAt = now()
      const reply = await post(DEMO_GATE_PATHS.request, { scope: DEMO_GATE_SCOPE, phone: normalized, locale })
      if (reply === null) return { ok: false, code: "network_unavailable" }
      if (reply.status === 202) {
        const challengeId = reply.body?.challengeId
        const expiresInSeconds = reply.body?.expiresInSeconds
        if (reply.body?.ok === true && typeof challengeId === "string" && DEMO_GATE_CHALLENGE_ID_PATTERN.test(challengeId) && typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
          return { ok: true, value: { challengeId, expiresAt: sentAt + expiresInSeconds * 1_000 } }
        }
        return { ok: false, code: "unknown" }
      }
      if (reply.status === 400) return { ok: false, code: "phone_invalid" }
      // CH-817 E5 : l'adresse a épuisé son seau — refus visible et immédiat, qui ne dépend pas du numéro.
      if (reply.status === 429) {
        const retryAfterMs = retryAfterMsOf(reply)
        return retryAfterMs === undefined ? { ok: false, code: "rate_limited" } : { ok: false, code: "rate_limited", retryAfterMs }
      }
      // 404 (porte fermée ou non armée entre-temps) et 503 (indisponible) : la même phrase.
      if (reply.status === 404 || reply.status === 503) return { ok: false, code: "demo_gate_unavailable" }
      return { ok: false, code: "unknown" }
    },
    async verifyCode(challengeId, code): Promise<DemoGateResult<DemoGateSessionView>> {
      const normalized = normalizeDemoGateCode(code)
      if (normalized === null || !DEMO_GATE_CHALLENGE_ID_PATTERN.test(challengeId)) return { ok: false, code: "demo_gate_code_invalid" }
      if (origin === null) return { ok: false, code: "demo_gate_unavailable" }
      const sentAt = now()
      const reply = await post(DEMO_GATE_PATHS.verify, { scope: DEMO_GATE_SCOPE, challengeId, code: normalized })
      if (reply === null) return { ok: false, code: "network_unavailable" }
      if (reply.status === 200) {
        const token = reply.body?.token
        const expiresAt = reply.body?.expiresAt
        if (reply.body?.ok !== true || typeof token !== "string" || !DEMO_GATE_TOKEN_PATTERN.test(token) || typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
          return { ok: false, code: "unknown" }
        }
        // L'échéance à l'horloge de CET appareil : la session dure trente minutes depuis sa création,
        // avant cette réponse ; l'échéance du moteur ne la raccourcit que si les deux horloges s'accordent.
        const local = sentAt + DEMO_GATE_SESSION_TTL_SECONDS * 1_000
        const session = { token, expiresAt: expiresAt > sentAt ? Math.min(expiresAt, local) : local }
        tokens.save(session)
        return { ok: true, value: { expiresAt: session.expiresAt } }
      }
      // Code faux, défi inconnu, expiré ou épuisé, et demande mal formée : une seule réponse.
      if (reply.status === 401 || reply.status === 400) return { ok: false, code: "demo_gate_code_invalid" }
      if (reply.status === 429) {
        const retryAfterMs = retryAfterMsOf(reply)
        return retryAfterMs === undefined ? { ok: false, code: "too_many_attempts" } : { ok: false, code: "too_many_attempts", retryAfterMs }
      }
      if (reply.status === 404 || reply.status === 503) return { ok: false, code: "demo_gate_unavailable" }
      return { ok: false, code: "unknown" }
    },
    forget() {
      tokens.clear()
    },
  }
}
