"use client"

import { useEffect, useState } from "react"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { routes } from "@/lib/routes"
import { BrandLogo } from "@diaspora-ga/features/brand/logo"

export function ConsulateTransition({ mobileHandoff = false }: { mobileHandoff?: boolean } = {}) {
  const { t } = useDiasporaGaT()
  const [offerIdn, setOfferIdn] = useState(false)
  useEffect(() => {
    if (!mobileHandoff || new URLSearchParams(window.location.search).get("mode") !== "app") return
    // If the OS opened Consulat in another browser, its response cannot resume this WebView.
    const timer = window.setTimeout(() => setOfferIdn(true), 3500)
    return () => window.clearTimeout(timer)
  }, [mobileHandoff])
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden">
      <span role="status" aria-label={t("consulateGateway.passage.opening")} className="flex items-center justify-center px-6">
        <BrandLogo decorative variant="horizontal" className="w-60 sm:w-80" />
      </span>
      {offerIdn && <a className="absolute bottom-[20%] rounded-full px-5 py-3 text-center underline"
        href={routes.consulatePass() + "?secours=idn"}>{t("consulateGateway.arrival.continueIdn")}</a>}
    </main>
  )
}
