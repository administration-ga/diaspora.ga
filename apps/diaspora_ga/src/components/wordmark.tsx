import { BrandLogo } from "@diaspora-ga/features/brand/logo"

export function BrandBird({ className }: { className?: string }) {
  return <BrandLogo variant="symbol" decorative className={className} />
}

export function Wordmark({ className, textOnly = false }: { className?: string; textOnly?: boolean }) {
  return <BrandLogo variant={textOnly ? "wordmark" : "horizontal"} className={className} />
}
