"use client"

import { useRef } from "react"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { LiquidWordmark } from "./liquid-wordmark"

export function ConsulateTransition() {
  const { t } = useDiasporaGaT()
  const area = useRef<HTMLElement>(null)
  return (
    <main ref={area} role="status" aria-label={t("consulateGateway.passage.opening")}
      className="relative isolate grid min-h-dvh place-items-center overflow-hidden">
      <span className="font-display text-[40px] font-bold leading-none tracking-tight text-primary sm:text-[72px]">
        <LiquidWordmark text={t("brand.name")} areaRef={area} replayIntro />
      </span>
    </main>
  )
}
