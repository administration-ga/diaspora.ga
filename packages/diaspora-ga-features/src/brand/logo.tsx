/// <reference path="./assets.d.ts" />
import { brand } from "../i18n/locales/fr/diaspora-ga.json"
import { cn } from "../lib/cn"
import bird from "./hirondelle.svg"
import horizontal from "./diaspora-horizontal.svg"
import horizontalInverse from "./diaspora-horizontal-inverse.svg"
import vertical from "./diaspora-vertical.svg"
import verticalInverse from "./diaspora-vertical-inverse.svg"
import lettering from "./diaspora.svg"

const signatures = {
  horizontal: { light: horizontal, dark: horizontalInverse, width: 1430, height: 211 },
  stacked: { light: vertical, dark: verticalInverse, width: 1080, height: 775 },
}

function assetUrl(asset: string | { src: string }) {
  return typeof asset === "string" ? asset : asset.src
}

export function BrandLogo({ variant = "horizontal", decorative = false, className }: {
  variant?: keyof typeof signatures | "symbol" | "wordmark"
  decorative?: boolean
  className?: string
}) {
  if (variant === "symbol") {
    return <img src={assetUrl(bird)} alt={decorative ? "" : brand.name} width={1032} height={682} className={cn("block h-auto w-10 shrink-0", className)} />
  }
  if (variant === "wordmark") {
    const mask = `url("${assetUrl(lettering)}") center / contain no-repeat`
    return (
      <span translate="no" aria-hidden={decorative || undefined} className={cn("inline-block w-24 max-w-full", className)}>
        <span aria-hidden="true" className="block aspect-[1080/136] bg-current forced-colors:hidden" style={{ mask, WebkitMask: mask }} />
        <span className="sr-only forced-colors:not-sr-only">{brand.name}</span>
      </span>
    )
  }
  const { light, dark, width, height } = signatures[variant]
  return (
    <span translate="no" aria-hidden={decorative || undefined} className={cn("inline-block max-w-full align-middle", variant === "horizontal" ? "w-40" : "w-32", className)}>
      <img src={assetUrl(light)} width={width} height={height} alt="" className="block h-auto w-full dark:hidden forced-colors:hidden" />
      <img src={assetUrl(dark)} width={width} height={height} alt="" className="hidden h-auto w-full dark:block forced-colors:!hidden" />
      <span className="sr-only forced-colors:not-sr-only">{brand.name}</span>
    </span>
  )
}
