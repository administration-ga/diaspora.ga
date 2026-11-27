import { cn } from "../lib/cn"
import bird from "./hirondelle.svg"
import appWordmark from "./diaspora.svg"
import webWordmark from "./diaspora-ga.svg"

type Signature = "DIASPORA" | "DIASPORA.GA"
type Variant = "symbol" | "wordmark" | "horizontal" | "stacked"

function assetUrl(asset: string | { src: string }) {
  return typeof asset === "string" ? asset : asset.src
}

/** Un dessin vectoriel commun au site et à la console. Les couleurs des ailes sont fixes. */
export function BrandLogo({
  name = "DIASPORA.GA", variant = "horizontal", decorative = false, className,
}: {
  name?: Signature
  variant?: Variant
  decorative?: boolean
  className?: string
}) {
  if (variant === "symbol") {
    return <img src={assetUrl(bird)} alt={decorative ? "" : name} width={1032} height={682} className={cn("block h-auto w-10 shrink-0", className)} />
  }
  const app = name === "DIASPORA"
  const mask = `url("${assetUrl(app ? appWordmark : webWordmark)}") center / contain no-repeat`
  return (
    <span translate="no" aria-hidden={decorative || undefined} className={cn(
      "inline-flex items-center gap-2",
      variant === "stacked" && "flex-col",
      className,
    )}>
      {variant !== "wordmark" && <BrandLogo variant="symbol" decorative className={variant === "stacked" ? "w-20" : undefined} />}
      <span className="relative inline-block">
        <span aria-hidden="true" className={cn("block bg-current forced-colors:hidden", app ? "aspect-[1080/136] w-24" : "aspect-[1415/136] w-[7.75rem]")} style={{ mask, WebkitMask: mask }} />
        <span className="sr-only forced-colors:not-sr-only">{name}</span>
      </span>
    </span>
  )
}
