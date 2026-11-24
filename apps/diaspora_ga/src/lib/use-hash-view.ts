"use client"

import { useSyncExternalStore } from "react"

/**
 * La vue que dit l'ancre de l'adresse (« une page = une vue », décision du 24/11/2026, § 3) : une
 * page trop longue se découpe en sous-vues, choisies par l'ancre. Les liens qui y mènent sont des
 * `<a href="#…">` natifs : le retour du navigateur remonte d'une vue.
 *
 * Le serveur ne connaît pas l'ancre (instantané vide) : il rend la page entière, et la vue ne se
 * choisit qu'après l'hydratation. Limite connue : une ancre posée par `router.push` sur la page
 * déjà ouverte n'émet aucun évènement, elle n'est pas vue ici.
 */
export function useHashView<Id extends string>(ids: readonly Id[]): Id | null {
  return viewOfHash(useSyncExternalStore(subscribeToHash, currentHash, serverHash), ids)
}

/** L'identifiant que porte l'ancre, s'il est l'un de ceux attendus (règle pure). */
export function viewOfHash<Id extends string>(hash: string, ids: readonly Id[]): Id | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    // Une ancre mal encodée se lit telle quelle : elle ne désigne alors aucune vue.
  }
  return ids.find((candidate) => candidate === id) ?? null
}

function subscribeToHash(onChange: () => void): () => void {
  // `hashchange` pour un lien d'ancre ; `popstate` pour le retour et l'avance du navigateur.
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
  }
}

const currentHash = (): string => window.location.hash
const serverHash = (): string => ""
