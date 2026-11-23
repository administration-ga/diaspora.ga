"use client"

import { useStableConvexAuth } from "@antsia/api/hooks"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { DIASPORA_GA_NETWORK_SLUG } from "@diaspora-ga/domain"
import { useMutation, useQuery } from "convex/react"
import { usePathname, useRouter } from "next/navigation"
import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from "react"

import { publicEnv } from "@/lib/env"
import { rememberRequestedSection } from "@/lib/requested-section"
import { routes } from "@/lib/routes"
import { sectionHrefOf } from "@/lib/sections"

import { AdminShell } from "./admin-shell"
import { AdmissionScreen } from "./admission-screen"
import { NetworkAdminProvider, type NetworkAdminView } from "./network-admin-context"

/**
 * La garde d'admin.diaspora.ga (fiche CH-815 § 4.1 et § 5, « deux gardes, toujours ») :
 * RIEN de l'application ne se monte — ni la coque, ni une section, ni une de leurs
 * lectures — avant deux réponses du serveur :
 *  1. « suis-je administrateur de ce réseau en session prouvée ? »
 *     (`modules/networks/adminAccess.myNetworkAdmin`) ;
 *  2. l'inscription de cet accès au journal (`recordAccess`, une fois, quand
 *     `accessLogged` est faux ; la lecture réactive se relit d'elle-même ensuite).
 * Chaque fonction du moteur rejoue sa garde : cet écran ne donne aucun droit.
 */

/** Un refus du serveur (code fermé du moteur), hors limitation de débit : l'écran indistinct. Le reste est un échec, qui se réessaie. */
export function isAdmissionRefusal(error: unknown): boolean {
  const code = engineErrorCode(error)
  return code !== null && code !== "rateLimited"
}

type BoundaryProps = { children: ReactNode; fallback: (error: unknown, retry: () => void) => ReactNode }
type BoundaryState = { caught: boolean; error: unknown; attempt: number }

/** Une lecture qui échoue (refus ou panne) remplace tout l'arbre gardé ; « Réessayer » le remonte. */
class AdmissionBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { caught: false, error: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { caught: true, error }
  }

  override render() {
    if (this.state.caught) {
      return this.props.fallback(this.state.error, () => this.setState((state) => ({ caught: false, error: null, attempt: state.attempt + 1 })))
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

function admissionFailure(error: unknown, retry: () => void): ReactNode {
  return isAdmissionRefusal(error) ? <AdmissionScreen kind="refused" connected /> : <AdmissionScreen kind="failed" connected retry={retry} />
}

/**
 * Aucune session : l'entrée nue. La section demandée est retenue dans l'onglet, jamais
 * dans l'adresse (revue A1, F2) ; l'entrée la relit contre le registre après la connexion.
 */
function SignedOutRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    rememberRequestedSection(sectionHrefOf(pathname))
    router.replace(routes.signIn())
  }, [router, pathname])
  return <AdmissionScreen kind="signedOut" signInHref={routes.signIn()} />
}

/**
 * L'accès inscrit au journal, UNE fois par admission : la promesse est gardée (le double
 * montage de StrictMode ne double pas l'écriture) ; un échec se réessaie à la demande.
 */
function AccessRecording(props: { networkId: Id<"networks"> }) {
  const record = useMutation(api.modules.networks.adminAccess.recordAccess)
  const pending = useRef<Promise<unknown> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  useEffect(() => {
    let active = true
    pending.current ??= record({ networkId: props.networkId })
    pending.current.then(
      () => undefined,
      (error: unknown) => {
        if (active) setFailure({ error })
      },
    )
    return () => {
      active = false
    }
  }, [record, props.networkId, attempt])
  if (failure === null) return <AdmissionScreen kind="recording" connected />
  if (isAdmissionRefusal(failure.error)) return <AdmissionScreen kind="refused" connected />
  return (
    <AdmissionScreen
      kind="failed"
      connected
      retry={() => {
        pending.current = null
        setFailure(null)
        setAttempt((value) => value + 1)
      }}
    />
  )
}

/** La réponse du serveur, puis le journal, puis seulement la coque et la section. */
function NetworkAdminAdmission(props: { networkId: Id<"networks">; children: ReactNode }) {
  const admin: NetworkAdminView | undefined = useQuery(api.modules.networks.adminAccess.myNetworkAdmin, { networkId: props.networkId })
  if (admin === undefined) return <AdmissionScreen kind="loading" connected />
  if (!admin.accessLogged) return <AccessRecording key={`${admin.personId}:${admin.networkId}`} networkId={admin.networkId} />
  return (
    <NetworkAdminProvider admin={admin}>
      <AdminShell admin={admin}>{props.children}</AdminShell>
    </NetworkAdminProvider>
  )
}

/** Le réseau administré, lu par sa projection publique ; absent ou fermé, le refus est le même. */
function NetworkResolution(props: { children: ReactNode }) {
  const network = useQuery(api.modules.networks.networks.getBySlug, { slug: DIASPORA_GA_NETWORK_SLUG })
  if (network === undefined) return <AdmissionScreen kind="loading" connected />
  if (network === null) return <AdmissionScreen kind="refused" connected />
  return <NetworkAdminAdmission networkId={network._id}>{props.children}</NetworkAdminAdmission>
}

function ConnectedGate(props: { children: ReactNode }) {
  const auth = useStableConvexAuth()
  if (auth.isPending) return <AdmissionScreen kind="loading" />
  if (!auth.isAuthenticated) return <SignedOutRedirect />
  return (
    <AdmissionBoundary fallback={admissionFailure}>
      <NetworkResolution>{props.children}</NetworkResolution>
    </AdmissionBoundary>
  )
}

export function AdminGate(props: { children: ReactNode }) {
  if (!publicEnv.convexUrl) return <AdmissionScreen kind="backendMissing" />
  return <ConnectedGate>{props.children}</ConnectedGate>
}
