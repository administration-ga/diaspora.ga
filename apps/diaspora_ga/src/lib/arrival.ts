/**
 * La porte d'arrivée de qui vient de consulat.ga (contrat DIASPORA-PASSERELLE-V1, CH-863, lot D1).
 *
 *  · consulat.ga mène à `/entrer?depuis=consulat` (`routes.enterFromConsulate`) : un repère
 *    d'origine FERMÉ, qui ne désigne personne. La page `/entrer` le lit côté serveur, comme
 *    `inscription=1` (`parseArrival`) : seule la valeur `consulat` est admise, toute autre est
 *    ignorée. La porte dit alors « Vous arrivez de consulat.ga » ; elle ne part jamais d'elle-même
 *    vers identite.ga : l'entrée reste un geste de la personne.
 *  · Le repère traverse la connexion (code, passage par identite.ga, accueil) dans l'onglet
 *    (`sessionStorage`, jamais dans l'adresse), avec une échéance courte, comme la page demandée
 *    avant la connexion (`return-path.ts`). Préfixe `antsia:` : la déconnexion de partout du moteur
 *    le purge. Le fil (ou le hub d'un nouveau membre) le LIT UNE FOIS (`takeArrival`) pour montrer
 *    la carte d'arrivée, et l'oublie aussitôt.
 */
import { tabStorage, type TabStorage } from "./return-path"

/** Le paramètre de la porte d'arrivée, et ses seules valeurs. */
export const ARRIVAL_PARAM = "depuis"
export const ARRIVAL_ORIGINS = ["consulat"] as const
export type ArrivalOrigin = (typeof ARRIVAL_ORIGINS)[number]

/** Le repère de l'onglet : d'où la personne arrive, et quand. */
export interface ArrivalMark {
  readonly origin: ArrivalOrigin
  readonly at: number
}

/** Préfixe `antsia:` : la déconnexion de partout du moteur purge aussi cette clé. */
export const ARRIVAL_KEY = "antsia:diaspora-ga:arrival"
/** Le temps d'entrer, de lire son code ou de passer par identite.ga ; au-delà, aucune carte. */
export const ARRIVAL_TTL_MS = 30 * 60 * 1000

function isArrivalOrigin(value: unknown): value is ArrivalOrigin {
  return (ARRIVAL_ORIGINS as readonly unknown[]).includes(value)
}

/** La valeur lue dans l'adresse (`searchParams` de la page) : `consulat` seul, tel quel ; sinon rien. */
export function parseArrival(raw: string | string[] | undefined): ArrivalOrigin | null {
  return typeof raw === "string" && isArrivalOrigin(raw) ? raw : null
}

/** Retient l'arrivée dans l'onglet, à la porte. Un stockage refusé ne retient rien : seule la carte est perdue. */
export function rememberArrival(origin: ArrivalOrigin, now: number = Date.now(), storage: TabStorage | null = tabStorage()): void {
  try {
    storage?.setItem(ARRIVAL_KEY, JSON.stringify({ origin, at: now }))
  } catch {
    // Stockage refusé : la porte reste la même, seule la carte d'arrivée ne viendra pas.
  }
}

/** Oublie l'arrivée (« Ce n'est pas moi », ou un repère illisible). */
export function forgetArrival(storage: TabStorage | null = tabStorage()): void {
  try {
    storage?.removeItem(ARRIVAL_KEY)
  } catch {
    // Rien à oublier.
  }
}

/**
 * L'arrivée retenue, lue UNE fois : relue, revalidée, puis oubliée dans tous les cas. `null` si
 * absente, échue, venue du futur ou altérée.
 */
export function takeArrival(now: number = Date.now(), storage: TabStorage | null = tabStorage()): ArrivalMark | null {
  let raw: string | null | undefined
  try {
    raw = storage?.getItem(ARRIVAL_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  forgetArrival(storage)
  try {
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== "object" || stored === null) return null
    const { origin, at } = stored as { readonly origin?: unknown; readonly at?: unknown }
    if (!isArrivalOrigin(origin) || typeof at !== "number" || at > now || now - at > ARRIVAL_TTL_MS) return null
    return { origin, at }
  } catch {
    return null
  }
}
