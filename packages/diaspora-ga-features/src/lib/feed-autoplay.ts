// Dupliqué de UDB_GA convex/lib/communityLive.ts (LIVE_AUTOPLAY_MIN_RATIO, pickLiveAutoplay), apps/udb-web/src/stores/live-theater-store.ts (liveAutoplayStore, useLiveAutoplay) et apps/udb-web/src/components/community-social/live/live-feed-preview.tsx (mesure de visibilité de useLiveCardInView) @ ca31436b4 (origin/demo) — adaptations : noms anglais du code DIASPORA.GA, une seule règle pour les vidéos du fil (les directs n'y sont pas encore), aucun magasin de « théâtre » (la visionneuse est dite par le bail de `media-viewer-lease`), économie de données et mouvement réduit tenus par `usePlaybackEnvironment` côté composant, désactivable par l'appelant (découverte), commentaires en français, aucun import d'UDB.
"use client"

/**
 * Une seule vidéo du fil joue à la fois : la plus visible (A2, 25/11/2026, sur le modèle
 * d'UDB, CH-343). Chaque vidéo dit quelle part d'elle est à l'écran ; la règle pure
 * `pickMostVisible` désigne celle dont c'est le tour. Celle qui joue garde la main tant
 * qu'elle reste assez visible (pas de bascule à chaque pixel de défilement).
 *
 * Ce magasin ne lance rien : il dit à qui est le tour. Le composant décide ensuite, avec
 * l'environnement (mouvement réduit, économie de données, onglet, visionneuse, appel).
 */
import { useEffect, useSyncExternalStore, type RefObject } from "react"

/** Part visible d'une vidéo au-dessous de laquelle elle ne joue pas. */
export const FEED_AUTOPLAY_MIN_RATIO = 0.5

const VISIBILITY_THRESHOLDS = Array.from({ length: 11 }, (_, index) => index / 10)

/**
 * La vidéo dont c'est le tour : celle qui joue garde la main tant qu'elle reste assez
 * visible, sinon la plus visible la prend (à égalité, la première vue).
 */
export function pickMostVisible(ratios: ReadonlyMap<string, number>, current: string | null): string | null {
  if (current !== null && (ratios.get(current) ?? 0) >= FEED_AUTOPLAY_MIN_RATIO) return current
  let best: string | null = null
  let bestRatio = FEED_AUTOPLAY_MIN_RATIO
  for (const [id, ratio] of ratios) {
    if (ratio >= bestRatio && (best === null || ratio > bestRatio)) {
      best = id
      bestRatio = ratio
    }
  }
  return best
}

const ratios = new Map<string, number>()
let turn: string | null = null
const listeners = new Set<() => void>()

function recompute(): void {
  const next = pickMostVisible(ratios, turn)
  if (next === turn) return
  turn = next
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const feedAutoplay = {
  /** La part visible d'une vidéo ; trop peu visible, elle sort de la course. */
  report(id: string, ratio: number): void {
    if (ratio < FEED_AUTOPLAY_MIN_RATIO / 2) ratios.delete(id)
    else ratios.set(id, ratio)
    recompute()
  },
  /** La vidéo quitte l'écran pour de bon (démontage). */
  release(id: string): void {
    ratios.delete(id)
    recompute()
  },
  current(): string | null {
    return turn
  },
}

/**
 * Le tour de cette vidéo, mesuré sur son cadre : la part visible est rapportée à l'écran
 * quand le cadre est plus haut que lui. Sans observateur (ancien navigateur, rendu
 * serveur) ou désactivé (`enabled` faux : la découverte tient sa propre lecture), jamais
 * son tour, et aucun observateur n'est créé.
 */
export function useFeedAutoplayTurn(id: string, frame: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  useEffect(() => {
    const node = frame.current
    if (!enabled || node === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const height = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? window.innerHeight)
        const ratio = entry.isIntersecting && height > 0 ? Math.min(1, entry.intersectionRect.height / height) : 0
        feedAutoplay.report(id, ratio)
      }
    }, { threshold: VISIBILITY_THRESHOLDS })
    observer.observe(node)
    return () => {
      observer.disconnect()
      feedAutoplay.release(id)
    }
  }, [id, frame, enabled])
  const current = useSyncExternalStore(subscribe, feedAutoplay.current, () => null)
  return enabled && current === id
}
