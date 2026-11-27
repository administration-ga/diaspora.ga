"use client"

import { useEffect, useRef, useState } from "react"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { routes } from "@/lib/routes"
import { LiquidWordmark } from "./liquid-wordmark"

export function ConsulateTransition({ mobileHandoff = false }: { mobileHandoff?: boolean } = {}) {
  const { t } = useDiasporaGaT()
  const area = useRef<HTMLElement>(null)
  const [offerIdn, setOfferIdn] = useState(false)
  useEffect(() => {
    if (!mobileHandoff || new URLSearchParams(window.location.search).get("mode") !== "app") return
    // If the OS opened Consulat in another browser, its response cannot resume this WebView.
    const timer = window.setTimeout(() => setOfferIdn(true), 3500)
    return () => window.clearTimeout(timer)
  }, [mobileHandoff])
  return (
    <main ref={area}
      className="relative isolate grid min-h-dvh place-items-center overflow-hidden">
      <span role="status" aria-label={t("consulateGateway.passage.opening")} className="font-display text-[40px] font-bold leading-none tracking-tight text-primary sm:text-[72px]">
        <LiquidWordmark text={t("brand.name")} areaRef={area} replayIntro />
      </span>
      {offerIdn && <a className="absolute bottom-[20%] rounded-full px-5 py-3 text-center underline"
        href={routes.consulatePass() + "?secours=idn"}>{t("consulateGateway.arrival.continueIdn")}</a>}
    </main>
  )
}
