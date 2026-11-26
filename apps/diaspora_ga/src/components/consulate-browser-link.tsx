"use client"

import { useEffect, useState } from "react"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { configuredConsulateGateway } from "@/lib/consulate-gateway"
import { startPass } from "@/lib/consulate-pass"
import { routes } from "@/lib/routes"

/** A direct, user-activated HTTPS link lets the OS open the signed Consulat app. */
export function ConsulateBrowserLink() {
  const { t } = useDiasporaGaT()
  const [dest, setDest] = useState("")
  useEffect(() => {
    const links = configuredConsulateGateway()
    if (!links) return
    let live = true
    let timer: number
    async function prepare() {
      try {
        const url = await startPass(links!.mySpace, "companion", window.localStorage)
        if (!live) return
        setDest(url)
        timer = window.setTimeout(prepare, 150000)
      } catch { if (live) setDest("") }
    }
    void prepare()
    return () => { live = false; window.clearTimeout(timer) }
  }, [])
  return <a className="rounded-full bg-foreground px-5 py-3 text-center font-semibold text-background"
    rel="noreferrer" href={dest || routes.consulatePass() + "?mode=companion"}>{t("consulateGateway.passage.continueWeb")}</a>
}
