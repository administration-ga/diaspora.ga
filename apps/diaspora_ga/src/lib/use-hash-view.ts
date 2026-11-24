"use client"

import { useSyncExternalStore } from "react"

/**
 * La vue que dit l'ancre de l'adresse (« une page = une vue », décision du 24/11/2026, § 3) : une
 * page trop longue se découpe en sous-vues, choisies par l'ancre. Les liens qui y mènent sont des
 * `<a href="#…">` natifs : le retour du navigateur remonte d'une vue.
 *
 * Le serveur ne connaît pas l'ancre (instantané vide) : il rend la page entière, et la vue ne se
 * choisit qu'après l'hydratation. Une ancre posée par le routeur de Next sur la page déjà ouverte
 * (un `NextLink` vers `/parametres#parrainage` depuis `/parametres`) n'émet ni `hashchange` ni
 * `popstate` : `history.pushState` et `replaceState` sont donc enveloppés, une fois, pour prévenir
 * les abonnés (lot 2, plan du 24/11/2026, décision 6).
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

/** L'évènement que l'enveloppe de l'historique émet après chaque adresse poussée ou remplacée. */
const HISTORY_CHANGE_EVENT = "diaspora-ga:historychange"

/**
 * La marque de l'enveloppe, posée sur l'historique lui-même : un module rechargé (HMR) ou une
 * autre copie de ce module ne l'enveloppe pas deux fois, et tous écoutent le même évènement.
 */
const HISTORY_WRAPPED = Symbol.for("diaspora-ga.useHashView.history")

/**
 * Enveloppe `pushState` et `replaceState` : l'adresse et l'état passent tels quels, puis l'évènement
 * part EN DIFFÉRÉ (`setTimeout 0`). Next pousse l'adresse dans un `useInsertionEffect` ; un avis
 * synchrone y ferait mettre à jour un composant, et React lèverait une alerte.
 */
function wrapHistory(): void {
  const history = window.history
  if (Reflect.get(history, HISTORY_WRAPPED) === true) return
  Reflect.set(history, HISTORY_WRAPPED, true)
  const notify = () => {
    window.setTimeout(() => window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT)), 0)
  }
  const push = history.pushState
  const replace = history.replaceState
  history.pushState = function pushState(this: History, ...args: Parameters<History["pushState"]>) {
    push.apply(this, args)
    notify()
  }
  history.replaceState = function replaceState(this: History, ...args: Parameters<History["replaceState"]>) {
    replace.apply(this, args)
    notify()
  }
}

function subscribeToHash(onChange: () => void): () => void {
  wrapHistory()
  // `hashchange` pour un lien d'ancre ; `popstate` pour le retour et l'avance du navigateur ;
  // l'évènement de l'enveloppe pour une ancre posée par le routeur.
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  window.addEventListener(HISTORY_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
    window.removeEventListener(HISTORY_CHANGE_EVENT, onChange)
  }
}

const currentHash = (): string => window.location.hash
const serverHash = (): string => ""
