// @vitest-environment jsdom
import { RoutingProvider, type FeatureRoutes } from "@diaspora-ga/features"
import {
  DataSourceProvider,
  POST_SEARCH_MAX_RESULTS,
  type DiasporaGaDataSource,
  type MembershipView,
  type PostSearchCapability,
  type PostSearchQuery,
  type PostView,
} from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource, createDemoSeed } from "@diaspora-ga/features/demo"
import { getFixedT, type Locale } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PostSearchSection } from "./post-search"

/**
 * DS-11, volet recherche (CH-817) — le champ et les résultats, sur le fournisseur de
 * démonstration (données fictives) ou sur une capacité factice pour les états : vide, refus,
 * fenêtre suivante, borne.
 */
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const NOW = Date.UTC(2026, 9, 18, 12)
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

/** La seule part de l'adhésion que la recherche lit : le droit de réagir. */
const MEMBER = { canPublish: true } as MembershipView

function demoSource(): DiasporaGaDataSource {
  const state = { ...createDemoSeed(NOW), session: { personId: "p-mireille" } }
  const storage = { getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }
  return createDemoDataSource(new DemoStore(storage, () => NOW, 0))
}

function mount(source: DiasporaGaDataSource, capability: PostSearchCapability, locale: Locale = "fr") {
  return render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={source}>
        <RoutingProvider routes={ROUTES} Link={Link}>
          <PostSearchSection capability={capability} membership={MEMBER}>
            <p data-testid="hors-recherche">rubriques</p>
          </PostSearchSection>
        </RoutingProvider>
      </DataSourceProvider>
    </I18nProvider>,
  )
}

function fake(respond: (limit: number) => PostSearchQuery): PostSearchCapability & { calls: { query: string; limit: number }[] } {
  const calls: { query: string; limit: number }[] = []
  return { calls, usePostSearch: (args) => { calls.push(args); return respond(args.limit) } }
}

const fixture = (index: number): PostView => ({
  id: `post-fictif-${index}`,
  author: { kind: "person", id: "person-fictive", handle: "awa.fictive", displayName: "Awa FICTIVE", badges: [] },
  body: `Annonce fictive numéro ${index}`,
  media: [],
  share: null,
  shareCount: 0,
  scope: { reach: "diaspora" },
  audience: "public",
  visibility: "network",
  moderation: "published",
  createdAt: NOW - index * 1_000,
  reactionCount: 0,
  commentCount: 0,
  myReaction: null,
  isMine: false,
  bookmarked: false,
  edited: false,
})
const many = (count: number) => Array.from({ length: count }, (_, index) => fixture(index + 1))

/** Le texte tel que Testing Library le lit dans le DOM (espaces insécables ramenées à l'espace simple). */
const plain = (value: string) => value.replace(/\s+/g, " ").trim()
const t = getFixedT("fr")

async function search(words: string, locale: Locale = "fr") {
  const user = userEvent.setup()
  await user.type(screen.getByRole("searchbox", { name: getFixedT(locale)("postSearch.label") }), words)
  return user
}

describe("chercher dans les publications (DS-11) — fournisseur de démonstration", () => {
  it("un mot sans accent trouve la publication lisible ; la page laisse place aux résultats, puis revient sans mots", async () => {
    const source = demoSource()
    const capability = source.postSearch
    if (!capability) throw new Error("la démonstration doit servir la recherche")
    mount(source, capability)
    expect(screen.getByTestId("hors-recherche")).toBeInTheDocument()

    const user = await search("medicaments")
    const list = await screen.findByRole("list", { name: t("postSearch.resultsLabel") })
    expect(within(list).getAllByRole("article")).toHaveLength(1)
    expect(within(list).getByText(/Je rentre à Libreville/)).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(t("postSearch.count", { count: 1 }))
    expect(screen.queryByTestId("hors-recherche")).toBeNull()

    await user.clear(screen.getByRole("searchbox", { name: t("postSearch.label") }))
    expect(await screen.findByTestId("hors-recherche")).toBeInTheDocument()
  })

  it("sans résultat, l'état vide reprend les mots cherchés", async () => {
    const source = demoSource()
    mount(source, source.postSearch!)
    await search("introuvablefictif")
    expect(await screen.findByText(plain(t("postSearch.emptyTitle", { query: "introuvablefictif" })))).toBeInTheDocument()
    expect(screen.getByText(t("postSearch.emptyBody"))).toBeInTheDocument()
  })

  it("une seule lettre ne cherche rien : la page reste", async () => {
    const capability = fake(() => ({ status: "ready", data: { items: [], hasMore: false, capped: false } }))
    mount(demoSource(), capability)
    await search("a")
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.getByTestId("hors-recherche")).toBeInTheDocument()
    expect(capability.calls).toEqual([])
  })
})

describe("chercher dans les publications (DS-11) — états", () => {
  it("un refus se dit par son code fermé, sans résultat inventé", async () => {
    mount(demoSource(), fake(() => ({ status: "error", code: "not_member" })))
    await search("annonce")
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.not_member"))
    expect(screen.queryByRole("list", { name: t("postSearch.resultsLabel") })).toBeNull()
  })

  it("« Voir plus » demande la fenêtre suivante et garde les publications lues pendant la lecture", async () => {
    const capability = fake((limit) => (limit === 20 ? { status: "ready", data: { items: many(20), hasMore: true, capped: false } } : { status: "loading" }))
    mount(demoSource(), capability)
    const user = await search("annonce")
    const more = await screen.findByRole("button", { name: t("postSearch.loadMore") })
    expect(within(screen.getByRole("list", { name: t("postSearch.resultsLabel") })).getAllByRole("article")).toHaveLength(20)
    await user.click(more)
    expect(capability.calls.at(-1)).toEqual({ query: "annonce", limit: 40 })
    expect(within(screen.getByRole("list", { name: t("postSearch.resultsLabel") })).getAllByRole("article")).toHaveLength(20)
    expect(screen.getByRole("button", { name: t("postSearch.loadMore") })).toBeDisabled()
  })

  it("à la borne, plus de suite : l'écran demande de préciser", async () => {
    mount(demoSource(), fake(() => ({ status: "ready", data: { items: many(POST_SEARCH_MAX_RESULTS), hasMore: false, capped: true } })))
    await search("annonce")
    expect(await screen.findByText(t("postSearch.capped"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("postSearch.loadMore") })).toBeNull()
  })

  it("parle anglais", async () => {
    const en = getFixedT("en")
    mount(demoSource(), fake(() => ({ status: "ready", data: { items: [], hasMore: false, capped: false } })), "en")
    expect(screen.getByRole("heading", { name: en("postSearch.title") })).toHaveTextContent("Search posts")
    await search("nothing", "en")
    expect(await screen.findByText(en("postSearch.emptyTitle", { query: "nothing" }))).toBeInTheDocument()
  })
})
