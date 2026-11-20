/**
 * Les fonctionnalités activables du réseau, en DÉMONSTRATION (ADR-0041 du moteur) :
 * données fictives, ce navigateur seulement. Comme au moteur, tout est fermé tant que
 * l'administration du réseau fictif n'a rien décidé ; la personne de la session tient ce
 * rôle (même règle que le guichet de modération fictif). Les décisions vivent dans le jeu
 * fictif : une remise à zéro referme tout. Mêmes règles que le moteur (motif, dépendance).
 */
import { useMemo, useSyncExternalStore } from "react"

import {
  NETWORK_FEATURE_PARENTS,
  NETWORK_FEATURES,
  type NetworkFeature,
  type NetworkFeaturesCapability,
  type NetworkFeatureState,
  networkFeatureToggleError,
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
    useSettings() {
      const version = useVersion()
      return useMemo((): Loadable<readonly NetworkFeatureState[]> => {
        if (version < 0) return LOADING
        const state = store.getState()
        if (state.session.personId === null) return { status: "error", code: "not_signed_in" }
        const open = demoOpenFeatures(state)
        return {
          status: "ready",
          data: NETWORK_FEATURES.map((feature) => {
            const decided = state.networkFeatures?.[feature]
            return { feature, enabled: decided?.enabled === true, open: open.includes(feature), requires: NETWORK_FEATURE_PARENTS[feature], updatedAt: decided?.updatedAt ?? null }
          }),
        }
      }, [version])
    },
    async setFeature(input) {
      const state = store.getState()
      const refusal = networkFeatureToggleError(input, demoOpenFeatures(state))
      // Comme au moteur : le motif est toujours jugé ; la dépendance, seulement s'il y a quelque chose à décider.
      const unchanged = (state.networkFeatures?.[input.feature]?.enabled === true) === input.enabled
      if (refusal === "network_feature_reason_length" || (refusal !== null && !unchanged)) return { ok: false, code: refusal }
      return await store.setNetworkFeature(input.feature, input.enabled)
    },
  }
}
