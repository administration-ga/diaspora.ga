// Dupliqué de ANTSIA/apps/admin_antsia_ga/src/components/sign-in-screen.tsx @ c9006352 — adaptations : textes de l'espace `admin` d'admin.diaspora.ga et bouton de la charte DIASPORA.GA ; adresses de retour absolues de CETTE origine, comme diaspora.ga (apps/diaspora_ga/src/data/engine-idn.ts) ; section demandée relue contre le registre ; aucun lien vers l'accueil (gardé).
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
import { Component, Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/env"
import { anchors, routes, signOutWasIncomplete } from "@/lib/routes"
import { returnPathFrom } from "@/lib/sections"

import { SignOutEverywhereButton } from "./sign-out-button"

/** Le fournisseur IDN déclaré par le moteur (client central). */
export const IDN_PROVIDER_ID = "idn"

/** Au-delà, le départ vers IDN est abandonné : la personne reste sur l'entrée. */
const IDN_START_TIMEOUT_MS = 10_000

/** Une adresse de CETTE origine : le moteur y renvoie la personne après IDN. */
function here(path: string): string {
  return new URL(path, window.location.origin).href
}

/**
 * La seule porte (D3) : l'identité numérique, au niveau exigé pour une console
 * (`CONSOLE_MIN_LOA`). Ni code par courriel, ni code par SMS, ni compte léger. La
 * connexion seule n'ouvre aucun droit : la garde relit l'administration au serveur.
 */
export function IdnEntry(props: { configuration: IdentityConfiguration | null | undefined; returnPath: string }) {
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
                callbackURL: here(props.returnPath),
                errorCallbackURL: here(routes.signIn()),
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

function ConnectedEntry(props: { signOutIncomplete: boolean; returnPath: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const { isAuthenticated, isLoading } = useConvexAuth()
  // Ce que le déploiement sait servir, lu sans session (projection publique, sans secret ni compte).
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  if (isLoading) return <p role="status">{t("session.loading")}</p>
  // Une sortie incomplète avec une session encore vivante : la refaire d'abord.
  if (isAuthenticated && props.signOutIncomplete) return <SignOutEverywhereButton />
  return <IdnEntry configuration={configuration} returnPath={props.returnPath} />
}

/** `/entrer` : un seul bouton, l'identité numérique ; un refus d'IDN revient ici, dit en une phrase neutre. */
export function SignInScreen() {
  const { t } = useTranslation(APP_NAMESPACE)
  const { t: identityT } = useTranslation("identity")
  const [signOutIncomplete, setSignOutIncomplete] = useState(false)
  const [idnReturn, setIdnReturn] = useState<IdnReturnRefusal | null>(null)
  const [returnPath, setReturnPath] = useState<string>(routes.dashboard())
  useEffect(() => {
    const search = window.location.search
    setSignOutIncomplete(signOutWasIncomplete(search))
    // Un refus ou un abandon chez IDN, ramené ici par le moteur : dit une fois, en phrase connue, jamais celle du serveur.
    setIdnReturn(idnReturnRefusal(new URLSearchParams(search).get("error")))
    setReturnPath(returnPathFrom(search))
    const cleaned = withoutIdnReturnParams(window.location.href)
    if (cleaned !== null) window.history.replaceState(window.history.state, "", cleaned)
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
          <ConnectedEntry signOutIncomplete={signOutIncomplete} returnPath={returnPath} />
        </EntryBoundary>
      ) : (
        <p role="alert">{t("session.backendMissing")}</p>
      )}
    </main>
  )
}
