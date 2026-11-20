"use client"

import {
  appendCursorPage,
  initialCursorPages,
  mergedCursorRows,
  nextCursor,
  recordCursorPage,
  type CursorPageMount,
  type CursorPageSnapshot,
  type CursorPagesState,
} from "@antsia/social-features/reseau-personnel"
import { Button, Card, Skeleton } from "@diasporale/features"
import type { ActionErrorCode, Loadable } from "@diasporale/features/data"
import { useDiasporaleT } from "@diasporale/features/i18n/client"
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react"

/**
 * Les fenêtres d'une liste (offres ou avis) : une
 * lecture par fenêtre, chacune abonnée à son curseur opaque, « Afficher plus »
 * monte la suivante. Une fenêtre filtrée peut être vide et annoncer sa suite ;
 * une ligne présente dans deux fenêtres ne s'affiche qu'une fois.
 */
export interface ServicePagerProps<Row> {
  /** Lit UNE fenêtre (un hook du fournisseur) : toujours la même fonction pour une même liste. */
  readonly read: (cursor: string | null) => Loadable<{
    readonly items: readonly Row[]
    readonly isDone: boolean
    readonly continueCursor: string | null
  }>
  readonly keyOf: (row: Row) => string
  readonly children: (rows: readonly Row[]) => ReactNode
  /** Ce qui s'affiche quand la liste est vide et close. */
  readonly empty: ReactNode
  /**
   * Discret (fiche d'une page) : rien pendant le chargement, rien pour une page illisible, et
   * jamais un bouton seul — une fenêtre vide qui annonce une suite (lignes écartées après la
   * lecture de l'index) fait lire la suivante d'elle-même, `QUIET_MAX_WINDOWS` au plus.
   */
  readonly quiet?: boolean
  /**
   * Le cadre de la rubrique (son titre) : en mode discret, les lignes, l'erreur d'une fenêtre
   * suivante et le bouton de suite s'y rendent, et rien ne s'affiche tant qu'aucune ligne n'est lue.
   */
  readonly frame?: (content: ReactNode) => ReactNode
  /** Le libellé propre du bouton de suite, lu dans sa rubrique ; sinon « Afficher plus ». */
  readonly loadMoreLabel?: string
  /** Les médias privés sont démontés aussi sur une erreur transitoire de leur lecture. */
  readonly clearOnError?: boolean
  /**
   * L'issue d'une lecture close, une fois connue : `true` si des lignes sont lues, `false` si la
   * liste est vide et close ; rien pendant un chargement ni sur une erreur.
   */
  readonly onSettled?: (hasRows: boolean) => void
}

/**
 * Les fenêtres lues d'elles-mêmes, en mode discret, tant qu'aucune ligne n'est servie : de quoi
 * couvrir le plafond d'une page (trente offres, six par fenêtre) sans lire sans fin.
 */
export const QUIET_MAX_WINDOWS = 5

/** Un refus d'accès retire aussi les lignes déjà lues : aucun cache ne survit à un refus. */
const ACCESS_ERRORS: ReadonlySet<string> = new Set(["not_signed_in", "not_member", "not_found", "status_insufficient", "suspended", "network_unavailable", "association_group_access_required", "association_group_closed", "association_event_access_required"])

interface PagerState<Row> {
  readonly pages: CursorPagesState<Row>
  readonly errors: Readonly<Record<number, ActionErrorCode | null>>
}

function snapshotOf<Row>(loadable: ReturnType<ServicePagerProps<Row>["read"]>): CursorPageSnapshot<Row> {
  if (loadable.status === "ready") {
    const { items, isDone, continueCursor } = loadable.data
    // Le curseur terminal peut être null ; une suite exige son curseur opaque.
    if (!isDone && (continueCursor === null || continueCursor.length === 0)) return { data: undefined, isPending: false, isError: true }
    return { data: { page: items, isDone, continueCursor: continueCursor ?? "" }, isPending: false, isError: false }
  }
  return { data: undefined, isPending: loadable.status === "loading", isError: loadable.status === "error" }
}

function WindowReader<Row>(props: {
  readonly mount: CursorPageMount
  readonly read: ServicePagerProps<Row>["read"]
  readonly report: (mount: CursorPageMount, snapshot: CursorPageSnapshot<Row>, error: ActionErrorCode | null) => void
}) {
  const { mount, read, report } = props
  const loadable = read(mount.cursor)
  // Le fournisseur rend la même référence tant que rien ne change : un rapport par réponse.
  useLayoutEffect(() => {
    const snapshot = snapshotOf(loadable)
    const error = loadable.status === "error" ? (loadable.code as ActionErrorCode) : snapshot.isError ? "unknown" : null
    report(mount, snapshot, error)
  }, [mount, loadable, report])
  return null
}

export function ServicePager<Row>(props: ServicePagerProps<Row>) {
  const { t } = useDiasporaleT()
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<PagerState<Row>>(() => ({ pages: initialCursorPages<Row>(), errors: {} }))
  const report = useCallback((mount: CursorPageMount, snapshot: CursorPageSnapshot<Row>, error: ActionErrorCode | null) => {
    setState((current) => {
      // Une erreur de médias privés reste fermée jusqu'à une reprise explicite,
      // même si une autre fenêtre ou un état loading arrive entre-temps.
      if (props.clearOnError && current.pages.mounts.some((candidate) => (current.errors[candidate.id] ?? null) !== null)) return current
      const pages = recordCursorPage(current.pages, mount, snapshot)
      if (pages === current.pages && (current.errors[mount.id] ?? null) === error) return current
      return { pages, errors: { ...current.errors, [mount.id]: error } }
    })
  }, [props.clearOnError])
  const { pages, errors } = state
  const error = pages.mounts.map((mount) => errors[mount.id] ?? null).find((code) => code !== null) ?? null
  const rows = error !== null && (props.clearOnError || ACCESS_ERRORS.has(error)) ? [] : mergedCursorRows(pages, props.keyOf)
  const last = pages.pages[pages.mounts[pages.mounts.length - 1]!.id]
  const initialLoading = pages.pages[0]?.data === undefined && error === null
  const loadingMore = pages.mounts.length > 1 && (!last?.data || last.isPending) && !last?.isError
  const hasMore = nextCursor(pages) !== null
  const empty = rows.length === 0 && !initialLoading && error === null && !hasMore && !loadingMore
  // Discret : une fenêtre vide qui annonce sa suite ne laisse pas un bouton seul, la suivante se lit d'elle-même.
  const autoAdvance = props.quiet === true && rows.length === 0 && hasMore && !loadingMore && error === null && pages.mounts.length < QUIET_MAX_WINDOWS
  useEffect(() => {
    if (autoAdvance) setState((current) => ({ ...current, pages: appendCursorPage(current.pages) }))
  }, [autoAdvance])
  const settled = rows.length > 0 ? true : empty ? false : null
  const { onSettled } = props
  // Avant la peinture : ce qui dépend de l'issue (les filtres d'une rubrique) paraît avec les lignes.
  useLayoutEffect(() => {
    if (settled !== null) onSettled?.(settled)
  }, [settled, onSettled])
  const retry = () => {
    // Les médias fermés après un refus ne reviennent pas pendant la nouvelle lecture.
    setState((current) => props.clearOnError ? { pages: initialCursorPages<Row>(), errors: {} } : { ...current, errors: {} })
    setGeneration((value) => value + 1)
  }

  const readers = pages.mounts.map((mount) => <WindowReader key={`${generation}:${mount.id}`} mount={mount} read={props.read} report={report} />)
  // Discret : rien sans ligne lue — ni bouton seul, ni, dans un cadre, une erreur sans titre.
  const silent = props.quiet === true && (initialLoading || error === "not_found" || empty || (rows.length === 0 && (error === null || props.frame !== undefined)))
  if (silent) return <>{readers}</>
  const content = (
    <>
      {initialLoading ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {error !== null ? (
        <Card role="alert" className="flex flex-col items-start gap-3 p-4">
          <p>{t(`errors.${error}`)}</p>
          <Button variant="outline" onClick={retry}>{t("services.results.retry")}</Button>
        </Card>
      ) : null}
      {empty ? props.empty : null}
      {rows.length > 0 ? props.children(rows) : null}
      {hasMore || loadingMore ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={loadingMore || error !== null}
          aria-busy={loadingMore}
          onClick={() => setState((current) => ({ ...current, pages: appendCursorPage(current.pages) }))}
        >
          {loadingMore ? t("services.results.loadingMore") : (props.loadMoreLabel ?? t("services.results.loadMore"))}
        </Button>
      ) : null}
    </>
  )
  return (
    <>
      {readers}
      {props.frame ? props.frame(content) : content}
    </>
  )
}
