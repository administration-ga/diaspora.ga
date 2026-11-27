"use client"

import type { Id } from "@convex/_generated/dataModel"
import { createContext, useContext, type ReactNode } from "react"

/**
 * L'administrateur admis, tel que le moteur le dit (`modules/networks/adminAccess.myNetworkAdmin`,
 * contrat CH-815) : sa personne, son nom affiché, le réseau administré et l'état du journal
 * d'accès. Le nom affiché est celui du profil, déjà mis en forme à l'entrée du membre par le
 * normaliseur partagé (`@antsia/social-domain/civilName`) : un nom libre ne se redécoupe pas ici.
 */
export interface NetworkAdminView {
  readonly personId: Id<"persons">
  readonly displayName: string | null
  readonly networkId: Id<"networks">
  readonly networkSlug: string
  readonly networkName: string
  readonly accessLogged: boolean
}

export function networkDisplayName(name: string) {
  return name.toUpperCase() === "DIASPORA.GA" ? "DIASPORA" : name
}

const NetworkAdminContext = createContext<NetworkAdminView | null>(null)

/** Posé par la garde, après les deux réponses du serveur ; les sections le lisent. */
export function NetworkAdminProvider(props: { admin: NetworkAdminView; children: ReactNode }) {
  return <NetworkAdminContext.Provider value={props.admin}>{props.children}</NetworkAdminContext.Provider>
}

/** L'administrateur admis. Hors de la garde, c'est une erreur de câblage : aucune section ne s'y monte. */
export function useNetworkAdmin(): NetworkAdminView {
  const admin = useContext(NetworkAdminContext)
  if (admin === null) throw new Error("useNetworkAdmin hors de la garde d'administration")
  return admin
}
