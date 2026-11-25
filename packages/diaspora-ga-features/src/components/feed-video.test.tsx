// Dupliqué de UDB_GA apps/udb-web/src/components/community-social/feed-video.test.tsx @ ca31436b4 (origin/demo) — adaptations : Testing Library et le fournisseur de DIASPORA.GA au lieu d'un rendu React nu, textes par i18n, scénarios propres à DIASPORA.GA ajoutés (pause choisie, mouvement réduit, économie de données, appel, découverte gérée) ; les tests « la plus visible », « le son ne vient que du bouton » et l'observateur simulé `show` viennent d'UDB.
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DataSourceProvider } from "../data/context"
import type { DiasporaGaDataSource } from "../data/port"
import type { Loadable, MembershipView, PostMediaView, SessionView } from "../data/types"
import { getFixedT } from "../i18n"
import { I18nProvider } from "../i18n/client"
import { pickMostVisible } from "../lib/feed-autoplay"
import { suspendMediaPlayback } from "../lib/media-viewer-lease"
import { ManagedMediaPlayback } from "./feed-video"
import { PostMediaGrid } from "./post-media"

/**
 * A2 (25/11/2026) — la vidéo du fil comme dans UDB : sa première image, muette et en
 * boucle quand elle est la plus visible du fil, en pause hors de l'écran, le son et la
 * pause au bouton (44 px), l'échec dit. Jamais d'elle-même sous mouvement réduit ni en
 * économie de données ; jamais derrière la visionneuse ni pendant un appel. Dans la
 * découverte, qui tient sa propre lecture, elle ne décide rien.
 */
const t = getFixedT("fr")
const member: MembershipView = {
  personId: "person-lecteur", handle: "lecteur", displayName: "Lecteur de recette", status: "declaree", badges: [],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: null, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "reinforced", directoryVisibility: "hidden",
}
const session: Loadable<SessionView> = { status: "ready", data: { status: "signed_in", account: { id: member.personId, idn: null, local: null, nameHints: {} }, membership: member } }
const source = { kind: "engine", useSession: () => session } as DiasporaGaDataSource
const clip = (name: string): PostMediaView => ({ kind: "video", url: `/recette-${name}.mp4`, withheld: null, altText: `Vidéo ${name}`, width: 640, height: 360 })

type Observed = { callback: IntersectionObserverCallback; nodes: Set<Element> }
const observers = new Set<Observed>()
let constructed = 0

/** Fait voir au fil une part d'un cadre de vidéo (0 = hors de l'écran, 1 = entier). */
function show(node: Element, ratio: number) {
  for (const observer of observers) {
    if (!observer.nodes.has(node)) continue
    const entry = {
      target: node,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      boundingClientRect: { height: 400 },
      intersectionRect: { height: 400 * ratio },
      rootBounds: { height: 800 },
    } as unknown as IntersectionObserverEntry
    act(() => observer.callback([entry], {} as IntersectionObserver))
  }
}

const playing = new Set<HTMLMediaElement>()
let play: ReturnType<typeof vi.spyOn>

function setMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    }),
  })
}

function tree(media: readonly (readonly PostMediaView[])[], managed = false) {
  const grids = media.map((items, index) => <PostMediaGrid key={index} media={items} />)
  return <I18nProvider locale="fr"><DataSourceProvider source={source}>{managed ? <ManagedMediaPlayback>{grids}</ManagedMediaPlayback> : grids}</DataSourceProvider></I18nProvider>
}

const frames = (container: HTMLElement) => [...container.querySelectorAll("[data-media-tile]")]
const videoOf = (name: string) => screen.getByLabelText(`Vidéo ${name}`) as HTMLVideoElement

beforeEach(() => {
  playing.clear()
  observers.clear()
  constructed = 0
  setMatchMedia(false)
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined })
  vi.stubGlobal("IntersectionObserver", class {
    private observed: Observed
    constructor(callback: IntersectionObserverCallback) {
      constructed += 1
      this.observed = { callback, nodes: new Set() }
      observers.add(this.observed)
    }
    observe(node: Element) { this.observed.nodes.add(node) }
    unobserve() {}
    disconnect() { observers.delete(this.observed) }
    takeRecords() { return [] }
  })
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) { return !playing.has(this) })
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    playing.add(this)
    this.dispatchEvent(new Event("play"))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (playing.delete(this)) this.dispatchEvent(new Event("pause"))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("pickMostVisible — une seule vidéo joue, la plus visible", () => {
  it("garde la main tant qu'elle reste assez visible, sinon la plus visible la prend", () => {
    expect(pickMostVisible(new Map([["a", 0.3], ["b", 0.9]]), null)).toBe("b")
    expect(pickMostVisible(new Map([["a", 0.95], ["b", 0.6]]), "b")).toBe("b")
    expect(pickMostVisible(new Map([["a", 0.95], ["b", 0.2]]), "b")).toBe("a")
    expect(pickMostVisible(new Map([["a", 0.4]]), null)).toBeNull()
  })
})

describe("FeedVideo — la vidéo du fil", () => {
  it("montre sa première image, muette, en boucle, sans commandes natives ni lecture automatique déclarée", () => {
    const { container } = render(tree([[clip("a")]]))
    const video = videoOf("a")
    expect(video.getAttribute("src")).toBe("/recette-a.mp4#t=0.1")
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute("playsinline")
    expect(video).not.toHaveAttribute("controls")
    expect(video).not.toHaveAttribute("autoplay")
    const tile = frames(container)[0]!
    for (const name of [t("post.media.playback.unmute"), t("post.media.playback.play"), t("post.media.expandVideo")]) {
      expect(within(tile.parentElement!).getByRole("button", { name })).toBeInTheDocument()
    }
    // Cibles de 44 px pour le son et la lecture.
    expect(screen.getByRole("button", { name: t("post.media.playback.unmute") }).className).toMatch(/\bsize-11\b/)
    expect(screen.getByRole("button", { name: t("post.media.playback.play") }).className).toMatch(/\bsize-11\b/)
  })

  it("joue, muette, quand elle est la plus visible ; une autre plus visible prend la main ; hors de l'écran, elle s'arrête", () => {
    const { container } = render(tree([[clip("a")], [clip("b")]]))
    const [first, second] = frames(container)
    show(first!, 0.3)
    show(second!, 1)
    expect([...playing]).toEqual([videoOf("b")])
    expect(videoOf("b").muted).toBe(true)
    show(first!, 0.9)
    expect([...playing]).toEqual([videoOf("b")])
    show(second!, 0.2)
    expect([...playing]).toEqual([videoOf("a")])
    show(first!, 0)
    expect(playing.size).toBe(0)
  })

  it("le son ne vient que du bouton, qui le coupe ensuite", () => {
    render(tree([[clip("a")]]))
    const toggle = screen.getByRole("button", { name: t("post.media.playback.unmute") })
    fireEvent.click(toggle)
    expect(videoOf("a").muted).toBe(false)
    expect(toggle).toHaveAccessibleName(t("post.media.playback.mute"))
    fireEvent.click(toggle)
    expect(videoOf("a").muted).toBe(true)
  })

  it("une pause choisie tient tant que la vidéo reste à l'écran ; revenue plus tard, elle repart", () => {
    const { container } = render(tree([[clip("a")]]))
    const frame = frames(container)[0]!
    show(frame, 1)
    expect(playing.has(videoOf("a"))).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: t("post.media.playback.pause") }))
    expect(playing.has(videoOf("a"))).toBe(false)
    show(frame, 0.9)
    expect(playing.has(videoOf("a"))).toBe(false)
    show(frame, 0)
    show(frame, 1)
    expect(playing.has(videoOf("a"))).toBe(true)
  })

  it("mouvement réduit : jamais d'elle-même ; le bouton « Lire » la lance sur place", () => {
    setMatchMedia(true)
    const { container } = render(tree([[clip("a")]]))
    show(frames(container)[0]!, 1)
    expect(play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: t("post.media.playback.play") }))
    expect(playing.has(videoOf("a"))).toBe(true)
  })

  it("économie de données : rien ne joue ni ne se précharge d'office", () => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: Object.assign(new EventTarget(), { saveData: true }) })
    const { container } = render(tree([[clip("a")]]))
    show(frames(container)[0]!, 1)
    expect(play).not.toHaveBeenCalled()
    expect(videoOf("a")).toHaveAttribute("preload", "none")
  })

  it("un appel arrête la vidéo et l'empêche de repartir ; sa fin lui rend la main", () => {
    const { container } = render(tree([[clip("a")]]))
    const frame = frames(container)[0]!
    show(frame, 1)
    let release = () => undefined as void
    act(() => { release = suspendMediaPlayback("call") })
    expect(playing.size).toBe(0)
    act(() => release())
    expect(playing.has(videoOf("a"))).toBe(true)
  })

  it("dans la découverte, qui tient sa lecture, elle ne décide rien et n'observe rien", () => {
    const { container } = render(tree([[clip("a")]], true))
    expect(constructed).toBe(0)
    show(frames(container)[0]!, 1)
    expect(play).not.toHaveBeenCalled()
    expect(videoOf("a")).toHaveAttribute("preload", "metadata")
  })
})
