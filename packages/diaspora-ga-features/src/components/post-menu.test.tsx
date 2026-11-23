// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DataSourceProvider } from "../data/context"
import type { ActionResult, DiasporaGaActions, DiasporaGaDataSource } from "../data/port"
import type { PostView } from "../data/types"
import { getFixedT, type Locale } from "../i18n"
import { I18nProvider } from "../i18n/client"
import { RoutingProvider, type FeatureRoutes } from "../routing"
import { PostMenu, postAuthorGestures } from "./post-menu"

/**
 * FD-10 — les gestes que le moteur sert déjà, au menu « … » d'une publication : épingler sa
 * publication sur son mur (ou retirer l'épingle), la retirer d'ANTSIA après confirmation, suivre
 * les commentaires de celle d'autrui. Chaque entrée n'existe que si le fournisseur sert le geste
 * et s'il a un sens pour CETTE publication. Données fictives.
 */
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ROUTES: FeatureRoutes = {
  profile: (handle) => `/@${handle}`,
  post: (id) => `/publication/${id}`,
  page: (handle) => `/pages/${handle}`,
  hub: (country) => `/pays/${country}`,
  feed: () => "/fil",
  sponsor: () => "/parrainer",
  settings: () => "/parametres",
  attestation: () => "/verification",
  enter: () => "/entrer",
}

function Link(props: ComponentProps<"a">) {
  return <a {...props} />
}

const MINE: PostView = {
  id: "post-mien",
  author: { kind: "person", id: "person-moi", handle: "moi.fixture", displayName: "Awa FIXTURE", badges: [] },
  body: "Publication fictive.",
  media: [],
  share: null,
  shareCount: 0,
  scope: { reach: "diaspora" },
  audience: "public",
  visibility: "network",
  moderation: "published",
  createdAt: Date.UTC(2026, 10, 20, 12),
  reactionCount: 0,
  commentCount: 0,
  myReaction: null,
  isMine: true,
  bookmarked: false,
  edited: false,
}
const OTHERS: PostView = { ...MINE, id: "post-autrui", author: { ...MINE.author, id: "person-autre", handle: "autre.fixture", displayName: "Paul FIXTURE" }, isMine: false }

const ok = <T,>(value: T): Promise<ActionResult<T>> => Promise.resolve({ ok: true, value })

function gestures() {
  return {
    pinOnMyWall: vi.fn((postId: string) => { void postId; return ok(null) }),
    unpinMyWall: vi.fn(() => ok(null)),
    withdrawFromRoot: vi.fn((postId: string) => { void postId; return ok(null) }),
    toggleCommentNotifications: vi.fn((postId: string) => { void postId; return ok({ notifying: true }) }),
  }
}

/** Le vrai fournisseur de données, avec les seules écritures que le menu emploie. */
function mount(post: PostView, actions: Partial<DiasporaGaActions> = gestures(), locale: Locale = "fr") {
  const source = { kind: "engine", actions } as unknown as DiasporaGaDataSource
  render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={source}>
        <RoutingProvider routes={ROUTES} Link={Link}>
          <PostMenu post={post} />
        </RoutingProvider>
      </DataSourceProvider>
    </I18nProvider>,
  )
  return actions
}

async function openMenu(locale: Locale = "fr") {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: getFixedT(locale)("postMenu.open") }))
  await screen.findByRole("menu")
  return user
}

/** Le texte tel que Testing Library le lit dans le DOM (espaces insécables ramenées à l'espace simple). */
const plain = (value: string) => value.replace(/\s+/g, " ").trim()
const t = getFixedT("fr")

describe("menu d'une publication — épingler sur mon mur (FD-10)", () => {
  it("ma publication publiée s'épingle en tête de mon mur, et le menu le dit", async () => {
    const actions = mount(MINE)
    const user = await openMenu()
    expect(screen.queryByRole("menuitem", { name: t("postMenu.unpin") })).toBeNull()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.pin") }))
    expect(actions.pinOnMyWall).toHaveBeenCalledExactlyOnceWith("post-mien")
    expect(mocks.success).toHaveBeenCalledWith(t("postMenu.pinned"))
  })

  it("l'épinglée de mon mur propose de retirer l'épingle, pas de l'épingler de nouveau", async () => {
    const actions = mount({ ...MINE, pinned: true })
    const user = await openMenu()
    expect(screen.queryByRole("menuitem", { name: t("postMenu.pin") })).toBeNull()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.unpin") }))
    expect(actions.unpinMyWall).toHaveBeenCalledOnce()
    expect(mocks.success).toHaveBeenCalledWith(t("postMenu.unpinned"))
  })

  it("un refus du moteur se dit par son code fermé, sans rien affirmer", async () => {
    const actions = { ...gestures(), pinOnMyWall: vi.fn(() => Promise.resolve<ActionResult>({ ok: false, code: "rate_limited" })) }
    mount(MINE, actions)
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.pin") }))
    expect(mocks.error).toHaveBeenCalledWith(t("errors.rate_limited"))
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("ne s'épingle pas : une publication de groupe, en relecture, d'une page, ou celle d'autrui", () => {
    const actions = gestures() as unknown as DiasporaGaActions
    for (const post of [
      { ...MINE, audience: "group" as const },
      { ...MINE, moderation: "pending_review" as const },
      { ...MINE, author: { ...MINE.author, kind: "page" as const } },
      OTHERS,
    ]) expect(postAuthorGestures(post, actions), post.id).toMatchObject({ pin: false, unpin: false })
  })
})

describe("menu d'une publication — retirer d'ANTSIA (FD-10)", () => {
  it("une publication lue aussi dans ANTSIA se retire après une confirmation qui dit qu'elle reste ici", async () => {
    const actions = mount({ ...MINE, visibility: "root" })
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.withdrawFromRoot") }))
    const dialog = await screen.findByRole("dialog", { name: t("withdrawFromRoot.title") })
    expect(within(dialog).getByText(plain(t("withdrawFromRoot.description")))).toBeInTheDocument()
    expect(within(dialog).getByText(plain(t("withdrawFromRoot.irreversible")))).toBeInTheDocument()
    expect(actions.withdrawFromRoot).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: t("withdrawFromRoot.confirm") }))
    expect(actions.withdrawFromRoot).toHaveBeenCalledExactlyOnceWith("post-mien")
    expect(mocks.success).toHaveBeenCalledWith(t("withdrawFromRoot.done"))
  })

  it("annuler ne retire rien ; une publication lue dans DIASPORA.GA seulement n'a pas l'entrée", async () => {
    const actions = mount({ ...MINE, visibility: "root" })
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.withdrawFromRoot") }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t("withdrawFromRoot.cancel") }))
    expect(actions.withdrawFromRoot).not.toHaveBeenCalled()
    cleanup()
    mount(MINE)
    await openMenu()
    expect(screen.queryByRole("menuitem", { name: t("postMenu.withdrawFromRoot") })).toBeNull()
  })
})

describe("menu d'une publication — suivre les commentaires (FD-10)", () => {
  it("la publication d'autrui se suit, puis ne se suit plus ; l'auteur n'en sait rien", async () => {
    const actions = mount(OTHERS)
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: t("postMenu.notifyOn") }))
    expect(actions.toggleCommentNotifications).toHaveBeenCalledExactlyOnceWith("post-autrui")
    expect(mocks.success).toHaveBeenCalledWith(t("postMenu.notifying"))
    cleanup()

    const stop = { ...gestures(), toggleCommentNotifications: vi.fn(() => ok({ notifying: false })) }
    mount({ ...OTHERS, notifying: true }, stop)
    const again = await openMenu()
    await again.click(screen.getByRole("menuitem", { name: t("postMenu.notifyOff") }))
    expect(mocks.success).toHaveBeenCalledWith(t("postMenu.notNotifying"))
  })

  it("ma propre publication ne se suit pas : son auteur est déjà avisé", async () => {
    mount(MINE)
    await openMenu()
    expect(screen.queryByRole("menuitem", { name: t("postMenu.notifyOn") })).toBeNull()
  })
})

describe("menu d'une publication — fournisseur sans ces gestes", () => {
  it("aucune entrée n'est inventée", async () => {
    mount({ ...MINE, visibility: "root", pinned: true }, { toggleBookmark: vi.fn() })
    await openMenu()
    for (const key of ["postMenu.pin", "postMenu.unpin", "postMenu.withdrawFromRoot"]) expect(screen.queryByRole("menuitem", { name: t(key) }), key).toBeNull()
    expect(postAuthorGestures(OTHERS, {} as DiasporaGaActions).notify).toBe(false)
  })

  it("parle anglais", async () => {
    const en = getFixedT("en")
    mount({ ...MINE, visibility: "root" }, gestures(), "en")
    await openMenu("en")
    expect(screen.getByRole("menuitem", { name: en("postMenu.pin") })).toHaveTextContent("Pin to my wall")
    expect(screen.getByRole("menuitem", { name: en("postMenu.withdrawFromRoot") })).toHaveTextContent("Remove from ANTSIA")
  })
})
