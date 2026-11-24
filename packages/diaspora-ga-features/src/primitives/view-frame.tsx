import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/cn"

/**
 * « Une page = une vue » (décision du 24/11/2026, § 3) — hors des pages de flux, le document ne
 * défile pas dès que la fenêtre fait au moins 600 px de haut (variante `tall`) : le cadre tient
 * l'écran, et seuls des volets nommés défilent, deux au plus par vue. Sous 600 px de haut (petit
 * écran couché, zoom à 200 %), le cadre se relâche et la page redevient un document : toutes ses
 * contraintes sont posées sous `tall:`.
 *
 * `ViewFrame` : l'en-tête fixe, le corps qui peut rétrécir (`min-h-0`) et le pied. Il prend la
 * hauteur que lui laisse son parent, une colonne flexible (la coque d'une page, le corps d'une
 * feuille).
 */
export function ViewFrame(props: {
  /** Ce qui reste en tête : titre, onglets, filtres. */
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div data-view-frame="" className={cn("flex min-w-0 flex-col tall:min-h-0 tall:flex-1", props.className)}>
      {props.header === undefined ? null : (
        <div data-view-frame-header="" className="shrink-0">
          {props.header}
        </div>
      )}
      <div data-view-frame-body="" className={cn("flex min-w-0 flex-col tall:min-h-0 tall:flex-1", props.bodyClassName)}>
        {props.children}
      </div>
      {props.footer === undefined ? null : (
        <div data-view-frame-footer="" className="shrink-0">
          {props.footer}
        </div>
      )}
    </div>
  )
}

export type ViewPaneProps = Omit<ComponentProps<"div">, "role" | "tabIndex" | "aria-label" | "aria-labelledby"> & {
  /** Le nom du volet, OBLIGATOIRE : un lecteur d'écran dit ce qui défile ; le relevé du navigateur le lit. */
  readonly label: string
  /** Un sommaire reste une navigation : le volet en prend le rôle (aucune région en double). */
  readonly landmark?: "region" | "navigation"
}

/**
 * `ViewPane` : le SEUL élément autorisé à défiler dans une vue. Région nommée, joignable au
 * clavier (`tabIndex` 0 : les flèches le font défiler), marquée `data-view-pane` pour le relevé
 * du navigateur, défilement contenu (`overscroll-contain`), anneau de focus de la charte. Il ne
 * défile que cadre tenu (`tall:`) ; sous 600 px de haut, c'est un bloc ordinaire du document.
 */
export function ViewPane({ label, landmark = "region", className, children, ...rest }: ViewPaneProps) {
  return (
    <div
      {...rest}
      role={landmark}
      aria-label={label}
      tabIndex={0}
      data-view-pane=""
      className={cn("min-h-0 min-w-0 overscroll-contain rounded-xl focus-visible:shadow-focus tall:overflow-y-auto", className)}
    >
      {children}
    </div>
  )
}
