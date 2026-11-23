/**
 * Les fonctionnalités activables du réseau, en DÉMONSTRATION (ADR-0041 du moteur) :
 * données fictives, ce navigateur seulement. Comme au moteur, tout est fermé tant que
 * rien n'est décidé ; la démonstration ne fait que LIRE les modules ouverts du jeu
 * fictif (`DemoStore.setNetworkFeature` les pose, pour les recettes) : les décisions
 * se prennent dans l'application d'administration (fiche CH-815, D5). Une remise à
 * zéro referme tout.
 */
import { useMemo, useSyncExternalStore } from "react"

import {
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURES,
  type NetworkFeature,
  type NetworkFeaturesCapability,
} from "../data/network-features-port"
import type { Loadable } from "../data/types"
import type { DemoState } from "./state"
import type { DemoStore } from "./store"

const LOADING = { status: "loading" } as const

/** Les fonctionnalités ouvertes du jeu fictif : décision ouverte ET fonctionnalité exigée ouverte. */
export function demoOpenFeatures(state: Pick<DemoState, "networkFeatures">): NetworkFeature[] {
  const decided = state.networkFeatures ?? {}
  return NETWORK_FEATURES.filter((feature) => {
    const parent = NETWORK_FEATURE_PARENTS[feature]
    return decided[feature]?.enabled === true && (parent === null || decided[parent]?.enabled === true)
  })
}

export function createDemoNetworkFeatures(store: DemoStore): NetworkFeaturesCapability {
  const useVersion = () => useSyncExternalStore(store.subscribe, store.getVersion, () => -1)
  return {
    useOpen() {
      const version = useVersion()
      return useMemo((): Loadable<readonly NetworkFeature[]> => {
        if (version < 0) return LOADING
        return { status: "ready", data: demoOpenFeatures(store.getState()) }
      }, [version])
    },
  }
}
