"use client"

import { signOutEverywhere } from "@antsia/api/sign-out-everywhere"

import { authClient } from "./auth-client"
import { routes } from "./routes"

/**
 * « Se déconnecter partout » — la seule porte de sortie de l'application (cliquet
 * `sign-out-everywhere` du moteur) : toutes les sessions révoquées, l'état personnel
 * du moteur purgé, puis une navigation complète vers l'entrée, qui termine aussi les
 * caches et les magasins de cet onglet. Une révocation ou un nettoyage non confirmés
 * se disent à l'entrée (`?deconnexion=incomplete`).
 */
export async function signOutAndRedirect() {
  return signOutEverywhere(authClient, {
    navigate: (result) => window.location.assign(routes.signedOut(!result.serverRevoked || !result.localCleared)),
  })
}
