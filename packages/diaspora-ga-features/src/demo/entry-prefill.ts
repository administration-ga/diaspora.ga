/**
 * Démonstration du pré-remplissage de l'accueil en un écran (décision du 25/11/2026, lot A4).
 *
 * Le moteur (lot M1) tirera du retour d'IDN un nom civil composé côté serveur et une échelle
 * d'identifiants ; la démonstration fait de même avec l'identité IDN SIMULÉE de `/entrer/idn`
 * (identités fictives, `DEMO_IDN_IDENTITIES`) :
 *  · le nom : « NOM Prénoms », tel que le normaliseur partagé l'a déjà rangé à la connexion ;
 *  · les identifiants, six au plus : le premier prénom, puis `nom.prénom` (la forme de
 *    l'identifiant IDN), puis les autres prénoms, puis `prénom.nom` ; chacun passé par la règle
 *    des identifiants et dit libre ou pris pour la personne de la session ;
 *  · aucune résidence : IDN ne la connaît pas avant le lot M2 du moteur.
 *
 * Rien n'est écrit : la lecture ne crée ni profil ni identifiant. Un compte entré par code, un
 * profil déjà né (le moteur efface alors le pré-remplissage) ou une session fermée : `null`.
 */
import { useMemo, useSyncExternalStore } from "react"

import type { EntryPrefillCapability } from "../data/port"
import type { EntryPrefillHandle, EntryPrefillView, Loadable } from "../data/types"
import { handleRefusal, handleToken } from "../lib/handle"
import type { DemoState } from "./state"
import type { DemoStore } from "./store"

/** Le plafond du contrat du moteur : six propositions au plus. */
const MAX_HANDLES = 6

const LOADING = { status: "loading" } as const

/** Les identifiants proposés, dans l'ordre de préférence, sans doublon ni forme hors charte. */
function idnHandleCandidates(firstName: string, lastName: string): string[] {
  const firstNames = firstName.split(/\s+/).map(handleToken).filter(Boolean)
  const last = handleToken(lastName)
  const [first, ...others] = firstNames
  const candidates = [
    first ?? "",
    first && last ? `${last}.${first}` : "",
    ...others,
    first && last ? `${first}.${last}` : "",
  ]
  return [...new Set(candidates)].filter((candidate) => candidate !== "" && handleRefusal(candidate) === null).slice(0, MAX_HANDLES)
}

/** Le pré-remplissage de la personne de la session, ou `null` s'il n'y a rien à proposer. */
export function demoEntryPrefill(state: DemoState): EntryPrefillView | null {
  const personId = state.session.personId
  const person = personId ? state.persons[personId] : undefined
  if (!person?.idn || person.profile !== null) return null
  const { firstName, lastName } = person.idn
  const taken = new Set(
    Object.values(state.persons)
      .filter((candidate) => candidate.id !== person.id)
      .map((candidate) => candidate.profile?.handle),
  )
  const handles: EntryPrefillHandle[] = idnHandleCandidates(firstName, lastName).map((handle) => ({ handle, available: !taken.has(handle) }))
  const displayName = [lastName, firstName].filter((part) => part.trim() !== "").join(" ")
  return { displayName: displayName === "" ? null : displayName, handles, residence: null }
}

export function createDemoEntryPrefill(store: DemoStore): EntryPrefillCapability {
  return {
    useEntryPrefill(): Loadable<EntryPrefillView | null> {
      const version = useSyncExternalStore(store.subscribe, store.getVersion, () => -1)
      return useMemo(() => (version < 0 ? LOADING : { status: "ready", data: demoEntryPrefill(store.getState()) }), [version])
    },
  }
}
