"use client"

/**
 * Adaptateur moteur de la capacité « fonctionnalités du réseau » (ADR-0041 du moteur).
 *
 * Fonctions du moteur, `networks/features`, toutes bornées par le réseau `diaspora-ga` :
 *   · `open` : les clés ouvertes, pour tout membre (rien d'autre) ;
 *   · `settings` : l'état des huit, pour l'administration du réseau (refus indistinct sinon) ;
 *   · `setFeature` : la bascule motivée, inscrite au journal du moteur.
 * Hors session, hors réseau ou hors adhésion, rien n'est ouvert, sans appel inutile ; une
 * lecture refusée n'ouvre rien non plus.
 */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import { knownFeatures, type ActionErrorCode, type NetworkFeature, type NetworkFeaturesCapability, type NetworkFeatureState, type Loadable } from "@diaspora-ga/features/data"

import { engineActionErrorCode } from "./engine-errors"
import { type EngineSourceDeps, failed, LOADING, ready, Refusal, resolveDiasporaGaNetworkId, useEngineMember, useLoaded } from "./engine-kit"

const NONE_OPEN: Loadable<readonly NetworkFeature[]> = { status: "ready", data: [] }

/** Les refus d'une bascule, en codes FERMÉS ; le reste suit la table commune du moteur. */
export function networkFeaturesErrorCode(error: unknown): ActionErrorCode {
  if (error instanceof Refusal) return error.code
  const rule = engineErrorRule(error)?.rule
  if (rule === "DECISION_REASON_LENGTH") return "network_feature_reason_length"
  return engineActionErrorCode(error)
}

export function createEngineNetworkFeatures(deps: EngineSourceDeps): NetworkFeaturesCapability {
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

    useSettings() {
      const { auth, networkId } = useEngineMember()
      const id = networkId.state === "ready" ? networkId.value : null
      const settings = useLoaded(api.modules.networks.features.settings, auth.isAuthenticated && id !== null ? { networkId: id } : "skip")
      if (auth.isPending || networkId.state === "loading") return LOADING
      if (!auth.isAuthenticated) return failed("not_signed_in")
      if (networkId.state === "error") return failed(networkId.code)
      if (id === null) return failed("network_unavailable")
      if (settings.state === "loading") return LOADING
      if (settings.state === "error") return failed(settings.code)
      return ready(settings.value satisfies readonly NetworkFeatureState[])
    },

    async setFeature(input) {
      try {
        const networkId = await resolveDiasporaGaNetworkId(deps.convex)
        const { changed } = await deps.convex.mutation(api.modules.networks.features.setFeature, { networkId, feature: input.feature, enabled: input.enabled, reason: input.reason.trim() })
        return { ok: true, value: { changed } }
      } catch (error) {
        return { ok: false, code: networkFeaturesErrorCode(error) }
      }
    },
  }
}
