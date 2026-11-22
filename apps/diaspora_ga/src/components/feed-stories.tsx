"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { StoriesStyles, StoriesTray, storyQueryInstant } from "@antsia/social-features/stories"
import { useSession } from "@diaspora-ga/features/data"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { IcomIsland, useEngineNetwork } from "@/components/icom"
import { routes } from "@/lib/routes"

/**
 * Le bandeau du moteur, aux deux paliers du fil ; même accès que le lecteur /actus.
 *
 * CH-816 (P2) : sans aucune actu à montrer, rien — pas même la tuile « Créer une actu », qui
 * resterait seule en tête du fil ; créer une actu reste dans le menu « Créer » de la coque. Dès
 * la première actu, le bandeau est celui du moteur, tuile comprise.
 */
export function FeedStories(props: { now: number }) {
  const network = useEngineNetwork()
  const session = useSession()
  const membership = session.status === "ready" && session.data.status === "signed_in" ? session.data.membership : null
  if (network === null || membership === null || membership.status === "partie" || membership.status === "suspendue" || network.personId !== membership.personId) return null
  const canCreate = membership.canPublish
  return (
    <IcomIsland key={`${network.networkId}:${network.personId}:${canCreate}`} network={network}>
      <EngineStoriesTray now={props.now} canCreate={canCreate} />
    </IcomIsland>
  )
}

/**
 * Y a-t-il une actu à montrer ? `null` tant que la première lecture n'a pas répondu. Quand
 * l'instant des lectures avance d'un pas, la réponse précédente tient le temps que le pas suivant
 * réponde : le bandeau ne disparaît pas pour revenir (même règle que le plateau du moteur).
 */
function useHasStories(groups: readonly unknown[] | undefined): boolean | null {
  const current = groups === undefined ? null : groups.length > 0
  const [settled, setSettled] = useState<boolean | null>(null)
  useEffect(() => {
    if (current !== null) setSettled(current)
  }, [current])
  return current ?? settled
}

function EngineStoriesTray(props: { now: number; canCreate: boolean }) {
  const router = useRouter()
  const { networkId } = useNetwork()
  const me = useAuthenticatedConvexQuery(api.modules.people.persons.getMyPerson, {})
  const [now, setNow] = useState(props.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  // La lecture même du bandeau (mêmes arguments, donc un seul abonnement) : elle dit s'il y a une actu.
  const tray = useAuthenticatedConvexQuery(api.modules.stories.stories.tray, { networkId, now: storyQueryInstant(now) })
  const hasStories = useHasStories(tray.data?.groups)
  if (hasStories !== true) return null
  return (
    <>
      <StoriesStyles />
      <StoriesTray
        myHandle={me.data?.published === true ? (me.data.handle ?? null) : null}
        myAvatarUrl={me.data?.avatar?.url ?? null}
        canCreate={props.canCreate}
        now={now}
        onOpen={(handle) => router.push(routes.story(handle))}
        onCreate={() => {
          if (props.canCreate) router.push(routes.newStory())
        }}
      />
    </>
  )
}
