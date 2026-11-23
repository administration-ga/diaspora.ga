// Dupliqué de ANTSIA/apps/admin_antsia_ga/src/components/sign-in-screen.tsx @ c9006352 — adaptations : textes de l'espace `admin` d'admin.diaspora.ga et bouton de la charte DIASPORA.GA ; les trois adresses de retour d'IDN sont `/entrer` nu de CETTE origine (revue A1, F2) ; une session ouverte reprend la section retenue dans l'onglet, relue contre le registre ; aucun lien vers l'accueil (gardé).
"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import {
  identityErrorKey,
  idnReturnMessageKey,
  idnReturnRefusal,
  type IdentityConfiguration,
  type IdnReturnRefusal,
  withoutIdnReturnParams,
} from "@antsia/social-features/identity"
import { api } from "@convex/_generated/api"
import { Button } from "@diaspora-ga/features"
import { useConvexAuth, useQuery } from "convex/react"
import { ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { Component, Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/env"
import { takeRequestedSection } from "@/lib/requested-section"
import { anchors, routes, signOutWasIncomplete } from "@/lib/routes"

import { SignOutEverywhereButton } from "./sign-out-button"

/** Le fournisseur IDN déclaré par le moteur (client central). */
export const IDN_PROVIDER_ID = "idn"

/** Au-delà, le départ vers IDN est abandonné : la personne reste sur l'entrée. */
const IDN_START_TIMEOUT_MS = 10_000

/**
 * Les trois adresses de retour d'IDN (succès, compte neuf, échec) : `/entrer` de CETTE
 * origine, absolue (le moteur en lit l'application qui reçoit la session), SANS requête
 * ni fragment (revue A1, F2 — le moteur y ajoute le jeton à usage unique de la session ;
 * aucune continuation ne voyage avec lui). L'entrée reprend ensuite la section retenue.
 */
export function idnReturnURLs(origin: string): { callbackURL: string; newUserCallbackURL: string; errorCallbackURL: string } {
  const entry = new URL(routes.signIn(), origin)
  const href = `${entry.origin}${entry.pathname}`
  return { callbackURL: href, newUserCallbackURL: href, errorCallbackURL: href }
}

/**
 * La seule porte (D3) : l'identité numérique, au niveau exigé pour une console
 * (`CONSOLE_MIN_LOA`). Ni code par courriel, ni code par SMS, ni compte léger. La
 * connexion seule n'ouvre aucun droit : la garde relit l'administration au serveur.
 */
export function IdnEntry(props: { configuration: IdentityConfiguration | null | undefined }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: identityT } = useTranslation("identity")
  const helpId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  const available = props.configuration?.idn === true
  const help = props.configuration === undefined ? t("signIn.loading") : available ? t("signIn.help") : t("signIn.unavailable")
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground">
      <p id={helpId} role={props.configuration === undefined ? "status" : undefined} className="text-sm text-muted-foreground">
        {help}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {identityT(error)}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="h-auto min-h-12 whitespace-normal py-3"
        disabled={pending || !available}
        aria-busy={pending || undefined}
        aria-describedby={helpId}
        onClick={async () => {
          if (lock.current || !available || isSigningOutEverywhere()) return
          lock.current = true
          setPending(true)
          setError(null)
          const request = new AbortController()
          controller.current = request
          let timeout: ReturnType<typeof setTimeout> | undefined
          try {
            const response = await Promise.race([
              authClient.signIn.oauth2({
                providerId: IDN_PROVIDER_ID,
                ...idnReturnURLs(window.location.origin),
                fetchOptions: { throw: false, signal: request.signal },
              }),
              new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => {
                  request.abort()
                  reject(new Error("Authentication request timed out"))
                }, IDN_START_TIMEOUT_MS)
              }),
            ])
            if (!mounted.current) return
            if (response.error) setError(identityErrorKey(response.error))
            else if (!response.data || typeof response.data.url !== "string" || response.data.redirect !== true) setError("errors.generic")
          } catch (failure: unknown) {
            if (mounted.current) setError(identityErrorKey(failure))
          } finally {
            if (timeout !== undefined) clearTimeout(timeout)
            lock.current = false
            if (mounted.current) setPending(false)
          }
        }}
      >
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
        {pending ? t("signIn.connecting") : t("signIn.idn")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("signIn.minimum", { level: CONSOLE_MIN_LOA })}</p>
    </section>
  )
}

type BoundaryProps = { children: ReactNode; fallback: (retry: () => void) => ReactNode }
type BoundaryState = { caught: boolean; attempt: number }

/** La configuration publique illisible : l'entrée le dit et se réessaie, sans rien ouvrir. */
class EntryBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { caught: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { caught: true }
  }

  override render() {
    if (this.state.caught) return this.props.fallback(() => this.setState((state) => ({ caught: false, attempt: state.attempt + 1 })))
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

/**
 * Une session ouverte passe l'entrée : la section retenue avant la connexion (relue
 * contre le registre, effacée), sinon le tableau de bord. Ce composant ne se monte
 * qu'une fois l'amorçage de la session terminé (`StableConvexBetterAuthProvider`) :
 * le jeton à usage unique du retour d'IDN est alors déjà échangé et retiré de
 * l'adresse ; cette navigation est la première.
 */
function Continuation() {
  const { t } = useTranslation(APP_NAMESPACE)
  const router = useRouter()
  const target = useRef<string | null>(null)
  useEffect(() => {
    // Lue une seule fois : le double effet de StrictMode ne perd pas la section.
    target.current ??= takeRequestedSection()
    router.replace(target.current)
  }, [router])
  return <p role="status">{t("session.loading")}</p>
}

function ConnectedEntry(props: { signOutIncomplete: boolean }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { isAuthenticated, isLoading } = useConvexAuth()
  // Ce que le déploiement sait servir, lu sans session (projection publique, sans secret ni compte).
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  if (isLoading) return <p role="status">{t("session.loading")}</p>
  // Une sortie incomplète avec une session encore vivante : la refaire d'abord.
  if (isAuthenticated && props.signOutIncomplete) return <SignOutEverywhereButton />
  if (isAuthenticated) return <Continuation />
  return <IdnEntry configuration={configuration} />
}

/** `/entrer` : un seul bouton, l'identité numérique ; un refus d'IDN revient ici, dit en une phrase neutre. */
export function SignInScreen() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: identityT } = useTranslation("identity")
  const [signOutIncomplete, setSignOutIncomplete] = useState(false)
  const [idnReturn, setIdnReturn] = useState<IdnReturnRefusal | null>(null)
  // L'adresse lue d'abord : l'effet d'un enfant passe avant celui-ci, et une session ouverte
  // ne doit pas quitter l'entrée avant qu'une sortie incomplète n'y ait été lue.
  const [addressRead, setAddressRead] = useState(false)
  useEffect(() => {
    const search = window.location.search
    setSignOutIncomplete(signOutWasIncomplete(search))
    // Un refus ou un abandon chez IDN, ramené ici par le moteur : dit une fois, en phrase connue, jamais celle du serveur.
    setIdnReturn(idnReturnRefusal(new URLSearchParams(search).get("error")))
    const cleaned = withoutIdnReturnParams(window.location.href)
    if (cleaned !== null) window.history.replaceState(window.history.state, "", cleaned)
    setAddressRead(true)
  }, [])
  return (
    <main id={anchors.contentId} className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("brand.eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold">{t("signIn.title")}</h1>
        <p className="text-muted-foreground">{t("signIn.lead")}</p>
      </header>
      {signOutIncomplete ? (
        <p role="alert" className="rounded-xl bg-muted p-4 text-sm">
          {identityT("signOutIncomplete")}
        </p>
      ) : null}
      {idnReturn ? (
        <p role="alert" className="rounded-xl bg-muted p-4 text-sm">
          {identityT(idnReturnMessageKey(idnReturn))}
        </p>
      ) : null}
      {publicEnv.convexUrl ? (
        <EntryBoundary
          fallback={(retry) => (
            <section className="flex flex-col gap-3">
              <p role="alert">{t("signIn.configurationFailed")}</p>
              <Button type="button" className="self-start" onClick={retry}>
                {t("session.retry")}
              </Button>
            </section>
          )}
        >
          {addressRead ? <ConnectedEntry signOutIncomplete={signOutIncomplete} /> : <p role="status">{t("session.loading")}</p>}
        </EntryBoundary>
      ) : (
        <p role="alert">{t("session.backendMissing")}</p>
      )}
    </main>
  )
}
