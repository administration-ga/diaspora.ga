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
