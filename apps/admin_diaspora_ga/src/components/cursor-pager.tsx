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
import { Button, Skeleton } from "@diaspora-ga/features"
import { useQuery, type OptionalRestArgsOrSkip } from "convex/react"
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server"
import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE } from "@/i18n/resources"

/** Une fenêtre du moteur : ses lignes (peut-être filtrées après lecture), et sa suite. */
export interface CursorWindow<Row> {
  readonly items: readonly Row[]
  readonly isDone: boolean
  readonly continueCursor: string | null
}

/**
 * Les fenêtres d'une liste du moteur (recours, mots bloqués) — repris du paginateur de
 * diaspora.ga (`service-pager.tsx`), sans démonstration : une lecture réactive par fenêtre,
 * chacune abonnée à son curseur opaque ; « Afficher plus » monte la suivante. Une fenêtre filtrée
 * peut revenir vide et annoncer sa suite ; une ligne lue dans deux fenêtres ne paraît qu'une fois.
 * Un refus de lecture remonte à la section (`SectionBoundary`), qui le dit et relit.
 */
export interface CursorPagerProps<Query extends FunctionReference<"query">, Row> {
  /** La lecture du moteur, une par fenêtre. */
  readonly query: Query
  /** Les arguments d'une fenêtre, pour son curseur (toujours la même fonction pour une même liste). */
  readonly args: (cursor: string | null) => FunctionArgs<Query>
  /** La fenêtre lue dans la réponse du moteur. */
  readonly windowOf: (result: FunctionReturnType<Query>) => CursorWindow<Row>
  readonly keyOf: (row: Row) => string
  readonly children: (rows: readonly Row[]) => ReactNode
  /** Ce qui s'affiche quand la liste est vide et close. */
  readonly empty: ReactNode
}

export function CursorPager<Query extends FunctionReference<"query">, Row>(props: CursorPagerProps<Query, Row>) {
  const { t } = useTranslation(APP_NAMESPACE)
  const [pages, setPages] = useState<CursorPagesState<Row>>(() => initialCursorPages<Row>())
  const report = useCallback((mount: CursorPageMount, snapshot: CursorPageSnapshot<Row>) => {
    setPages((current) => recordCursorPage(current, mount, snapshot))
  }, [])
  const rows = mergedCursorRows(pages, props.keyOf)
  const last = pages.pages[pages.mounts[pages.mounts.length - 1]!.id]
  const initialLoading = pages.pages[0]?.data === undefined
  const loadingMore = pages.mounts.length > 1 && (!last?.data || last.isPending)
  const hasMore = nextCursor(pages) !== null
  const empty = rows.length === 0 && !initialLoading && !hasMore && !loadingMore
  return (
    <>
      {pages.mounts.map((mount) => (
        <WindowReader key={mount.id} mount={mount} query={props.query} args={props.args} windowOf={props.windowOf} report={report} />
      ))}
      {initialLoading ? (
        <div role="status">
          <span className="sr-only">{t("section.loading")}</span>
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : null}
      {empty ? props.empty : null}
      {rows.length > 0 ? props.children(rows) : null}
      {hasMore || loadingMore ? (
        <Button variant="outline" className="self-start" disabled={loadingMore} aria-busy={loadingMore} onClick={() => setPages((current) => appendCursorPage(current))}>
          {loadingMore ? t("section.loadingMore") : t("section.loadMore")}
        </Button>
      ) : null}
    </>
  )
}

function WindowReader<Query extends FunctionReference<"query">, Row>(
  props: Pick<CursorPagerProps<Query, Row>, "query" | "args" | "windowOf"> & {
    readonly mount: CursorPageMount
    readonly report: (mount: CursorPageMount, snapshot: CursorPageSnapshot<Row>) => void
  },
) {
  const { mount, report, windowOf } = props
  // Les arguments d'une lecture générique : la forme est celle de `FunctionArgs<Query>`.
  const result = useQuery(props.query, ...([props.args(mount.cursor)] as OptionalRestArgsOrSkip<Query>))
  // Une même réponse garde la même fenêtre (Convex rend la même référence tant qu'elle ne change pas) : un rapport par réponse.
  const snapshot = useMemo((): CursorPageSnapshot<Row> => {
    if (result === undefined) return { data: undefined, isPending: true, isError: false }
    const slice = windowOf(result)
    // Le curseur terminal peut être nul ; une suite exige son curseur opaque.
    if (!slice.isDone && (slice.continueCursor === null || slice.continueCursor.length === 0)) return { data: undefined, isPending: false, isError: true }
    return { data: { page: slice.items, isDone: slice.isDone, continueCursor: slice.continueCursor ?? "" }, isPending: false, isError: false }
  }, [result, windowOf])
  useLayoutEffect(() => {
    report(mount, snapshot)
  }, [mount, snapshot, report])
  return null
}
