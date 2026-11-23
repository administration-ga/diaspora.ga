"use client"

/**
 * DS-14 (ouverture) — l'adaptateur moteur de la porte d'une notification poussée
 * (`notification-opening-port.ts`) : `notifications/open:resolveOpenTarget`, qui RELIT tout à
 * l'instant pour la personne de la session — destinataire, sujet et garde actuelle, sonnerie d'un
 * appel — et ne marque rien comme lu.
 *
 *  · Un jeton d'ouverture par lecture (`openingToken`) : chaque ouverture, et chaque reprise après
 *    une panne, est une lecture neuve du réseau, jamais une réponse gardée. Il ne donne aucun droit.
 *  · Un refus d'accès (hors session, hors adhésion, suspension, réseau) se lit comme une référence
 *    inconnue : la même réponse `null`, donc le même repli neutre. Seule une panne se reprend.
 */
import { api } from "@convex/_generated/api"
import type { ActionErrorCode, Loadable, NotificationOpeningCapability, NotificationOpeningQuery, NotificationOpeningView } from "@diaspora-ga/features/data"
import { useCallback, useMemo, useState } from "react"

import { LOADING, PAGE_ACCESS_ERRORS, failed, memberReadError, ready, useEngineMember, useLoaded, type EngineSourceDeps } from "./engine-kit"
import { toNotificationOpeningView } from "./engine-views"

/** Un jeton neuf : la charte du moteur (lettres, chiffres, tiret, soulignement ; 64 au plus). */
function newOpeningToken(): string {
  return crypto.randomUUID()
}

/** Un refus d'accès se confond avec une référence inconnue ; une panne reste une panne. */
function openingFailure(code: ActionErrorCode): Loadable<NotificationOpeningView | null> {
  return PAGE_ACCESS_ERRORS.has(code) ? ready(null) : failed(code)
}

export function createEngineNotificationOpening(deps: EngineSourceDeps): NotificationOpeningCapability {
  // Une lecture réactive seulement : aucune écriture, rien n'est marqué lu.
  void deps
  return {
    useOpening(reference: string): NotificationOpeningQuery {
      const member = useEngineMember()
      const [openingToken, setOpeningToken] = useState(newOpeningToken)
      const refusal = memberReadError(member)
      const networkId = member.networkId.state === "ready" ? member.networkId.value : null
      const canRead = refusal === null && member.auth.isAuthenticated && networkId !== null && member.membership.state === "ready" && member.membership.value !== null
      const loaded = useLoaded(api.modules.notifications.open.resolveOpenTarget, canRead && networkId ? { networkId, reference, openingToken } : "skip")
      const value = loaded.state === "ready" ? loaded.value : undefined
      const code = loaded.state === "error" ? loaded.code : null
      const retry = useCallback(() => setOpeningToken(newOpeningToken()), [])
      const state = useMemo((): Loadable<NotificationOpeningView | null> => {
        if (refusal !== null) return openingFailure(refusal)
        if (code !== null) return openingFailure(code)
        return value === undefined ? LOADING : ready(toNotificationOpeningView(value))
      }, [refusal, code, value])
      return useMemo(() => ({ state, retry }), [state, retry])
    },
  }
}
