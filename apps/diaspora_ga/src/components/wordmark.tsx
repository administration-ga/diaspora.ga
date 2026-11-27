import { BrandLogo } from "@diaspora-ga/features/brand/logo"

export function Wordmark({ className, textOnly = false }: { className?: string; textOnly?: boolean }) {
  return <BrandLogo variant={textOnly ? "wordmark" : "horizontal"} className={className} />
}
