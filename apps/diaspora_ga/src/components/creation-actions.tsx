"use client"

import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { Building2Icon, PenSquareIcon, RadioIcon, UsersRoundIcon } from "lucide-react"
import NextLink from "next/link"
import { DropdownMenu } from "radix-ui"

import type { CreateFormat } from "@/lib/create-menu"

interface CreationActionsProps {
  formats: readonly CreateFormat[]
  onPost: (() => void) | null
  onLive: () => void
  menu?: boolean
}

/** The global menu and the feed open exactly the same four destinations. */
export function CreationActions({ formats, onPost, onLive, menu = false }: CreationActionsProps) {
  const { t } = useDiasporaGaT()
  const ordered = [
    { id: "post", labelKey: "nav.create.actions.post", icon: PenSquareIcon, run: onPost, href: null },
    { id: "live", labelKey: "nav.create.actions.live", icon: RadioIcon, run: formats.some((item) => item.id === "live") ? onLive : null, href: null },
    { id: "company", labelKey: "nav.create.actions.company", icon: Building2Icon, run: null, href: formats.find((item) => item.id === "company")?.href },
    { id: "association", labelKey: "nav.create.actions.association", icon: UsersRoundIcon, run: null, href: formats.find((item) => item.id === "association")?.href },
  ] as const
  const itemClass = menu
    ? "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-start text-sm font-semibold outline-none data-[highlighted]:bg-muted focus-visible:shadow-focus"
    : "inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl bg-muted px-2 text-center text-[13px] font-semibold hover:bg-accent focus-visible:shadow-focus"
  const items = ordered.map(({ id, labelKey, icon: Icon, run, href }) => {
    if (!run && !href) return null
    const label = <><Icon aria-hidden className="size-4 shrink-0" /><span>{t(labelKey)}</span></>
    if (href) {
      const link = <NextLink key={id} href={href} className={itemClass}>{label}</NextLink>
      return menu ? <DropdownMenu.Item key={id} asChild>{link}</DropdownMenu.Item> : link
    }
    if (!run) return null
    return menu
      ? <DropdownMenu.Item key={id} onSelect={run} className={itemClass}>{label}</DropdownMenu.Item>
      : <button key={id} type="button" onClick={run} className={itemClass}>{label}</button>
  })
  return menu ? <>{items}</> : (
    <div role="group" aria-label={t("nav.create.title")} className="grid grid-cols-2 gap-1.5 min-[520px]:grid-cols-4">
      {items}
    </div>
  )
}
