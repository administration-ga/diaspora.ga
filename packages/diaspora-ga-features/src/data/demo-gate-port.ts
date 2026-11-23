/**
 * Capacité « porte des comptes de démonstration » du port (CH-817, lot A1).
 *
 * Servie par le fournisseur MOTEUR : la porte vit dans le moteur ANTSIA
 * (`convex/modules/platform/demoGate*.ts`), sur le déploiement de démonstration déclaré, comme
 * verrou de plus sous les comptes de démonstration. Elle resserre, elle n'ouvre rien : une personne
 * dont le numéro est sur la liste du moteur reçoit par WhatsApp un code de « 6 chiffres et 1
 * lettre », l'échange contre une session courte (trente minutes), puis choisit un acteur. Ce code
 * est celui de la PORTE ; le code de connexion (6 chiffres) et son formulaire ne changent pas.
 *
 * Les quatre états viennent du moteur (`platform/authentication.configuration`, champ `demoGate`) :
 * `closed` (production comprise : rien ne s'affiche), `open` (porte non armée : la liste des
 * acteurs, comme avant), `unavailable` (porte armée mais incomplète : personne n'entre) et
 * `gated` (numéro, code, puis acteurs).
 *
 * La démonstration (données fictives de ce navigateur) ne sert pas cette capacité : elle a ses
 * propres comptes (`/demo`), sans porte, et jamais un faux succès.
 *
 * Les règles de forme (code, numéro) sont celles du contrat du moteur
 * (`@antsia/social-contracts/demoGate`), jamais recopiées ici.
 */
import { DEMO_GATE_CODE_DIGITS, DEMO_GATE_STATES, type DemoGateLocale, type DemoGateState } from "@antsia/social-contracts/demoGate"

import type { ActionErrorCode } from "./errors"
import type { Loadable } from "./types"

export { DEMO_GATE_STATES, type DemoGateLocale, type DemoGateState }

/**
 * Les refus de la porte que l'écran traduit par `errors.<code>`, en plus des codes communs
 * (`phone_invalid`, `too_many_attempts`, `network_unavailable`, `unknown`) :
 *  · `demo_gate_unavailable` : la porte ne sert pas (incomplète, fermée entre-temps, injoignable) ;
 *  · `demo_gate_code_invalid` : code faux, défi inconnu, expiré ou épuisé — une seule réponse.
 */
export const DEMO_GATE_ERROR_CODES = ["demo_gate_unavailable", "demo_gate_code_invalid"] as const

/** Le refus du formulaire du code, posé par l'écran avant tout envoi : la forme « 6 chiffres + 1 lettre ». */
export const DEMO_GATE_FORM_ERROR_CODES = ["demo_gate_code_format"] as const

/** Les étapes de la feuille, dans l'ordre du parcours ; `unavailable` remplace les trois autres. */
export const DEMO_GATE_SHEET_STEPS = ["phone", "code", "actors", "unavailable"] as const
export type DemoGateSheetStep = (typeof DEMO_GATE_SHEET_STEPS)[number]

/** La session de porte de cet onglet, sans son jeton (il ne quitte jamais l'adaptateur). */
export interface DemoGateSessionView {
  /** L'échéance locale de la session : l'adaptateur oublie le jeton à cet instant. */
  readonly expiresAt: number
}

/** Le défi d'un code demandé : son identifiant opaque et son échéance locale. */
export interface DemoGateChallengeView {
  readonly challengeId: string
  readonly expiresAt: number
}

/**
 * Le résultat d'un geste de la porte : celui de toute action, plus le délai à attendre quand le
 * moteur refuse pour trop d'essais (`too_many_attempts`, `retryAfterMs`).
 */
export type DemoGateResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ActionErrorCode; readonly retryAfterMs?: number }

export interface DemoGateCapability {
  /** L'état de la porte, lu dans la configuration publique du moteur. */
  useGateState(): Loadable<DemoGateState>
  /**
   * Vrai si la porte est joignable depuis ce site (l'origine des actions HTTP du moteur est
   * déclarée) : faux, la pastille ne s'affiche pas quand la porte est armée (jamais un geste mort).
   */
  readonly reachable: boolean
  /** La session de porte valide de cet onglet, ou `null` ; elle disparaît d'elle-même à son échéance. */
  useSession(): DemoGateSessionView | null
  /** Demande un code pour ce numéro (E.164). La réponse est la même, que le numéro soit autorisé ou non. */
  requestCode(phone: string, locale: DemoGateLocale): Promise<DemoGateResult<DemoGateChallengeView>>
  /** Échange le code contre une session de porte, gardée dans cet onglet seulement. */
  verifyCode(challengeId: string, code: string): Promise<DemoGateResult<DemoGateSessionView>>
  /** Oublie la session de porte de cet onglet. */
  forget(): void
}

/**
 * L'étape que la feuille montre : `null` quand rien ne s'affiche (porte fermée). Porte non armée :
 * les acteurs, directement ; porte incomplète : le message d'indisponibilité ; porte armée : les
 * acteurs avec une session valide, sinon le code s'il est demandé, sinon le numéro.
 */
export function demoGateSheetStep(input: { readonly state: DemoGateState; readonly session: boolean; readonly challenge: boolean }): DemoGateSheetStep | null {
  switch (input.state) {
    case "closed":
      return null
    case "open":
      return "actors"
    case "unavailable":
      return "unavailable"
    case "gated":
      return input.session ? "actors" : input.challenge ? "code" : "phone"
  }
}

/** Les séparateurs que le champ du code accepte à la saisie (le contrat les retire aussi). */
const CODE_SEPARATORS = /[\s.\-‐‑–]/gu
/** Les caractères significatifs d'un code : six chiffres et une lettre. */
const CODE_LENGTH = DEMO_GATE_CODE_DIGITS + 1

/**
 * La saisie du code telle que le champ l'affiche : séparateurs retirés, majuscules, sept caractères
 * au plus, groupés par trois (`482 913 K`). La validation reste celle du contrat
 * (`normalizeDemoGateCode`) : ce regroupement ne fait que lire la saisie.
 */
export function groupDemoGateCodeInput(raw: string): string {
  const compact = raw.replace(CODE_SEPARATORS, "").toUpperCase().slice(0, CODE_LENGTH)
  const groups = [compact.slice(0, 3), compact.slice(3, DEMO_GATE_CODE_DIGITS), compact.slice(DEMO_GATE_CODE_DIGITS)]
  return groups.filter((group) => group.length > 0).join(" ")
}

/** Une minute entre deux demandes de code : sans message après une minute, l'envoi n'a pas abouti. */
export const DEMO_GATE_RESEND_WAIT_MS = 60_000
/**
 * Le reflet, dans l'écran, du seau du moteur par numéro autorisé (3 demandes par 15 minutes). Le
 * moteur répond pareil quand il limite (rien ne part) : l'écran n'envoie donc pas une demande qui ne
 * servirait à rien.
 */
export const DEMO_GATE_REQUESTS_PER_WINDOW = 3
export const DEMO_GATE_REQUEST_WINDOW_MS = 15 * 60_000

/**
 * Le temps à attendre avant la prochaine demande de code, d'après les demandes déjà faites dans
 * cette feuille : une minute après la dernière, et pas plus de trois dans les quinze dernières
 * minutes. `0` : la demande peut partir.
 */
export function demoGateRequestWaitMs(requestedAt: readonly number[], now: number): number {
  const recent = requestedAt.filter((at) => now - at < DEMO_GATE_REQUEST_WINDOW_MS).sort((a, b) => a - b)
  const last = recent.at(-1)
  const cooldown = last === undefined ? 0 : last + DEMO_GATE_RESEND_WAIT_MS - now
  const oldestCounted = recent.length >= DEMO_GATE_REQUESTS_PER_WINDOW ? recent[recent.length - DEMO_GATE_REQUESTS_PER_WINDOW] : undefined
  const windowWait = oldestCounted === undefined ? 0 : oldestCounted + DEMO_GATE_REQUEST_WINDOW_MS - now
  return Math.max(0, cooldown, windowWait)
}
