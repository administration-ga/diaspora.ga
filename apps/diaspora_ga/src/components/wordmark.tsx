"use client"

import bird from "@diaspora-ga/features/brand/hirondelle.svg"
import lettering from "@diaspora-ga/features/brand/diaspora-ga.svg"
import { cn } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import Image, { type StaticImageData } from "next/image"

export function BrandBird({ className }: { className?: string }) {
  return <Image src={bird} alt="" width={1032} height={682} unoptimized className={cn("h-auto w-10 shrink-0", className)} />
}

/** The lettering follows the active theme, including a user-selected dark mode. */
export function Wordmark({ className, textOnly = false }: { className?: string; textOnly?: boolean }) {
  const { t } = useDiasporaGaT()
  const asset = lettering as StaticImageData | string
  const url = typeof asset === "string" ? asset : asset.src
  const mask = `url("${url}") center / contain no-repeat`
  return (
    <span translate="no" className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      {textOnly ? null : <BrandBird />}
      <span className="relative inline-block">
        <span aria-hidden="true" className="block aspect-[1415/136] w-[7.75rem] bg-current forced-colors:hidden" style={{ mask, WebkitMask: mask }} />
        <span className="sr-only forced-colors:not-sr-only">{t("brand.name")}</span>
      </span>
    </span>
  )
}
