"use client"

/**
 * AS-08 : les gestes de qui anime le groupe d'une association (responsable, animateur),
 * sous une carte du mur : épingler en tête ou désépingler, retirer du groupe. Le moteur
 * relit l'autorité vivante à chaque geste ; l'auteur retire sa propre publication par le
 * menu de la carte, comme dans le fil.
 */
import { Button } from "@diasporale/features"
import type { ActionErrorCode, ActionResult, AssociationGroupWallCapability, PostView } from "@diasporale/features/data"
import { useDiasporaleT } from "@diasporale/features/i18n/client"
import { PinIcon, PinOffIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ConfirmSheet } from "./service-request-sheets"

export interface GroupPostModerationProps {
  readonly groupId: string
  readonly post: PostView
  readonly pinnedPostId: string | null
  /** L'épingle lue est sûre : tant qu'elle se charge, le geste attend. */
  readonly pinReady: boolean
  readonly wall: AssociationGroupWallCapability
  readonly remove: (input: { readonly groupId: string; readonly postId: string; readonly isMine: boolean }) => Promise<ActionResult>
}

export function GroupPostModeration(props: GroupPostModerationProps) {
  const { t } = useDiasporaleT()
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const locked = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const pinned = props.pinnedPostId === props.post.id
  const PinGlyph = pinned ? PinOffIcon : PinIcon

  const togglePin = async () => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    try {
      const result = pinned ? await props.wall.unpin(props.groupId) : await props.wall.pin({ groupId: props.groupId, postId: props.post.id })
      if (!mounted.current) return
      if (!result.ok) toast.error(t(`errors.${result.code}`))
      else toast.success(t(pinned ? "associationActivities.group.unpinned" : "associationActivities.group.pinned"))
    } catch {
      if (mounted.current) toast.error(t("errors.unknown"))
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const confirmRemove = async (): Promise<ActionErrorCode | null> => {
    const result = await props.remove({ groupId: props.groupId, postId: props.post.id, isMine: props.post.isMine })
    if (!result.ok) return result.code
    toast.success(t("associationActivities.group.removed"))
    return null
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" disabled={busy || !props.pinReady} aria-busy={busy} onClick={() => void togglePin()} className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-left">
        <PinGlyph aria-hidden />
        <span className="min-w-0 break-words">{t(pinned ? "associationActivities.group.unpin" : "associationActivities.group.pin")}</span>
      </Button>
      <Button variant="ghost" onClick={() => setRemoving(true)} className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-left">
        <Trash2Icon aria-hidden />
        <span className="min-w-0 break-words">{t("associationActivities.group.removePost")}</span>
      </Button>
      {removing ? (
        <ConfirmSheet
          open
          onOpenChange={(open) => { if (!open) setRemoving(false) }}
          title={t("associationActivities.group.removePost")}
          description={t("associationActivities.group.removeDescription")}
          confirmLabel={t("associationActivities.group.removePost")}
          destructive
          onConfirm={confirmRemove}
        />
      ) : null}
    </div>
  )
}
