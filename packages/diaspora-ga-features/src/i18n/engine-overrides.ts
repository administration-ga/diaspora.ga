// Fonction de composition dupliquée d'ANTSIA apps/antsia_ga/src/i18n/compose-engine-overrides.ts @ 547b80bc — adaptations : messages d'erreur au nom de DIASPORA.GA ; surcharges propres à DIASPORA.GA (le « live », décision du propriétaire du 26/11/2026) et leur composition une fois pour toutes, au chargement du module.
/**
 * Les textes du MOTEUR que DIASPORA.GA dit autrement : le moteur parle de « conférence », un
 * réseau social populaire dit « live » (décision du propriétaire du 26/11/2026 : « un live »,
 * « Lancer un live », « Préparer le live », « Terminer le live », « Annuler le live », statut
 * « En direct », geste « Passer en direct » ; « replay » pour la rediffusion).
 *
 * Même mécanisme que l'application du moteur (antsia.ga) : les clés du moteur restent les siennes,
 * seules leurs valeurs changent, et l'instance i18next de DIASPORA.GA reçoit les espaces de noms
 * du moteur recomposés (`createAppI18n`). Le moteur remplace un espace de noms ENTIER par celui de
 * l'application (fusion à un niveau) : chaque espace surchargé est donc recomposé intégralement,
 * clés inchangées comprises, sans partager ses objets avec le moteur.
 *
 * La composition est STRICTE : une clé ou un espace de noms que le moteur ne connaît pas, ou une
 * phrase qui remplacerait un groupe, lève une erreur au chargement du module — donc au premier
 * test. Une clé renommée par le moteur ne laisse jamais une surcharge morte en silence.
 */
import { engineResources } from "@antsia/social-features/i18n"

import enOverrides from "./engine-overrides/en.json"
import frOverrides from "./engine-overrides/fr.json"

type Namespace = Readonly<Record<string, unknown>>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy)
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]))
  return value
}

function mergeNamespace(base: Namespace, overrides: Namespace, path: string): Record<string, unknown> {
  const result = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, copy(value)]))
  for (const [key, value] of Object.entries(overrides)) {
    const at = `${path}.${key}`
    if (!Object.hasOwn(base, key)) throw new Error(`Surcharge inconnue du moteur pour DIASPORA.GA : ${at}`)
    const original = base[key]
    if (record(original) && record(value)) result[key] = mergeNamespace(original, value, at)
    else {
      if (typeof original !== "string" || typeof value !== "string") throw new Error(`Surcharge invalide du moteur pour DIASPORA.GA : ${at}`)
      result[key] = value
    }
  }
  return result
}

/** Recompose chaque espace de noms surchargé du moteur : ses clés, avec les valeurs de DIASPORA.GA. */
export function composeEngineOverrides(
  engine: Readonly<Record<string, Namespace>>,
  overrides: Readonly<Record<string, Namespace>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(overrides).map(([namespace, values]) => {
    const base = engine[namespace]
    if (!base) throw new Error(`Espace de noms inconnu du moteur pour DIASPORA.GA : ${namespace}`)
    return [namespace, mergeNamespace(base, values, namespace)]
  }))
}

/** Les surcharges telles qu'écrites, par langue (lues par les tests). */
export const ENGINE_OVERRIDES = { fr: frOverrides, en: enOverrides } as const

/** Les espaces de noms du moteur recomposés avec les textes de DIASPORA.GA, par langue : composés une fois. */
export const DIASPORA_GA_ENGINE_RESOURCES = {
  fr: composeEngineOverrides(engineResources.fr, frOverrides),
  en: composeEngineOverrides(engineResources.en, enOverrides),
} as const
