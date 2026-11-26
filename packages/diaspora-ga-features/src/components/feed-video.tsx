// Dupliqué de UDB_GA apps/udb-web/src/components/community-social/feed-video.tsx @ ca31436b4 (origin/demo) — adaptations : bâtie sur le lecteur unique de DIASPORA.GA (`ExclusiveVideo`, `media-viewer-lease`) et sur `usePlaybackEnvironment` (aucune lecture d'office sous mouvement réduit, en économie de données, onglet masqué, visionneuse ouverte ou pendant un appel) ; bouton de lecture et de pause en plus du son (pause d'une image animée, WCAG 2.2.2) ; une pause choisie tient tant que la vidéo reste à l'écran ; l'ouverture en grand par un bouton qui couvre l'image ; l'échec est rendu par la tuile (repli A1) ; découverte « gérée » sans observateur ; couleurs par jetons (`bg-media-scrim`, `text-media-ink`), textes par i18n, icônes lucide-react ; aucun import d'UDB.
"use client"

import { Maximize2Icon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"

import type { PostMediaView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { useFeedAutoplayTurn } from "../lib/feed-autoplay"
import { usePlaybackEnvironment } from "./discovery/playback-environment"
import { ExclusiveVideo } from "./media-parts"

/**
 * Lecture muette automatique de la vidéo la plus visible du fil (A2, demande du
 * propriétaire, à confirmer selon la note de décision du 25/11/2026). `false` : la vidéo
 * ne joue plus que d'un geste (« Lire »), tout le reste demeure.
 */
export const FEED_VIDEO_AUTOPLAY = true

/**
 * La découverte verticale tient sa propre lecture (`useDiscoveryPlayback`) : sous ce
 * fournisseur, la vidéo du fil n'observe rien et ne lance rien ; ses boutons de son et de
 * pause restent des gestes, que la découverte lit par les événements de la `<video>`.
 */
const ManagedPlaybackContext = createContext(false)

export function ManagedMediaPlayback(props: { children: ReactNode }) {
  return <ManagedPlaybackContext.Provider value>{props.children}</ManagedPlaybackContext.Provider>
}

/** `play()` rend une promesse dans les navigateurs, parfois rien ailleurs : les deux sont tenus. */
function attempt(play: () => Promise<void> | undefined, onRefused: (error: unknown) => void): void {
  try {
    const result = play()
    if (result !== undefined && typeof result.catch === "function") result.catch(onRefused)
  } catch (error) {
    onRefused(error)
  }
}

/**
 * Une vidéo du fil (A2) : sa première image (`#t=0.1`, l'affiche manquant au moteur),
 * muette et en boucle quand c'est son tour (la plus visible), en pause hors de l'écran ;
 * le son et la pause aux boutons de 44 px ; toucher l'image l'ouvre en grand, avec les
 * commandes natives. L'échec de lecture remonte à la tuile, qui le dit (A1).
 */
export function FeedVideo(props: {
  readonly item: PostMediaView
  readonly className: string
  readonly style?: CSSProperties
  readonly onOpen?: () => void
  readonly onError: () => void
}) {
  const { t } = useDiasporaGaT()
  const managed = useContext(ManagedPlaybackContext)
  const id = useId()
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const environment = usePlaybackEnvironment()
  const myTurn = useFeedAutoplayTurn(id, frame, !managed)
  const autoplay = FEED_VIDEO_AUTOPLAY && !managed && !environment.reducedMotion && !environment.saveData
  const blocked = !environment.visible || environment.viewerOpen || environment.suspended
  const [muted, setMuted] = useState(true)
  const [running, setRunning] = useState(false)
  // Une pause choisie par la personne : tenue tant que la vidéo garde son tour.
  const manualPause = useRef(false)

  // Le tour perdu (hors de l'écran, une autre plus visible) : elle se tait, et la pause choisie est oubliée.
  useEffect(() => {
    if (managed || myTurn) return
    manualPause.current = false
    const node = video.current
    if (node !== null && !node.paused) node.pause()
  }, [managed, myTurn])

  // Son tour, et rien ne s'y oppose : elle joue, muette sauf si la personne a mis le son.
  useEffect(() => {
    if (managed) return
    const node = video.current
    if (node === null) return
    if (blocked) {
      if (!node.paused) node.pause()
      return
    }
    if (!myTurn || !autoplay || manualPause.current || !node.paused) return
    attempt(() => node.play(), (error) => {
      // Le son exige un geste que le navigateur n'a pas vu : on relance en silence plutôt que de rester sur l'image.
      if (error instanceof DOMException && error.name === "NotAllowedError" && !node.muted) {
        node.muted = true
        setMuted(true)
        attempt(() => node.play(), () => undefined)
      }
    })
  }, [managed, myTurn, autoplay, blocked])

  const togglePlayback = () => {
    const node = video.current
    if (node === null) return
    if (node.paused) {
      manualPause.current = false
      attempt(() => node.play(), () => undefined)
    } else {
      manualPause.current = true
      node.pause()
    }
  }

  const toggleSound = () => {
    const node = video.current
    if (node === null) return
    node.muted = !node.muted
    setMuted(node.muted)
  }

  const url = props.item.url ?? ""
  return (
    <div className="min-w-0">
      <div ref={frame} data-media-tile="" className={cn(props.className, "bg-muted")} style={props.style}>
        <ExclusiveVideo
          mediaRef={video}
          // Sans affiche, la première image d'une vidéo envoyée ne s'affiche qu'à partir d'un instant donné (Safari).
          src={`${url}#t=0.1`}
          muted={muted}
          loop
          playsInline
          preload={environment.saveData ? "none" : myTurn && autoplay ? "auto" : "metadata"}
          aria-label={props.item.altText ?? t("post.media.video")}
          onPlay={() => setRunning(true)}
          onPause={() => setRunning(false)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          onError={props.onError}
          className="absolute inset-0 size-full object-cover"
          {...(props.item.width && props.item.height ? { width: props.item.width, height: props.item.height } : {})}
        />
        {props.onOpen ? (
          <button
            type="button"
            onClick={() => { video.current?.pause(); props.onOpen?.() }}
            aria-label={t("post.media.expandVideo")}
            className="absolute inset-0 outline-none after:pointer-events-none after:absolute after:inset-0 focus-visible:after:shadow-[inset_0_0_0_2px_var(--background),inset_0_0_0_4px_var(--ring)]"
          >
            <span aria-hidden className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-media-scrim text-media-ink">
              <Maximize2Icon className="size-4" />
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={t(running ? "post.media.playback.pause" : "post.media.playback.play")}
          className="absolute bottom-2.5 left-2.5 z-10 grid size-11 place-items-center rounded-full bg-media-scrim text-media-ink transition-none focus-visible:shadow-focus"
        >
          {running ? <PauseIcon className="size-5 fill-current" aria-hidden /> : <PlayIcon className="size-5 fill-current" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={t(muted ? "post.media.playback.unmute" : "post.media.playback.mute")}
          className="absolute bottom-2.5 right-2.5 z-10 grid size-11 place-items-center rounded-full bg-media-scrim text-media-ink transition-none focus-visible:shadow-focus"
        >
          {muted ? <VolumeXIcon className="size-5" aria-hidden /> : <Volume2Icon className="size-5" aria-hidden />}
        </button>
      </div>
    </div>
  )
}
