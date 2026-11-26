"use client"

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react"

import type { PostMediaView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { usePlaybackEnvironment } from "./discovery/playback-environment"
import { ExclusiveVideo, isDelivered, MediaUnavailable, useLoadFailure } from "./media-parts"

/**
 * La visionneuse des médias d'une publication (A6, 25/11/2026) : plein écran, un
 * défilement horizontal où chaque média occupe la largeur (accroche CSS
 * `scroll-snap`, sans dépendance) — balayage au doigt, flèches à l'écran et au
 * clavier, Échap pour fermer (porté par `ImmersiveOverlay`), position dite « 2 / N »
 * et annoncée en toutes lettres. Une seule diapositive se lit à la fois : les autres
 * sont inertes. Seules la courante et ses voisines montent leur fichier, et jamais un
 * média retenu par la garde des fichiers.
 *
 * L'index fait foi : les boutons et le clavier le changent et le défilement suit ; un
 * balayage le change en retour. Sous mouvement réduit, le défilement saute sans glisser.
 */
export function MediaViewerCarousel(props: {
  readonly media: readonly PostMediaView[]
  readonly index: number
  readonly canDisplay: boolean
  readonly onSelect: (index: number) => void
  readonly onClose: () => void
}) {
  const { t } = useDiasporaGaT()
  const { reducedMotion } = usePlaybackEnvironment()
  const rail = useRef<HTMLDivElement>(null)
  // L'index vient du défilement lui-même : le défilement ne le rejoue pas.
  const fromScroll = useRef(false)
  // Un glissement lancé par un bouton : les positions traversées ne s'annoncent pas.
  const target = useRef<number | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opened = useRef(false)
  const total = props.media.length
  const index = Math.min(Math.max(props.index, 0), Math.max(total - 1, 0))

  useLayoutEffect(() => {
    const node = rail.current
    const first = !opened.current
    opened.current = true
    if (node === null) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    const width = node.clientWidth
    if (width <= 0) return
    const left = index * width
    if (Math.abs(node.scrollLeft - left) < 1) return
    const smooth = !first && !reducedMotion
    target.current = smooth ? index : null
    if (settle.current !== null) clearTimeout(settle.current)
    // Un glissement interrompu ne doit jamais geler le balayage : la cible se lâche d'elle-même.
    if (smooth) settle.current = setTimeout(() => { target.current = null }, 900)
    if (typeof node.scrollTo === "function") node.scrollTo({ left, behavior: smooth ? "smooth" : "auto" })
    else node.scrollLeft = left
  }, [index, reducedMotion])

  useEffect(() => () => { if (settle.current !== null) clearTimeout(settle.current) }, [])

  // Une vidéo quittée se tait : seule la diapositive courante peut jouer.
  useEffect(() => {
    const node = rail.current
    if (node === null) return
    node.querySelectorAll<HTMLElement>("[data-media-slide]").forEach((slide, position) => {
      if (position === index) return
      slide.querySelectorAll("video").forEach((video) => { if (!video.paused) video.pause() })
    })
  }, [index])

  const onScroll = () => {
    const node = rail.current
    if (node === null) return
    const width = node.clientWidth
    if (width <= 0) return
    const next = Math.min(total - 1, Math.max(0, Math.round(node.scrollLeft / width)))
    if (target.current !== null) {
      if (next === target.current) target.current = null
      return
    }
    if (next !== index) {
      fromScroll.current = true
      props.onSelect(next)
    }
  }

  // La personne reprend la main (doigt, souris, molette) : un glissement en cours ne la retient pas.
  const release = () => { target.current = null }

  const move = (offset: number) => {
    const next = Math.min(Math.max(index + offset, 0), total - 1)
    if (next !== index) props.onSelect(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || total < 2 || (event.target instanceof Element && event.target.closest("video"))) return
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      move(event.key === "ArrowLeft" ? -1 : 1)
    }
  }

  return (
    <div role="group" tabIndex={-1} aria-label={t("post.media.viewer.title")} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {t("post.media.viewer.position", { position: index + 1, total })}
        </p>
        <p aria-hidden className="font-mono text-sm font-medium tabular-nums">
          {t("post.media.viewer.positionShort", { position: index + 1, total })}
        </p>
        <button type="button" onClick={props.onClose} aria-label={t("common.close")} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:shadow-focus">
          <XIcon className="size-5" aria-hidden />
        </button>
      </div>
      <div
        ref={rail}
        role="region"
        aria-roledescription={t("post.media.viewer.carousel")}
        aria-label={t("post.media.viewer.title")}
        onScroll={onScroll}
        onPointerDown={release}
        onWheel={release}
        onTouchStart={release}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {props.media.map((item, position) => {
          const current = position === index
          return (
            <div
              key={position}
              data-media-slide=""
              role="group"
              aria-roledescription={t("post.media.viewer.slideRole")}
              aria-label={t("post.media.viewer.slide", { position: position + 1, total })}
              aria-hidden={current ? undefined : true}
              inert={!current}
              className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center overflow-hidden p-3"
            >
              {Math.abs(position - index) <= 1 ? <ViewerMedia item={item} canDisplay={props.canDisplay} /> : null}
            </div>
          )
        })}
      </div>
      {total > 1 ? (
        <div className="flex shrink-0 justify-between gap-3 border-t border-border px-4 py-2">
          <button type="button" onClick={() => move(-1)} disabled={index === 0} aria-label={t("post.media.viewer.previous")} className="grid size-11 place-items-center rounded-full hover:bg-muted focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-55">
            <ChevronLeftIcon className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => move(1)} disabled={index === total - 1} aria-label={t("post.media.viewer.next")} className="grid size-11 place-items-center rounded-full hover:bg-muted focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-55">
            <ChevronRightIcon className="size-5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ViewerMedia(props: { item: PostMediaView; canDisplay: boolean }) {
  const { t } = useDiasporaGaT()
  const { item } = props
  const [failed, fail] = useLoadFailure(item.url)
  if (!props.canDisplay || !isDelivered(item) || failed) return <MediaUnavailable item={item} failure={failed ? item.kind : null} detailed className="w-full max-w-xl" />
  const size = item.width && item.height ? { width: item.width, height: item.height } : {}
  return item.kind === "video" ? (
    <ExclusiveVideo src={item.url ?? undefined} controls tabIndex={0} preload="metadata" playsInline aria-label={item.altText ?? t("post.media.video")} onError={fail} className="max-h-full max-w-full object-contain" {...size} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- URL délivrée par la garde, sans copie ni optimiseur
    <img src={item.url ?? undefined} alt={item.altText ?? t("post.media.photo")} decoding="async" onError={fail} className="max-h-full max-w-full object-contain" {...size} />
  )
}
