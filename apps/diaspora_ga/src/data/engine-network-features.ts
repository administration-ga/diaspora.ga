"use client"

/**
 * Adaptateur moteur de la capacité « fonctionnalités du réseau » (ADR-0041 du moteur).
 *
 * Fonction du moteur, `networks/features.open`, bornée par le réseau `diaspora-ga` : les clés
 * ouvertes, pour tout membre (rien d'autre). L'état des huit et la bascule motivée se lisent et
 * se posent dans l'application d'administration du réseau (fiche CH-815, D5, lots A5 et A6).
 * Hors session, hors réseau ou hors adhésion, rien n'est ouvert, sans appel inutile ; une
 * lecture refusée n'ouvre rien non plus.
 */
import { api } from "@convex/_generated/api"
import { knownFeatures, type NetworkFeature, type NetworkFeaturesCapability, type Loadable } from "@diaspora-ga/features/data"

import { type EngineSourceDeps, LOADING, ready, useEngineMember, useLoaded } from "./engine-kit"

const NONE_OPEN: Loadable<readonly NetworkFeature[]> = { status: "ready", data: [] }

export function createEngineNetworkFeatures(deps: EngineSourceDeps): NetworkFeaturesCapability {
  // Une lecture réactive seulement : aucune écriture depuis le site des membres.
  void deps
  return {
    useOpen() {
      const { auth, networkId, membership } = useEngineMember()
      const id = networkId.state === "ready" ? networkId.value : null
      const member = membership.state === "ready" && membership.value !== null
      const open = useLoaded(api.modules.networks.features.open, auth.isAuthenticated && id !== null && member ? { networkId: id } : "skip")
      if (auth.isPending) return LOADING
      if (!auth.isAuthenticated) return NONE_OPEN
      if (networkId.state === "loading") return LOADING
      if (id === null) return NONE_OPEN
      if (membership.state === "loading") return LOADING
      if (!member) return NONE_OPEN
      if (open.state === "loading") return LOADING
      if (open.state === "error") return NONE_OPEN
      return ready(knownFeatures(open.value))
    },
  }
}
