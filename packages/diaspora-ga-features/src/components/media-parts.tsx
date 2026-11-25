"use client"

import { ImageOffIcon, LoaderCircleIcon, ShieldAlertIcon, ShieldQuestionIcon, VideoOffIcon, type LucideIcon } from "lucide-react"
import { useCallback, useId, useState, type ComponentProps, type RefObject } from "react"

import type { PostMediaView } from "../data/types"
import { useDiasporaGaT } from "../i18n/client"
import { cn } from "../lib/cn"
import { claimMediaPlayback, registerMediaPlayer } from "../lib/media-viewer-lease"

/**
 * Les pièces communes à la grille des médias, à la visionneuse et à la vidéo du fil :
 * ce qu'est un média délivré, ce que dit un média qui ne l'est pas (A1), le repli au
 * chargement, et la `<video>` inscrite au lecteur unique (DG-017).
 */

/** Délivré : aucune retenue de la garde des fichiers, et une adresse. */
export function isDelivered(item: PostMediaView): boolean {
  return item.withheld === null && item.url !== null && item.url.trim().length > 0
}

/** Un média qui ne se charge pas (lien expiré, fichier illisible) : la cause se dit à sa place, sans lien mort. */
export type MediaFailure = PostMediaView["kind"] | null

/**
 * Ce que dit une tuile non délivrée (A1, 25/11/2026) : la vraie cause, jamais un
 * « Média indisponible » générique quand on la connaît — analyse en cours, analyse
 * impossible pour le moment (le texte long du moteur, `errors:fileScanUnavailable`,
 * en description), bloqué, ou un fichier qui ne se charge pas.
 */
function unavailableCopy(item: PostMediaView, failure: MediaFailure, t: (key: string) => string): { label: string; detail: string | null; Icon: LucideIcon; spinning: boolean } {
  if (failure === "image") return { label: t("post.media.photoFailed"), detail: null, Icon: ImageOffIcon, spinning: false }
  if (failure === "video") return { label: t("post.media.videoFailed"), detail: null, Icon: VideoOffIcon, spinning: false }
  if (item.withheld === "scan_pending") return { label: t("post.media.scanPending"), detail: null, Icon: LoaderCircleIcon, spinning: true }
  if (item.withheld === "scan_unavailable") return { label: t("post.media.scanUnavailable"), detail: t("errors:fileScanUnavailable"), Icon: ShieldQuestionIcon, spinning: false }
  if (item.withheld === "quarantined") return { label: t("post.media.quarantined"), detail: null, Icon: ShieldAlertIcon, spinning: false }
  return { label: t("post.media.unavailable"), detail: null, Icon: ImageOffIcon, spinning: false }
}

export function MediaUnavailable(props: { item: PostMediaView; failure?: MediaFailure; detailed?: boolean; className?: string }) {
  const { t } = useDiasporaGaT()
  const detailId = useId()
  const copy = unavailableCopy(props.item, props.failure ?? null, t)
  const Icon = copy.Icon
  return (
    <div
      role="img"
      aria-label={copy.label}
      aria-describedby={copy.detail ? detailId : undefined}
      className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-md bg-muted p-4 text-center text-[13px] text-muted-foreground", props.className)}
    >
      <Icon className={cn("size-5 shrink-0", copy.spinning && "animate-spin motion-reduce:animate-none")} aria-hidden />
      <span aria-hidden>{copy.label}</span>
      {/* La cause longue : lue en description ; montrée quand la tuile a la place de la dire. */}
      {copy.detail ? <span id={detailId} className={props.detailed ? "max-w-sm text-[13px]" : "sr-only"}>{copy.detail}</span> : null}
    </div>
  )
}

/** L'adresse qui a échoué au chargement ; une autre adresse (garde relue) repart sans repli. */
export function useLoadFailure(url: string | null): readonly [boolean, () => void] {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return [failedUrl !== null && failedUrl === url, () => setFailedUrl(url)] as const
}

/**
 * Une `<video>` native inscrite au lecteur unique (DG-017) : la lancer met en
 * pause toute autre lecture de l'onglet, et une suspension (appel en cours) la
 * refuse. Le DOM rendu, commandes natives comprises, reste celui d'une vidéo
 * ordinaire ; le démontage la désinscrit, le registre reste donc borné.
 */
export function ExclusiveVideo({ mediaRef, onPlay, ...props }: Omit<ComponentProps<"video">, "ref"> & { mediaRef?: RefObject<HTMLVideoElement | null> }) {
  const [token] = useState(() => Symbol("lecteur"))
  const attach = useCallback((node: HTMLVideoElement | null) => {
    if (mediaRef) mediaRef.current = node
    if (node === null) return
    const unregister = registerMediaPlayer(token, node)
    return () => {
      unregister()
      if (mediaRef && mediaRef.current === node) mediaRef.current = null
    }
  }, [mediaRef, token])
  return <video {...props} ref={attach} onPlay={(event) => { claimMediaPlayback(token); onPlay?.(event) }} />
}
