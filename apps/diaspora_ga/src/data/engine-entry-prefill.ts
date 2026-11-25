"use client"

/**
 * Adaptateur moteur du pré-remplissage de l'accueil en un écran (décision du 25/11/2026, lot A4).
 *
 * La fonction du moteur, `modules/people/idnPrefill:myEntryPrefill` (lot M1), n'est pas encore sur
 * la branche principale du moteur : son entrée n'existe pas dans l'API générée. Elle est donc
 * nommée en toutes lettres (`makeFunctionReference`, comme `useLoaded` le fait déjà pour chaque
 * lecture) et sa réponse est lue comme INCONNUE, puis vérifiée champ par champ : ce fichier se
 * type contre le moteur d'aujourd'hui (`f152b07e`) comme contre celui qui portera M1.
 *
 * Contrat du lot M1 : sans argument, pour la seule personne de la session ;
 * `null | { displayName: string | null, handles: { handle, available }[] (six au plus),
 * residence: { country, city } | null }` — la résidence reste `null` jusqu'au lot M2.
 *
 * Un moteur sans la fonction répond par une erreur de lecture (« Could not find public
 * function ») : elle se lit comme « rien à proposer », et l'écran reste à la saisie ordinaire.
 * Le client Convex ne journalise pas l'échec d'une lecture abonnée (seules les lignes de journal
 * de la fonction le seraient, et une fonction absente n'en a pas) : aucun bruit en console. Tout
 * autre refus ou panne retombe de même sur la saisie — le pré-remplissage n'est qu'une aide.
 */
import { useStableConvexAuth } from "@antsia/api/hooks"
import type { EntryPrefillCapability, EntryPrefillHandle, EntryPrefillView, Loadable } from "@diaspora-ga/features/data"
import { makeFunctionReference } from "convex/server"
import { useMemo } from "react"

import { type EngineSourceDeps, LOADING, ready, useLoaded } from "./engine-kit"

/** La lecture du lot M1, par son nom : aucune entrée de l'API générée n'est exigée. */
export const MY_ENTRY_PREFILL = makeFunctionReference<"query", Record<string, never>, unknown>("modules/people/idnPrefill:myEntryPrefill")

/** Le plafond du contrat : six propositions au plus. */
const MAX_HANDLES = 6
const ISO_COUNTRY = /^[A-Z]{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readHandles(value: unknown): EntryPrefillHandle[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { handle: string; available: boolean } => isRecord(item) && typeof item.handle === "string" && typeof item.available === "boolean")
    .map((item) => ({ handle: item.handle, available: item.available }))
    .slice(0, MAX_HANDLES)
}

/** Pays ISO 3166-1 alpha-2 et ville, rien d'autre : une rue ou un code postal ne seraient pas lus. */
function readResidence(value: unknown): EntryPrefillView["residence"] {
  if (!isRecord(value) || typeof value.country !== "string" || !ISO_COUNTRY.test(value.country)) return null
  const city = typeof value.city === "string" && value.city.trim() !== "" ? value.city.trim() : null
  return { country: value.country, city }
}

/**
 * La réponse du moteur, vérifiée champ par champ (un moteur plus récent ou plus ancien ne casse
 * pas l'écran). Rien d'utilisable : `null`.
 */
export function toEntryPrefillView(value: unknown): EntryPrefillView | null {
  if (!isRecord(value)) return null
  const displayName = typeof value.displayName === "string" && value.displayName.trim() !== "" ? value.displayName.trim() : null
  const handles = readHandles(value.handles)
  const residence = readResidence(value.residence)
  if (displayName === null && handles.length === 0 && residence === null) return null
  return { displayName, handles, residence }
}

export function createEngineEntryPrefill(deps: EngineSourceDeps): EntryPrefillCapability {
  // Une lecture réactive seulement : rien n'est écrit au retour d'IDN ni à la lecture.
  void deps
  return {
    useEntryPrefill(): Loadable<EntryPrefillView | null> {
      const auth = useStableConvexAuth()
      const loaded = useLoaded(MY_ENTRY_PREFILL, auth.isAuthenticated ? {} : "skip")
      const state = loaded.state
      const value = loaded.state === "ready" ? loaded.value : undefined
      return useMemo((): Loadable<EntryPrefillView | null> => {
        if (auth.isUnauthenticated) return ready(null)
        if (!auth.isAuthenticated || state === "loading") return LOADING
        // Fonction absente (moteur d'avant M1), refus ou panne : la saisie ordinaire, sans erreur.
        if (state === "error") return ready(null)
        return ready(toEntryPrefillView(value))
      }, [auth.isAuthenticated, auth.isUnauthenticated, state, value])
    },
  }
}
