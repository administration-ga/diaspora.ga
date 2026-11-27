"use client"

import { useEffect, useRef, useState } from "react"
import { BrandLogo } from "@diaspora-ga/features/brand/logo"
import { useSession } from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { rememberArrival } from "@/lib/arrival"
import { authClient } from "@/lib/auth-client"
import { keepConsent, passResult } from "@/lib/consulate-consent"
import { configuredConsulateGateway } from "@/lib/consulate-gateway"
import { passMode, startPass, takePass } from "@/lib/consulate-pass"
import { explicitSignOutHappened } from "@/lib/explicit-sign-out"
import { routes } from "@/lib/routes"
import { ConsulateTransition } from "./consulate-transition"

async function goToIdn(callback: string, ticket?: { loginHint?: string }) {
  // Le parcours ordinaire, sans intention SSO, impose prompt=login chez IDN.
  const additionalData = ticket && {
    antsiaEntry: "consulate", ...(ticket.loginHint ? { loginHint: ticket.loginHint } : {}),
    ...(explicitSignOutHappened() ? { requireLogin: true } : {}),
  }
  const result = await authClient.signIn.oauth2({
    providerId: "idn", callbackURL: new URL(callback, location.origin).href,
    errorCallbackURL: new URL(routes.consulatePass() + "?echec=idn", location.origin).href,
    ...(additionalData ? { additionalData } : {}),
  })
  if (result.error || !result.data?.url) throw new Error("IDN")
}

export function ConsulatePassage({ returning = false, legacy = false }: { returning?: boolean; legacy?: boolean }) {
  const { t } = useDiasporaGaT()
  const session = useSession()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(routes.enterFromConsulate)

  useEffect(() => {
    if (started.current) return
    const query = new URLSearchParams(location.search)
    const afterIdn = query.get("apres") === "idn"
    const resume = !returning && !afterIdn && !query.has("echec") && query.get("ouvrir") === "1"
    if ((resume || (!returning && !legacy && afterIdn)) && session.status === "loading") return
    if (resume && session.status === "ready" && session.data.status === "signed_in") {
      started.current = true
      location.replace(routes.feed())
      return
    }
    started.current = true
    async function proceed() {
      if (query.has("echec")) throw new Error("IDN")
      if (returning) {
        const fragment = location.hash
        history.replaceState(null, "", location.pathname)
        const stores = [window.sessionStorage]
        try { stores.push(window.localStorage) } catch { /* Le stockage durable est facultatif. */ }
        const { code, verifier, mode, afterIdn: confirmed } = takePass(fragment, stores)
        setRetry(routes.consulatePass() + "?mode=" + mode)
        const result = await authClient.$fetch("/sign-in/consulate-pass", {
          method: "POST", body: { code, verifier, version: 2, ...(confirmed ? { afterIdn: true } : {}) },
        })
        if (result.error) throw new Error("Passage")
        const grant = passResult.parse(result.data)
        if (grant.next === "idn") {
          if (confirmed) throw new Error("Identité différente")
          await goToIdn(routes.consulatePass() + "?apres=idn&mode=" + mode, grant)
          return
        }
        rememberArrival("consulat")
        if (grant.next === "consent") {
          keepConsent(grant, window.sessionStorage)
          location.replace(routes.consulateConsent())
        } else {
          location.replace(routes.feed())
        }
        return
      }

      if (legacy) {
        // La V1 n'identifie pas le ressortissant. La session locale peut appartenir à un autre membre.
        await goToIdn(routes.consulateConsent() + "?origine=idn")
        return
      }
      if (afterIdn && (session.status !== "ready" || session.data.status !== "signed_in")) throw new Error("Session IDN")
      const links = configuredConsulateGateway()
      if (!links) throw new Error("Configuration")
      const mode = passMode(query.get("mode"))
      setRetry(routes.consulatePass() + "?mode=" + mode)
      const dest = await startPass(links.mySpace, mode, mode === "web" ? window.sessionStorage : window.localStorage, afterIdn)
      location.replace(dest)
    }
    void proceed().catch(() => setFailed(true))
  }, [legacy, returning, session])

  if (!failed) return <ConsulateTransition mobileHandoff={!legacy && !returning} />
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="uppercase">{t("consulateGateway.entry.label")}</span> → <BrandLogo /></p>
    <h1 className="text-2xl font-semibold">{t("consulateGateway.passage.failed")}</h1>
    <p role="alert">{t("consulateGateway.passage.retryInfo")}</p>
    <a className="underline" href={retry}>{t("consulateGateway.passage.retry")}</a>
    {!legacy && <a className="underline" href={routes.consulatePass() + "?secours=idn"}>{t("consulateGateway.arrival.continueIdn")}</a>}
    <a className="underline" href={routes.enter()}>{t("consulateGateway.passage.home")}</a>
  </main>
}
