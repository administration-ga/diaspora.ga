"use client"

import { ImmersiveOverlay } from "@antsia/ui/overlay"
import { Maximize2Icon, PlayIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { useOptionalDataSource } from "../data/context"
import type { DiasporaGaDataSource } from "../data/port"
import type { PostMediaView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { claimMediaViewer, ownsMediaViewer, releaseMediaViewer, stopAllMediaPlayback } from "../lib/media-viewer-lease"
import { mediaGridLayout, singleMediaRatio, type MediaGridLayout, type MediaGridTile } from "./media-layout"
import { FeedVideo } from "./feed-video"
import { isDelivered, MediaUnavailable, useLoadFailure } from "./media-parts"
import { MediaViewerCarousel } from "./media-viewer"

/**
 * Les médias d'une publication (EXF-DG-10, refonte A6 du 25/11/2026). La grille suit le
 * nombre (`mediaGridLayout`) : une photo pleine largeur dans ses proportions bornées,
 * deux côte à côte, trois en une grande et deux empilées, quatre en 2 × 2, et au-delà
 * trois vignettes puis une quatrième voilée « +N ». Toucher une tuile ouvre la
 * visionneuse en défilement horizontal à ce média (`MediaViewerCarousel`).
 *
 * `bleed` : dans une carte, les médias vont d'un bord à l'autre (aucune marge latérale,
 * aucun angle par tuile, le rayon de la carte les découpe) ; ailleurs, chaque tuile garde
 * ses angles. Un média que la garde des fichiers retient garde sa place et dit pourquoi
 * (A1). La mise en page ne saute pas : chaque cadre déclare ses proportions.
 */
type GridProps = { media: readonly PostMediaView[]; className?: string; interactive?: boolean; bleed?: boolean }
type ViewerScope = {
  readonly source: DiasporaGaDataSource | null
  readonly contextKey: string
  readonly canDisplay: boolean
  readonly canOpen: boolean
  readonly signature: string
  readonly token: symbol
}

export function PostMediaGrid(props: GridProps) {
  const source = useOptionalDataSource()
  return source
    ? <SessionMediaGrid key={source.kind} {...props} source={source} />
    : <MediaGrid {...props} source={null} contextKey="legacy" canDisplay canOpen={false} />
}

function SessionMediaGrid(props: GridProps & { source: DiasporaGaDataSource }) {
  const session = props.source.useSession()
  const signedIn = session.status === "ready" && session.data.status === "signed_in" ? session.data : null
  const membership = signedIn?.membership
  const activeStatus = (status: string | undefined) => status === "en_attente" || status === "declaree" || status === "verifiee"
  const readable = Boolean(signedIn && membership && signedIn.account.id === membership.personId && activeStatus(membership.status) && activeStatus(membership.root.status))
  const contextKey = JSON.stringify([
    session.status, signedIn?.account.id ?? null, membership?.personId ?? null,
    membership?.status ?? null, membership?.root.status ?? null, membership?.canPublish ?? null,
  ])
  return <MediaGrid key={contextKey} media={props.media} className={props.className} bleed={props.bleed} source={props.source} contextKey={contextKey} canDisplay={readable} canOpen={readable && props.interactive !== false} />
}

/** La grille elle-même, par variante : trois, quatre et plus partagent un cadre commun (4:3). */
const GRID_CLASSES: Record<MediaGridLayout["variant"], string> = {
  none: "",
  single: "grid-cols-1",
  pair: "grid-cols-2",
  trio: "aspect-[4/3] grid-cols-2 grid-rows-2",
  quad: "aspect-[4/3] grid-cols-2 grid-rows-2",
  overflow: "aspect-[4/3] grid-cols-2 grid-rows-2",
}

/** La place d'une tuile dans sa grille. */
const AREA_CLASSES: Record<MediaGridTile["area"], string> = {
  full: "",
  half: "aspect-square",
  large: "row-span-2 min-h-0",
  stacked: "min-h-0",
  quarter: "min-h-0",
}

/**
 * L'anneau de focus d'une tuile, posé AU-DESSUS de la photo (pseudo-élément) : une ombre
 * intérieure passerait sous l'image, une ombre extérieure serait coupée au bord de la carte.
 */
const TILE_FOCUS = "outline-none after:pointer-events-none after:absolute after:inset-0 focus-visible:after:shadow-[inset_0_0_0_2px_var(--background),inset_0_0_0_4px_var(--ring)]"

function MediaGrid(props: GridProps & { source: DiasporaGaDataSource | null; contextKey: string; canDisplay: boolean; canOpen: boolean }) {
  const { t } = useDiasporaGaT()
  const count = props.media.length
  const layout = mediaGridLayout(count)
  const signature = JSON.stringify(props.media.map((item) => [item.kind, item.url, item.withheld, item.altText, item.width, item.height]))
  const scope = useMemo<ViewerScope>(() => ({ source: props.source, contextKey: props.contextKey, canDisplay: props.canDisplay, canOpen: props.canOpen, signature, token: Symbol() }), [props.source, props.contextKey, props.canDisplay, props.canOpen, signature])
  const live = useRef<ViewerScope | null>(null)
  const [selection, setSelection] = useState<{ scope: ViewerScope; index: number } | null>(null)
  const selected = selection?.scope === scope ? selection.index : 0
  const open = props.canOpen && selection?.scope === scope && props.media[selected] !== undefined

  useLayoutEffect(() => {
    live.current = scope
    return () => {
      if (live.current === scope) live.current = null
      releaseMediaViewer(scope.token)
    }
  }, [scope])

  const close = useCallback(() => {
    releaseMediaViewer(scope.token)
    if (live.current === scope) setSelection((current) => current?.scope === scope ? null : current)
  }, [scope])

  const openMedia = (index: number) => {
    const current = props.media[index]
    if (live.current !== scope || !props.canOpen || !props.canDisplay || !current || !isDelivered(current)) return
    if (!claimMediaViewer(scope.token)) return
    // Lecteur unique (DG-017) : la visionneuse ouverte, aucune autre lecture ne continue derrière elle.
    stopAllMediaPlayback()
    setSelection({ scope, index })
  }

  const select = (index: number) => {
    if (live.current !== scope || !ownsMediaViewer(scope.token) || !props.canOpen) return
    setSelection((current) => current?.scope === scope ? { scope, index: Math.min(Math.max(index, 0), count - 1) } : current)
  }

  if (count === 0) return null
  const bleed = props.bleed === true
  return (
    <>
      <div className={props.className}>
        <div
          data-media-grid={layout.variant}
          data-bleed={bleed ? "true" : undefined}
          className={cn("grid", bleed ? "gap-0.5" : "gap-1", GRID_CLASSES[layout.variant])}
        >
          {layout.tiles.map((tile) => {
            const item = props.media[tile.index]
            if (!item) return null
            return (
              <MediaTile
                key={tile.index}
                item={item}
                tile={tile}
                total={count}
                bleed={bleed}
                canDisplay={props.canDisplay}
                onOpen={props.canOpen ? () => openMedia(tile.index) : undefined}
              />
            )
          })}
        </div>
      </div>
      <ImmersiveOverlay open={open} onClose={close} label={t("post.media.viewer.title")}>
        {open ? <MediaViewerCarousel media={props.media} index={selected} canDisplay={props.canDisplay} onSelect={select} onClose={close} /> : null}
      </ImmersiveOverlay>
    </>
  )
}

function MediaTile(props: { item: PostMediaView; tile: MediaGridTile; total: number; bleed: boolean; canDisplay: boolean; onOpen?: () => void }) {
  const { t } = useDiasporaGaT()
  const { item, tile } = props
  const [failed, fail] = useLoadFailure(item.url)
  const single = tile.area === "full"
  const size = item.width && item.height ? { width: item.width, height: item.height } : null
  // Une photo seule déclare ses proportions bornées ; sans dimensions connues, elle réserve un cadre 16:9 (pas de saut au chargement).
  const ratio = single ? singleMediaRatio(item.width, item.height) : null
  const frameStyle: CSSProperties | undefined = ratio === null ? undefined : { aspectRatio: ratio }
  const frame = cn(
    "relative block min-w-0 overflow-hidden bg-muted",
    !props.bleed && "rounded-md",
    single && ratio === null && "aspect-video",
    AREA_CLASSES[tile.area],
  )

  if (!props.canDisplay || !isDelivered(item) || failed) {
    return (
      <div data-media-tile="" className={frame} style={frameStyle}>
        <MediaUnavailable item={item} failure={failed ? item.kind : null} detailed={single} className={cn("size-full min-h-0", props.bleed ? "rounded-none" : "rounded-md", single && "min-h-32")} />
      </div>
    )
  }

  // A2 : une vidéo seule est la vidéo du fil — première image, muette quand elle est la plus visible, son et pause aux boutons.
  if (item.kind === "video" && single) {
    return <FeedVideo item={item} className={frame} style={frameStyle} onError={fail} {...(props.onOpen ? { onOpen: props.onOpen } : {})} />
  }

  const content: ReactNode = item.kind === "video" ? (
    // Une vidéo parmi d'autres (le moteur la veut seule ; la grille sait l'afficher) : sa première image, la lecture en grand.
    <>
      <video src={`${item.url ?? ""}#t=0.1`} muted playsInline preload="metadata" aria-hidden tabIndex={-1} onError={fail} className="absolute inset-0 size-full object-cover" />
      <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-media-scrim text-media-ink"><PlayIcon className="size-6 fill-current" /></span>
      </span>
    </>
  ) : (
    <>
      {/* Fichier délivré par la garde du moteur (URL signée, durée bornée) : pas d'optimiseur d'images entre les deux. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- URL de la garde des fichiers, jamais réécrite */}
      <img
        src={item.url ?? undefined}
        alt={item.altText ?? t("post.media.photo")}
        loading="lazy"
        decoding="async"
        onError={fail}
        className="absolute inset-0 size-full object-cover"
        {...(size ?? {})}
      />
    </>
  )
  const more = tile.more > 0 ? (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center bg-media-scrim font-display text-3xl font-bold text-media-ink">
      {t("post.media.moreCount", { count: tile.more })}
    </span>
  ) : null

  if (!props.onOpen) {
    return <div data-media-tile="" className={frame} style={frameStyle}>{content}{more}</div>
  }
  const label = tile.more > 0
    ? t("post.media.openMore", { count: tile.more, position: tile.index + 1, total: props.total })
    : item.kind === "video" ? t("post.media.expandVideo") : t("post.media.openImage", { position: tile.index + 1, total: props.total })
  return (
    <button type="button" data-media-tile="" onClick={props.onOpen} aria-label={label} className={cn(frame, TILE_FOCUS)} style={frameStyle}>
      {content}
      {more}
      {single ? <span aria-hidden className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-card/90 text-foreground"><Maximize2Icon className="size-4" /></span> : null}
    </button>
  )
}
