"use client"

import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@antsia/ui/sheet"
import { Button, cn } from "@diaspora-ga/features"
import { ExternalLink, Menu, ShieldCheck } from "lucide-react"
import bird from "@diaspora-ga/features/brand/hirondelle.svg"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { publicEnv } from "@/lib/env"
import { anchors } from "@/lib/routes"

import type { NetworkAdminView } from "./network-admin-context"
import { SectionNav } from "./section-nav"
import { SignOutEverywhereButton } from "./sign-out-button"

/** « Ouvrir diaspora.ga » : l'origine de l'environnement, dans un nouvel onglet ; absente, aucun lien. */
function MembersSiteLink(props: { className?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  if (!publicEnv.membersSiteUrl) return null
  return (
    <a
      href={publicEnv.membersSiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-pill px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:shadow-focus",
        props.className,
      )}
    >
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
      {t("shell.membersSite")}{" "}
      <span className="sr-only">{t("shell.newTab")}</span>
    </a>
  )
}

/** Le nom de l'administrateur, tel que le profil le porte. */
function AdminName(props: { admin: NetworkAdminView; className?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  if (!props.admin.displayName) return null
  return (
    <p className={cn("min-w-0 truncate text-sm", props.className)}>
      <span className="sr-only">{t("shell.signedInAs", { name: props.admin.displayName })}</span>
      <span aria-hidden="true">{props.admin.displayName}</span>
    </p>
  )
}

/** Sous 834 px, le menu se replie dans une feuille ouverte depuis l'en-tête ; elle se referme à chaque navigation. */
function MenuSheet(props: { admin: NetworkAdminView }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t("shell.openMenu")} className="min-[834px]:hidden">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t("shell.closeMenu")} className="w-[min(320px,88vw)] gap-0 p-0">
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-bold">{t("shell.menuTitle")}</SheetTitle>
          <SheetDescription>{props.admin.networkName}</SheetDescription>
        </SheetHeader>
        <SheetBody className="px-2 pb-4">
          <SectionNav onFollow={() => setOpen(false)} />
        </SheetBody>
        <SheetFooter className="flex flex-col items-stretch gap-2 border-t border-border p-4">
          <AdminName admin={props.admin} />
          <MembersSiteLink className="self-start" />
          <SignOutEverywhereButton />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * La coque d'admin.diaspora.ga (fiche CH-815 § 4.1), montée UNE fois par le gabarit gardé,
 * après le oui du serveur et l'accès journalisé : barre latérale groupée au bureau,
 * feuille sous 834 px ; en-tête avec le réseau, l'administrateur, « Ouvrir diaspora.ga »
 * et « Se déconnecter partout ». Une adresse par section (`routes.ts`).
 */
export function AdminShell(props: { admin: NetworkAdminView; children: ReactNode }) {
  const { t } = useTranslation(APP_NAMESPACE)
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col gap-6 overflow-y-auto overscroll-contain border-r border-border px-3 py-5 min-[834px]:flex">
        <p className="flex items-center gap-2 px-3 text-sm font-semibold text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("brand.eyebrow")}
        </p>
        <SectionNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-border bg-background px-2 py-2 min-[834px]:gap-4 min-[834px]:px-8">
          <MenuSheet admin={props.admin} />
          <Image src={bird} alt="" width={1032} height={682} unoptimized className="h-auto w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground min-[834px]:hidden">{t("brand.eyebrow")}</p>
            <p className="truncate font-display text-lg font-bold">{props.admin.networkName}</p>
          </div>
          <div className="hidden min-w-0 items-center gap-3 min-[834px]:flex">
            <AdminName admin={props.admin} className="max-w-[16rem]" />
            <MembersSiteLink />
            <SignOutEverywhereButton />
          </div>
        </header>
        <main id={anchors.contentId} className="w-full min-w-0 flex-1 px-4 py-6 min-[834px]:px-8 min-[834px]:py-8">
          {props.children}
        </main>
      </div>
    </div>
  )
}
