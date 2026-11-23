"use client"

import { cn } from "@diaspora-ga/features"
import NextLink from "next/link"
import { usePathname } from "next/navigation"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"
import { groupedSections, isSectionActive, SECTION_GROUP_KEYS, type AdminSection } from "@/lib/sections"

function SectionLink(props: { section: AdminSection; active: boolean; onFollow?: () => void }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const Icon = props.section.icon
  return (
    <NextLink
      href={props.section.href}
      aria-current={props.active ? "page" : undefined}
      onClick={props.onFollow}
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-3 rounded-[var(--esp-r-chrome)] px-3 text-[15px] transition-colors focus-visible:shadow-focus",
        // La section courante se lit aussi sans la couleur : graisse et `aria-current`.
        props.active
          ? "bg-[var(--esp-accent-soft)] font-semibold text-[var(--esp-accent-deep)]"
          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{t(props.section.labelKey)}</span>
    </NextLink>
  )
}

/**
 * Le menu de l'administration, groupé (Pilotage, Application des membres, Communauté,
 * Confiance) : seules les sections du registre, donc seules celles qui existent dans le
 * code ; un groupe vide n'est pas affiché. La section courante est marquée
 * (`aria-current="page"`). Le même menu sert la barre latérale et la feuille du téléphone.
 */
export function SectionNav(props: { onFollow?: () => void; className?: string }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const pathname = usePathname()
  const id = useId()
  return (
    <nav aria-label={t("shell.navLabel")} className={cn("flex flex-col gap-5", props.className)}>
      {groupedSections().map(({ group, sections }) => (
        <div key={group} className="flex flex-col gap-1">
          <p id={`${id}-${group}`} className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(SECTION_GROUP_KEYS[group])}
          </p>
          <ul aria-labelledby={`${id}-${group}`} className="flex flex-col gap-1">
            {sections.map((section) => (
              <li key={section.id}>
                <SectionLink section={section} active={isSectionActive(section, pathname)} onFollow={props.onFollow} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
