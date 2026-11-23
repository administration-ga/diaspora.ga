import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { TFunction } from "i18next"

/**
 * Un refus du moteur dit par la traduction partagée des codes serveur (`@antsia/social-contracts/i18n`,
 * espaces `rules` et `errors`, comme la console du moteur) : la règle enfreinte avec ses bornes,
 * sinon le code fermé, sinon la phrase de repli de l'écran (une clé de l'espace `admin`).
 */
export function engineErrorText(error: unknown, t: TFunction, fallbackKey: string): string {
  const rule = engineErrorRule(error)
  if (rule) return t(`rules:${rule.rule}`, rule.params)
  const code = engineErrorCode(error)
  return code ? t(`errors:${code}`) : t(fallbackKey)
}

/**
 * Le champ fautif d'un `invalidArgument` du moteur (un nom de champ, jamais une valeur) : la
 * section le dit par sa propre phrase, bornes comprises. Déménagé de l'adaptateur du bureau de
 * diaspora.ga (`engine-moderation-desk.ts`, CH-815 A6).
 */
export function invalidFieldOf(error: unknown): string | null {
  if (engineErrorCode(error) !== "invalidArgument" || typeof error !== "object" || error === null || !("data" in error)) return null
  const data = (error as { data: unknown }).data
  if (typeof data !== "object" || data === null || !("field" in data)) return null
  const field = (data as { field: unknown }).field
  return typeof field === "string" ? field : null
}
