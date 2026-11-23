"use client"

import { Button, EmptyState, Input, PostCard, Skeleton } from "@diaspora-ga/features"
import {
  POST_SEARCH_MIN_LENGTH,
  POST_SEARCH_PAGE_SIZE,
  nextPostSearchLimit,
  useActions,
  type MembershipView,
  type PostSearchCapability,
  type PostSearchPage,
} from "@diaspora-ga/features/data"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import { SearchIcon } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { toast } from "sonner"

/** Attente après la dernière frappe : une recherche par intention, pas par lettre (comme l'annuaire). */
const SEARCH_DEBOUNCE_MS = 250

function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/**
 * DS-11, volet recherche (CH-817) — chercher dans les publications, depuis « Membres » : un champ,
 * puis les publications trouvées, celles que le lecteur peut lire dans DIASPORA.GA et elles
 * seules, des plus récentes aux plus anciennes. Une recherche en cours remplace le reste de la
 * page (`children`), comme la recherche par nom de l'annuaire ; sans mots, la page revient.
 * Aucune recherche n'est gardée : ni dans l'adresse, ni dans le navigateur, ni au serveur.
 */
export function PostSearchSection(props: { capability: PostSearchCapability; membership: MembershipView; children: ReactNode }) {
  const { t } = useDiasporaGaT()
  const ids = useId()
  const [query, setQuery] = useState("")
  const settled = useSettled(query.trim(), SEARCH_DEBOUNCE_MS)
  const searching = settled.length >= POST_SEARCH_MIN_LENGTH

  return (
    <>
      <section aria-labelledby={`${ids}-titre`} className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-card">
        <div>
          <h2 id={`${ids}-titre`} className="text-lg font-semibold">
            {t("postSearch.title")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("postSearch.lead")}</p>
        </div>
        <div role="search" className="relative">
          <label htmlFor={`${ids}-q`} className="sr-only">
            {t("postSearch.label")}
          </label>
          <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${ids}-q`}
            type="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t("postSearch.placeholder")}
            aria-describedby={`${ids}-aide`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <p id={`${ids}-aide`} className="text-[13px] text-muted-foreground">
          {t("postSearch.hint")}
        </p>
      </section>
      {searching ? <PostSearchResults key={settled} capability={props.capability} membership={props.membership} query={settled} /> : props.children}
    </>
  )
}

/** Les publications trouvées : une fenêtre, puis une de plus à chaque « Voir plus », jusqu'à la borne. */
function PostSearchResults(props: { capability: PostSearchCapability; membership: MembershipView; query: string }) {
  const { t } = useDiasporaGaT()
  const actions = useActions()
  const ids = useId()
  const [now] = useState(() => Date.now())
  const [limit, setLimit] = useState(POST_SEARCH_PAGE_SIZE)
  // Pendant la lecture de la fenêtre suivante, les publications déjà lues restent à l'écran.
  const [previous, setPrevious] = useState<PostSearchPage | null>(null)
  const results = props.capability.usePostSearch({ query: props.query, limit })
  const page = results.status === "ready" ? results.data : previous
  const loadingMore = results.status === "loading" && previous !== null

  let body: ReactNode
  if (results.status === "loading" && previous === null) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  } else if (results.status === "error" && previous === null) {
    body = (
      <p role="alert" className="rounded-xl bg-card p-4 text-[15px] shadow-card">
        {t(`errors.${results.code}`)}
      </p>
    )
  } else if (page !== null && page.items.length === 0) {
    body = <EmptyState icon={<SearchIcon />} title={t("postSearch.emptyTitle", { query: props.query })} description={t("postSearch.emptyBody")} />
  } else if (page !== null) {
    body = (
      <>
        <p role="status" className="sr-only">
          {t("postSearch.count", { count: page.items.length })}
        </p>
        <ul aria-label={t("postSearch.resultsLabel")} className="flex flex-col gap-3">
          {page.items.map((post) => (
            <li key={post.id} className="min-w-0">
              <PostCard
                post={post}
                now={now}
                canReact={props.membership.canPublish}
                onReact={async (kind) => {
                  const result = await actions.react(post.id, kind)
                  if (!result.ok) toast.error(t(`errors.${result.code}`))
                }}
              />
            </li>
          ))}
        </ul>
        {results.status === "error" ? (
          <p role="alert" className="rounded-xl bg-card p-4 text-[15px] shadow-card">
            {t(`errors.${results.code}`)}
          </p>
        ) : null}
        {page.hasMore || loadingMore ? (
          <Button
            variant="outline"
            className="self-center"
            disabled={loadingMore}
            aria-busy={loadingMore}
            onClick={() => {
              setPrevious(page)
              setLimit((current) => nextPostSearchLimit(current))
            }}
          >
            {t("postSearch.loadMore")}
          </Button>
        ) : null}
        {page.capped ? <p className="text-center text-[13px] text-muted-foreground">{t("postSearch.capped")}</p> : null}
      </>
    )
  }

  return (
    <section aria-labelledby={`${ids}-resultats`} aria-busy={results.status === "loading"} className="flex min-w-0 flex-col gap-3">
      <h2 id={`${ids}-resultats`} className="sr-only">
        {t("postSearch.resultsLabel")}
      </h2>
      {body}
    </section>
  )
}
