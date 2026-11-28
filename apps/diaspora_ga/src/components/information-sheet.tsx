"use client"

import { LEGAL_TEXTS, type LegalTextKind } from "@diaspora-ga/domain"
import { cn, CountrySwitch, Sheet, SheetContent } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import type { MemberMenuEntryId } from "@diaspora-ga/features/navigation"
import { ArrowLeftIcon, ArrowUpRightIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import NextLink from "next/link"
import { useRouter } from "next/navigation"
import { routes } from "@/lib/routes"
import { useEffect, useId, useRef, useState } from "react"

import { formatLegalTextDate, INFORMATION_ENTRY_TEXTS, legalSectionHref } from "@/lib/legal-texts"
import { isPlainClick } from "@/lib/plain-click"

import { LegalReader } from "./legal-reader"

/** Une entrée du groupe « Informations », telle que la coque la monte (adresse, icône, libellé, page courante). */
export interface InformationSheetEntry {
  readonly id: MemberMenuEntryId
  readonly href: string
  readonly icon: LucideIcon
  readonly labelKey: string
  /** La page courante relève de cette entrée : `aria-current="page"` dans l'index. */
  readonly active: boolean
}

/** Trois niveaux, une vue chacun : l'index, un texte (son sommaire), une rubrique. */
type Level =
  | { readonly level: "index" }
  | { readonly level: "text"; readonly kind: LegalTextKind }
  | { readonly level: "section"; readonly kind: LegalTextKind; readonly section: string }

const INDEX: Level = { level: "index" }

/** Le texte qu'ouvre une entrée ; `null` : la charte graphique, une page vivante, reste un lien ordinaire. */
function textOf(entry: InformationSheetEntry): LegalTextKind | null {
  return (INFORMATION_ENTRY_TEXTS as Readonly<Partial<Record<MemberMenuEntryId, LegalTextKind | null>>>)[entry.id] ?? null
}

/**
 * La page flottante « Informations » (« une page = une vue », décision du 24/11/2026, § 4) : la
 * feuille de la charte, en bas d'écran au téléphone, en panneau centré au bureau. Le membre ne
 * quitte plus sa coque pour lire un texte du site. Elle remplace le sous-menu du bureau et le
 * volet replié du téléphone.
 *
 * Trois niveaux : (1) l'index, les entrées du menu partagé (`menu.information`), la version et la
 * date sous chaque texte ; (2) un texte, son titre, sa version et son sommaire numéroté ; (3) une
 * rubrique, son corps, Précédent et Suivant. La flèche « Retour » remonte d'un niveau ; la croix,
 * Échap ou le voile ferment. L'adresse ne change pas (état interne) : chaque entrée reste un vrai
 * lien (adresse de la table des routes) dont le clic simple est intercepté, et Cmd-clic ouvre la
 * page publique ; la charte reste un lien ordinaire qui quitte la feuille. Le focus va, à chaque
 * niveau, sur son titre ; à la fermeture, il revient à l'avatar qui a ouvert le menu du compte.
 *
 * Limite assumée (lot 5) : le retour du téléphone ne remonte pas d'un niveau.
 */
export function InformationSheet(props: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly entries: readonly InformationSheetEntry[]
  /** Où rendre le focus à la fermeture : l'avatar qui a ouvert le menu ou la feuille du compte. */
  readonly returnFocus: () => HTMLElement | null
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {/* Monté à l'ouverture seulement : chaque ouverture repart de l'index. */}
      {props.open ? <InformationPanel {...props} /> : null}
    </Sheet>
  )
}

function InformationPanel(props: {
  readonly onOpenChange: (open: boolean) => void
  readonly entries: readonly InformationSheetEntry[]
  readonly returnFocus: () => HTMLElement | null
}) {
  const { t, locale } = useDiasporaGaT()
  const router = useRouter()
  const [level, setLevel] = useState<Level>(INDEX)
  const contentId = useId()
  const describedBy = useId()
  // Un changement de niveau voulu par la feuille (index → texte, « Retour ») pose le focus sur le
  // titre ; une rubrique choisie dans le lecteur, sur son intitulé (le lecteur s'en charge).
  const focusTitle = useRef(false)

  const titleElement = () => document.getElementById(contentId)?.querySelector<HTMLElement>('[data-slot="sheet-title"]') ?? null
  useEffect(() => {
    if (!focusTitle.current) return
    focusTitle.current = false
    titleElement()?.focus()
  })

  const go = (next: Level) => {
    focusTitle.current = true
    setLevel(next)
  }

  const kind = level.level === "index" ? null : level.kind
  const edition = (text: LegalTextKind) => t("legal.edition", { version: LEGAL_TEXTS[text].version, date: formatLegalTextDate(LEGAL_TEXTS[text].date, locale) })
  const up: Level | null = level.level === "section" ? { level: "text", kind: level.kind } : level.level === "text" ? INDEX : null

  return (
    <SheetContent
      id={contentId}
      title={kind === null ? t("nav.account.info") : t(`legal.${kind}.title`)}
      description={kind === null ? t("nav.information.description") : edition(kind)}
      closeLabel={t("nav.information.close")}
      leading={
        up === null ? null : (
          <button
            type="button"
            onClick={() => go(up)}
            aria-label={t("nav.information.back")}
            className="-ml-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-focus"
          >
            <ArrowLeftIcon aria-hidden className="size-5" />
          </button>
        )
      }
      // Au téléphone, la même hauteur aux trois niveaux : la page flottante garde son cadre, « Retour »
      // et la croix ne bougent pas d'un niveau à l'autre. Au bureau, l'index reste à sa taille ; un
      // texte prend une hauteur fixe (les volets prennent ce qui reste) et un panneau élargi, pour
      // montrer sommaire et rubrique côte à côte.
      className={cn("h-[min(88dvh,780px)]", kind === null ? "md:h-auto" : "md:h-[min(680px,88dvh)] md:w-[min(920px,calc(100vw-2rem))]")}
      bodyClassName={cn("flex flex-col", kind !== null && "tall:overflow-hidden")}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleElement()?.focus()
      }}
      onCloseAutoFocus={(event) => {
        // Ouverte depuis un menu, sans déclencheur à elle : le focus revient à l'avatar.
        event.preventDefault()
        props.returnFocus()?.focus()
      }}
    >
      {level.level === "index" ? (
        <nav aria-label={t("nav.account.info")}>
          <ul className="flex flex-col gap-0.5">
            <li>
              <CountrySwitch value={null} title={t("explore.countriesTitle")} triggerLabel={t("explore.countriesTitle")}
                description={t("explore.countriesLead")} onChange={(code) => {
                  props.onOpenChange(false)
                  router.push(routes.hub(code))
                }} />
            </li>
            {props.entries.map((entry) => {
              const text = textOf(entry)
              const Icon = entry.icon
              const detailId = `${describedBy}-${entry.id}`
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "relative flex min-h-14 min-w-0 items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                    entry.active ? "bg-[var(--esp-accent-soft)] text-[var(--esp-accent-deep)]" : "hover:bg-muted",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5 shrink-0", entry.active ? null : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1">
                    {/* Le lien couvre la ligne entière (`after:inset-0`) ; son nom reste le libellé seul,
                        la version et la date le décrivent. */}
                    <NextLink
                      href={entry.href}
                      aria-current={entry.active ? "page" : undefined}
                      aria-describedby={detailId}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return
                        if (text === null) {
                          // La charte : un lien ordinaire, qui quitte la feuille.
                          props.onOpenChange(false)
                          return
                        }
                        event.preventDefault()
                        go({ level: "text", kind: text })
                      }}
                      className={cn(
                        "block truncate text-[15px] outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:shadow-none focus-visible:after:shadow-focus",
                        entry.active ? "font-semibold" : "font-medium",
                      )}
                    >
                      {t(entry.labelKey)}
                    </NextLink>
                    <span id={detailId} className={cn("block truncate text-[13px]", entry.active ? null : "text-muted-foreground")}>
                      {text === null ? t("nav.information.opensPage") : edition(text)}
                    </span>
                  </span>
                  {text === null ? (
                    <ArrowUpRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
      ) : (
        <LegalReader
          // Un autre texte remonte le lecteur : son focus et son défilement repartent de zéro.
          key={level.kind}
          kind={level.kind}
          active={level.level === "section" ? level.section : null}
          sectionHref={(section) => legalSectionHref(level.kind, section)}
          onSelect={(section) => setLevel(section === null ? { level: "text", kind: level.kind } : { level: "section", kind: level.kind, section })}
          headingLevel={3}
        />
      )}
    </SheetContent>
  )
}
