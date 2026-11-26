"use client"

import { useEffect, useRef, useState } from "react"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { rememberArrival } from "@/lib/arrival"
import { authClient } from "@/lib/auth-client"
import { configuredConsulateGateway } from "@/lib/consulate-gateway"
import { passMode, startPass, takePass } from "@/lib/consulate-pass"
import { routes } from "@/lib/routes"

export function ConsulatePassage({ returning = false }: { returning?: boolean }) {
  const { t } = useDiasporaGaT()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(routes.consulatePass)
  const [resume, setResume] = useState("")
  useEffect(() => {
    if (started.current) return
    started.current = true
    async function proceed() {
      if (returning) {
        const fragment = location.hash
        history.replaceState(null, "", location.pathname)
        const stores = [window.sessionStorage]
        try { stores.push(window.localStorage) } catch { /* Optional across browser tabs. */ }
        const body = takePass(fragment, stores)
        const result = await authClient.$fetch("/sign-in/consulate-pass", { method: "POST", body })
        if (result.error || !result.data) throw new Error()
        rememberArrival("consulat")
        location.replace(routes.welcome())
      } else {
        const links = configuredConsulateGateway()
        if (!links) throw new Error()
        const mode = passMode(new URLSearchParams(location.search).get("mode"))
        setRetry(location.pathname + location.search)
        const dest = await startPass(links.mySpace, mode, mode !== "web" ? window.localStorage : window.sessionStorage)
        setResume(dest)
        location.replace(dest)
      }
    }
    void proceed().catch(() => setFailed(true))
  }, [returning])

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
    <p className="text-sm font-semibold"><span className="uppercase">{t("consulateGateway.entry.label")}</span> → {t("brand.name")}</p>
    <h1 className="text-2xl font-semibold">{failed ? t("consulateGateway.passage.failed") : t("consulateGateway.passage.opening")}</h1>
    {failed ? <><p>{t("consulateGateway.passage.retryInfo")}</p>
      <a className="underline" href={retry}>{t("consulateGateway.passage.retry")}</a><a className="underline" href={routes.enter()}>{t("consulateGateway.passage.home")}</a></>
      : resume ? <a className="underline" href={resume}>{t("consulateGateway.passage.continueConsulate")}</a> : <p role="status">{t("consulateGateway.passage.checking")}</p>}
  </main>
}
