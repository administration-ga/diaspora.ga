"use client"

import { ArrowLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"

import { cn } from "../lib/cn"

import { ViewPane } from "./view-frame"

/** Une entrée de la liste maître : la sous-vue, son libellé (déjà traduit), son adresse (une ancre de la page), son icône. */
export interface SubViewItem<Id extends string> {
  readonly id: Id
  readonly label: string
  readonly href: string
  readonly icon?: LucideIcon
}

export interface SubViewsProps<Id extends string> {
  /** Le nom de la navigation (la liste maître). */
  readonly label: string
  /** Le nom FIXE du volet de détail : il ne change pas d'une sous-vue à l'autre (chaque sous-vue est un groupe nommé). */
  readonly detailLabel: string
  readonly items: readonly SubViewItem<Id>[]
  /** La sous-vue choisie par l'adresse ; `null` : aucune — la liste à l'étroit, la première sous-vue au large. */
  readonly active: Id | null
  /** La ligne de retour à la liste, à l'étroit : un lien natif (l'ancre de la liste). */
  readonly back: { readonly href: string; readonly label: string }
  /** L'identifiant de la liste : la cible de l'ancre de retour. */
  readonly listId: string
  /** Ce qui suit les entrées, dans le même volet (une ligne qui ouvre autre chose). */
  readonly listFooter?: ReactNode
  /** Le contenu de chaque sous-vue : toutes sont montées, une seule est montrée. */
  readonly children: (id: Id) => ReactNode
  readonly className?: string
}

/**
 * Le maître–détail d'une vue (« une page = une vue », décision du 24/11/2026, § 3, lot 2) : une
 * page trop longue se découpe en sous-vues, choisies par l'ancre de l'adresse. La primitive n'a ni
 * texte ni routeur : l'écran lui donne les libellés, les adresses et la sous-vue choisie
 * (`useHashView`). Les liens sont des `<a href="#…">` natifs : le retour du navigateur remonte.
 *
 * Le cadre est en CSS seul, par requête de conteneur (`@container/subviews`) : au large (au moins
 * 56 rem), la liste (16 rem) et le détail (42 rem au plus) côte à côte, et sans ancre la première
 * sous-vue ; à l'étroit, un niveau à la fois — la liste, puis une sous-vue sous sa ligne de retour,
 * posée HORS du volet pour rester visible quand il défile. Deux volets nommés au plus (`ViewPane`) :
 * la liste et le détail.
 *
 * Toutes les sous-vues restent montées : une saisie non enregistrée survit au changement, et les
 * ancres des sections restent dans le document. Les inactives portent `data-inactive` (jamais
 * l'attribut `hidden`). Rien n'a de transition (`transition-none`) : en mouvement réduit, la charte
 * en pose une de 0,01 ms sur tout, et un bloc qui bascule passerait par une image écrasée.
 *
 * Le focus suit la vue, comme dans le lecteur des textes : une sous-vue choisie depuis la
 * primitive (ou par le retour du navigateur, focus dedans) le reçoit sur son groupe ; le retour à
 * la liste le rend au lien de la sous-vue quittée ; à l'arrivée, rien n'est volé ; un geste hors de
 * la primitive garde son focus. Le volet du détail repart du haut à chaque changement.
 */
export function SubViews<Id extends string>(props: SubViewsProps<Id>) {
  const first = props.items[0]?.id
  const active = props.active !== null && props.items.some((item) => item.id === props.active) ? props.active : null
  const shown = active ?? first
  const view = active === null ? "list" : "detail"

  const rootRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const settled = useRef(false)
  const lastShown = useRef(shown)
  useEffect(() => {
    const root = rootRef.current
    const leaving = lastShown.current
    lastShown.current = shown
    // Une autre sous-vue, ou l'autre niveau : le volet du détail repart du haut.
    if (paneRef.current) paneRef.current.scrollTop = 0
    if (!settled.current) {
      // L'arrivée : aucun vol de focus (l'écran amène une section secondaire en tête, s'il le faut).
      settled.current = true
      return
    }
    const focused = document.activeElement
    if (root === null || !(focused === null || focused === document.body || root.contains(focused))) return
    const target =
      view === "detail"
        ? root.querySelector<HTMLElement>(`[data-sub-view="${shown}"]`)
        : leaving === undefined
          ? null
          : root.querySelector<HTMLElement>(`[data-sub-view-link="${leaving}"]`)
    target?.focus()
  }, [view, shown])

  return (
    <div ref={rootRef} data-sub-views="" data-view={view} className={cn("@container/subviews flex min-w-0 flex-col transition-none tall:min-h-0 tall:flex-1", props.className)}>
      <div className="flex min-w-0 flex-col gap-4 tall:min-h-0 tall:flex-1 @4xl/subviews:grid @4xl/subviews:grid-cols-[16rem_minmax(0,42rem)] @4xl/subviews:grid-rows-[minmax(0,1fr)] @4xl/subviews:gap-6">
        <ViewPane
          landmark="navigation"
          label={props.label}
          id={props.listId}
          // À l'étroit, un niveau à la fois : la liste s'efface quand une sous-vue est ouverte.
          className={cn("flex shrink-0 flex-col gap-1 bg-muted px-2 py-3", view === "detail" ? "@max-4xl/subviews:hidden" : "tall:flex-1")}
        >
          <ul className="flex flex-col gap-0.5">
            {props.items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    data-sub-view-link={item.id}
                    aria-current={item.id === shown ? "true" : undefined}
                    className="group flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm leading-snug transition-colors hover:bg-neutral-hover focus-visible:shadow-focus aria-[current=true]:bg-[var(--esp-accent-soft)] aria-[current=true]:font-semibold aria-[current=true]:text-[var(--esp-accent-deep)]"
                  >
                    {Icon === undefined ? null : <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground group-aria-[current=true]:text-inherit" />}
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {/* À l'étroit, l'entrée ouvre un niveau : le chevron le dit. */}
                    <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground @4xl/subviews:hidden" />
                  </a>
                </li>
              )
            })}
          </ul>
          {props.listFooter === undefined ? null : <div className="mt-1 border-t border-border pt-1">{props.listFooter}</div>}
        </ViewPane>

        <div className={cn("flex min-w-0 flex-col gap-2 transition-none tall:min-h-0 tall:flex-1", view === "list" && "@max-4xl/subviews:hidden")}>
          <a
            href={props.back.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:shadow-focus @4xl/subviews:hidden"
          >
            <ArrowLeftIcon aria-hidden className="size-4 shrink-0" />
            {props.back.label}
          </a>
          <ViewPane ref={paneRef} label={props.detailLabel} className="flex flex-col pb-2 tall:flex-1">
            {props.items.map((item) => (
              <div
                key={item.id}
                data-sub-view={item.id}
                role="group"
                aria-label={item.label}
                tabIndex={-1}
                // Jamais l'attribut `hidden` : la sous-vue reste dans le document, ses ancres et sa saisie aussi.
                data-inactive={item.id === shown ? undefined : ""}
                className="flex min-w-0 flex-col gap-4 outline-none transition-none focus-visible:shadow-none data-[inactive]:hidden"
              >
                {props.children(item.id)}
              </div>
            ))}
          </ViewPane>
        </div>
      </div>
    </div>
  )
}
