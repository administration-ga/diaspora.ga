import { POST_MEDIA_MAX_COUNT } from "@antsia/social-domain/content"
import type { OnboardingConsentChoices } from "@diaspora-ga/domain"
import { describe, expect, it } from "vitest"

import { mediaGridLayout } from "../components/media-layout"
import type { JoinInput } from "../data/port"
import { feedView } from "./selectors"
import { DEMO_SHOWCASE_POST_IDS, createDemoSeed, withMediaShowcase } from "./state"
import { DEMO_STORAGE_KEY, DemoStore } from "./store"

/**
 * A6 et A2 (25/11/2026) — la vitrine des médias du fil en démonstration : une publication
 * à dix photos fictives, la borne du moteur (la grille montre trois vignettes et « +7 ») et une publication à
 * vidéo fictive, ajoutées une fois, aussi à un état déjà enregistré, et seulement quand
 * l'application les demande. Aucune couleur ni adresse réelle : les photos sont des
 * illustrations dessinées aux couleurs du thème, la vidéo un clip fictif de l'application.
 */
const T0 = Date.UTC(2026, 10, 25, 20)
const SHOWCASE = { mediaShowcase: { clipUrl: "/medias-demo/clip-de-recette.mp4" } }

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

const AWA = { firstName: "Awa", lastName: "Ogooué", loa: 2, gaboneseNationality: true }
const ONLY_PROFILE: OnboardingConsentChoices = { social_profile: true, directory: false, notifications: false }
const JOIN: JoinInput = { facet: { countryOfResidence: "FR", city: "Lyon" }, handle: "awa.ogooue", displayName: "Awa Ogooué", consents: ONLY_PROFILE, directoryVisibility: "country" }

describe("vitrine des médias de la démonstration", () => {
  it("ajoute une publication à dix photos et une à vidéo, en tête du fil d'un membre", async () => {
    const store = new DemoStore(memoryStorage(), () => T0, 0, SHOWCASE)
    await store.signInWithIdn(AWA)
    await store.join(JOIN)
    const me = store.getState().session.personId!
    const feed = feedView(store.getState(), me, "diaspora", T0)
    const photos = feed.find((post) => post.id === DEMO_SHOWCASE_POST_IDS.photos)
    const video = feed.find((post) => post.id === DEMO_SHOWCASE_POST_IDS.video)
    // M3 : dix photos, la borne du moteur ; la grille montre trois vignettes et « +7 ».
    expect(photos?.media).toHaveLength(POST_MEDIA_MAX_COUNT)
    expect(photos?.media.every((item) => item.kind === "image" && item.withheld === null && item.url?.startsWith("data:image/svg+xml") && (item.altText ?? "").length > 0)).toBe(true)
    expect(mediaGridLayout(photos?.media.length ?? 0).tiles[3]?.more).toBe(POST_MEDIA_MAX_COUNT - 3)
    expect(video?.media).toEqual([expect.objectContaining({ kind: "video", url: SHOWCASE.mediaShowcase.clipUrl, withheld: null, width: 640, height: 360 })])
  })

  it("ne s'ajoute qu'une fois, aussi à un état déjà enregistré, et survit à la remise à zéro", async () => {
    const storage = memoryStorage()
    // Un état enregistré avant la vitrine.
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(createDemoSeed(T0 - 86_400_000)))
    const first = new DemoStore(storage, () => T0, 0, SHOWCASE)
    const ids = () => first.getState().posts.map((post) => post.id).filter((id) => id === DEMO_SHOWCASE_POST_IDS.photos || id === DEMO_SHOWCASE_POST_IDS.video)
    expect(ids()).toEqual([DEMO_SHOWCASE_POST_IDS.photos, DEMO_SHOWCASE_POST_IDS.video])
    const again = new DemoStore(storage, () => T0 + 1000, 0, SHOWCASE)
    expect(again.getState().posts.filter((post) => post.id === DEMO_SHOWCASE_POST_IDS.photos)).toHaveLength(1)
    await first.reset()
    expect(ids()).toEqual([DEMO_SHOWCASE_POST_IDS.photos, DEMO_SHOWCASE_POST_IDS.video])
  })

  it("une vitrine enregistrée avant M3 (six photos) passe à la borne du moteur, sans doublon", () => {
    const storage = memoryStorage()
    const older = withMediaShowcase(createDemoSeed(T0 - 86_400_000), SHOWCASE.mediaShowcase, T0 - 86_400_000)
    const shrunk = { ...older, posts: older.posts.map((post) => post.id === DEMO_SHOWCASE_POST_IDS.photos ? { ...post, media: (post.media ?? []).slice(0, 6) } : post) }
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(shrunk))
    const store = new DemoStore(storage, () => T0, 0, SHOWCASE)
    const showcase = store.getState().posts.filter((post) => post.id === DEMO_SHOWCASE_POST_IDS.photos)
    expect(showcase).toHaveLength(1)
    expect(showcase[0]?.media).toHaveLength(POST_MEDIA_MAX_COUNT)
  })

  it("sans demande de l'application, le jeu d'essai reste tel quel", () => {
    const store = new DemoStore(memoryStorage(), () => T0, 0)
    expect(store.getState().posts.some((post) => post.id === DEMO_SHOWCASE_POST_IDS.photos || post.id === DEMO_SHOWCASE_POST_IDS.video)).toBe(false)
  })
})
