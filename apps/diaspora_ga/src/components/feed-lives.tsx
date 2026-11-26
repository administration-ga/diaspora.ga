// Dupliqué d'ANTSIA packages/social-features/src/features/direct/DirectsLiveRail.tsx @ 547b80bc — adaptations : primitives, jetons et textes de DIASPORA.GA (carte, avatar à initiales, fragment i18n du live) au lieu de ceux du moteur ; une seule cible par live, la ligne entière de 48 px vers sa page (`routes.conference`), au lieu d'un avatar de 32 px vers le profil ; point « en direct » qui ne pulse que si le mouvement est permis ; RIEN pendant la lecture, en cas d'échec ou sans live (la fenêtre précédente reste affichée pendant que « Voir plus » lit la suivante) ; instant relu chaque minute ; monté seulement l'interrupteur du direct ouvert, le moteur branché et iCom ouvert (la page du live l'exige).
"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Avatar, Button, Card, cn } from "@diaspora-ga/features"
import { useDiasporaGaT } from "@diaspora-ga/features/i18n/client"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import NextLink from "next/link"
import { useEffect, useId, useState } from "react"

import { IcomIsland, useIcomNetwork } from "@/components/icom"
import { publicEnv } from "@/lib/env"
import { conferenceRouteServed } from "@/lib/live"
import { routes } from "@/lib/routes"

/** Trois lives par fenêtre, comme le rail du moteur ; « Voir plus » lit la suivante. */
export const LIVES_NOW_WINDOW = 3

/** L'instant des « depuis … min » avance d'une minute à la fois. */
const MINUTE_MS = 60_000

type LiveWindow = FunctionReturnType<typeof api.modules.live.sessions.listLive>
type LiveCursor = FunctionArgs<typeof api.modules.live.sessions.listLive>["cursor"]

/**
 * Les lives EN COURS du réseau (lot `live` du moteur, requête `listLive` de ses sessions), comme le rail des
 * directs d'antsia.ga et d'administration.ga (`DirectsLiveRail`, dernier module du rail droit de
 * découverte de leur page réseau, après les évènements).
 *
 * Sur diaspora.ga, la même carte à deux places, une seule visible selon la largeur : au rail droit
 * du fil dès 1 280 px, après les évènements (l'ordre des applications de référence) ; sous 1 280 px,
 * où le rail droit est retiré, en tête du fil sous le bandeau des actus — le bandeau, lui, se tait
 * tant qu'aucune actu n'est en ligne, et un live ne doit pas rester invisible au téléphone.
 *
 * Monté seulement quand la page d'un live est servie (interrupteur du direct ouvert ET moteur comme
 * source, `conferenceRouteServed`) et qu'iCom est ouvert pour ce membre (la page du live l'exige :
 * l'hôte du direct vit dans la couche de communication). Sans live en cours : rien du tout.
 */
export function FeedLives(props: { now: number; className?: string }) {
  const icom = useIcomNetwork()
  if (!conferenceRouteServed(publicEnv.dataSource) || icom === null) return null
  return (
    <IcomIsland key={`${icom.networkId}:${icom.personId}`} network={icom}>
      <LivesNowCard now={props.now} {...(props.className === undefined ? {} : { className: props.className })} />
    </IcomIsland>
  )
}

/** La fenêtre précédente, gardée pendant que la suivante se lit : la carte ne disparaît pas sous le doigt. */
function useSettledWindow(current: LiveWindow | undefined): LiveWindow | null {
  const [settled, setSettled] = useState<LiveWindow | null>(null)
  useEffect(() => {
    if (current !== undefined) setSettled(current)
  }, [current])
  return current ?? settled
}

function LivesNowCard(props: { now: number; className?: string }) {
  const { t } = useDiasporaGaT()
  const { networkId } = useNetwork()
  const headingId = useId()
  const [cursor, setCursor] = useState<LiveCursor>()
  const [now, setNow] = useState(props.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(timer)
  }, [])
  const query = useAuthenticatedConvexQuery(api.modules.live.sessions.listLive, { networkId, limit: LIVES_NOW_WINDOW, ...(cursor === undefined ? {} : { cursor }) })
  const shown = useSettledWindow(query.isError ? undefined : query.data)
  // Rien n'est affirmé avant la première lecture ni après un échec ; sans live (ni suite), rien non plus.
  if (query.isError || shown === null || (shown.items.length === 0 && shown.nextCursor === null)) return null
  const reading = query.data === undefined
  return (
    <Card data-lives-now="" className={cn("p-4", props.className)}>
      <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
        <h2 id={headingId} className="flex items-center gap-2 font-display text-lg font-bold">
          {/* Le point « en direct » : il ne pulse que si le mouvement est permis. */}
          <span data-live-dot="" aria-hidden className="size-2.5 shrink-0 rounded-full bg-danger-fill motion-safe:animate-pulse" />
          {t("feed.lives.title")}
        </h2>
        {shown.items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {shown.items.map((card) => {
              const host = card.host.displayName ?? t("feed.lives.someone")
              const minutes = Math.max(0, Math.floor((now - card.startedAt) / MINUTE_MS))
              return (
                <li key={card.sessionId}>
                  <NextLink
                    href={routes.conference(card.sessionId)}
                    className="flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted focus-visible:shadow-focus"
                  >
                    <Avatar id={card.host.handle ?? card.sessionId} name={host} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{card.title}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {minutes === 0 ? t("feed.lives.justStarted", { host }) : t("feed.lives.since", { host, minutes })}
                      </span>
                    </span>
                  </NextLink>
                </li>
              )
            })}
          </ul>
        ) : (
          // Une fenêtre bornée peut ne rien garder d'accessible alors qu'il en reste plus loin.
          <p className="text-[13px] text-muted-foreground">{t("feed.lives.emptyWindow")}</p>
        )}
        {shown.nextCursor !== null ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 self-start"
            disabled={reading}
            aria-busy={reading || undefined}
            onClick={() => {
              if (shown.nextCursor !== null) setCursor(shown.nextCursor)
            }}
          >
            {t("feed.lives.more")}
          </Button>
        ) : null}
      </section>
    </Card>
  )
}
