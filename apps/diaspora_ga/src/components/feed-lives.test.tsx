// @vitest-environment jsdom
/**
 * Les lives en cours (`FeedLives`, repris du rail des directs du moteur) : montés seulement la page
 * d'un live servie (interrupteur du direct ouvert ET moteur) et iCom ouvert ; rien sans live, ni
 * pendant la lecture, ni en cas d'échec ; chaque live mène à sa page par une cible de 48 px ; le
 * point « en direct » ne pulse que si le mouvement est permis. La démonstration ne sert jamais de
 * live : l'état ouvert se prouve ici. Références et identifiants fictifs.
 */
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getFunctionName } from "convex/server"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { IcomNetwork } from "@/components/icom"
import { routes } from "@/lib/routes"

import { FeedLives, LIVES_NOW_WINDOW } from "./feed-lives"

type LiveCard = {
  sessionId: string
  title: string
  audience: "public"
  stageFormat: "computer"
  startedAt: number
  host: { displayName: string | null; handle: string | null; avatarUrl: string | null }
  counters: { viewerGrantCount: number; comments: number; reactions: number }
  isHost: boolean
}
type LiveWindow = { items: LiveCard[]; nextCursor: { startedAt: number; sessionId: string } | null }

const mocks = vi.hoisted(() => ({
  dataSource: "engine" as "engine" | "demo",
  icom: null as IcomNetwork | null,
  reads: [] as { name: string; args: unknown }[],
  respond: (_args: unknown): { readonly data: unknown; readonly isError: boolean } => ({ data: undefined, isError: false }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/fil",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// L'îlot réel garde NetworkProvider et l'adaptateur Next ; la couche de communication reste hors du test.
vi.mock("@antsia/social-features/shell", () => ({ CommunicationShell: () => null }))
vi.mock("@antsia/social-features/messagerie", () => ({ conversationHref: vi.fn(), dockStore: { openDraft: vi.fn(), detach: vi.fn() }, draftKey: vi.fn() }))
vi.mock("@/components/icom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/icom")>()),
  useIcomNetwork: () => mocks.icom,
}))
vi.mock("@/lib/env", () => ({ publicEnv: { get dataSource() { return mocks.dataSource } } }))
vi.mock("@antsia/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@antsia/api/hooks")>()),
  useAuthenticatedConvexQuery: (reference: unknown, args: unknown) => {
    mocks.reads.push({ name: getFunctionName(reference as never), args })
    return mocks.respond(args)
  },
}))

const NETWORK = { networkId: "networks_diaspora-ga", slug: "diaspora-ga", personId: "persons_awa" } as IcomNetwork
const NOW = Date.UTC(2026, 10, 26, 18, 0)
const LIST_LIVE = "modules/live/sessions:listLive"

const card = (overrides: Partial<LiveCard> & Pick<LiveCard, "sessionId" | "title">): LiveCard => ({
  audience: "public",
  stageFormat: "computer",
  startedAt: NOW - 12 * 60_000,
  host: { displayName: "Awa OGOUÉ", handle: "awa.demo", avatarUrl: null },
  counters: { viewerGrantCount: 0, comments: 0, reactions: 0 },
  isHost: false,
  ...overrides,
})

const TWO_LIVES: LiveWindow = {
  items: [card({ sessionId: "live-1", title: "Concert de Libreville (fictif)" }), card({ sessionId: "live 2", title: "Questions aux étudiants (fictif)", startedAt: NOW - 20_000, host: { displayName: null, handle: null, avatarUrl: null } })],
  nextCursor: null,
}

/** Comme TanStack, une même réponse garde la même référence d'un rendu à l'autre. */
function ready(window: LiveWindow) {
  const result = { data: window, isError: false }
  mocks.respond = () => result
}

const LOADING = { data: undefined, isError: false } as const
const FAILED = { data: undefined, isError: true } as const

function mount(locale: "fr" | "en" = "fr", className?: string) {
  return render(
    <I18nProvider locale={locale}>
      <FeedLives now={NOW} {...(className === undefined ? {} : { className })} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  mocks.dataSource = "engine"
  mocks.icom = NETWORK
  mocks.reads = []
  mocks.respond = () => LOADING
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("lives en cours — l'état ouvert (interrupteur du direct ouvert, moteur, iCom ouvert)", () => {
  it("lit les lives du réseau courant (celui que pose l'îlot), trois par fenêtre, et les montre sous « En direct »", () => {
    ready(TWO_LIVES)
    mount()
    expect(LIVES_NOW_WINDOW).toBe(3)
    expect(mocks.reads.at(-1)).toEqual({ name: LIST_LIVE, args: { networkId: NETWORK.networkId, limit: 3 } })
    const region = screen.getByRole("region", { name: "En direct" })
    expect(within(region).getByRole("heading", { level: 2, name: "En direct" })).toBeInTheDocument()
    const links = within(region).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([routes.conference("live-1"), routes.conference("live 2")])
    expect(links[0]).toHaveTextContent("Concert de Libreville (fictif)")
    expect(links[0]).toHaveTextContent("Awa OGOUÉ · en direct depuis 12 min")
    // Un hôte sans profil publié : un nom neutre ; un live qui vient de commencer le dit.
    expect(links[1]).toHaveTextContent("Membre du réseau · vient de commencer")
  })

  it("une seule cible par live, la ligne entière, d'au moins 44 px ; aucun autre geste sans suite", () => {
    ready(TWO_LIVES)
    mount()
    for (const link of screen.getAllByRole("link")) expect(link).toHaveClass("min-h-12")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("le point « en direct » ne pulse que si le mouvement est permis", () => {
    ready(TWO_LIVES)
    mount()
    const dot = document.querySelector("[data-live-dot]")!
    expect(dot).toHaveAttribute("aria-hidden", "true")
    expect(dot).toHaveClass("motion-safe:animate-pulse")
    expect(dot).not.toHaveClass("animate-pulse")
  })

  it("sans live en cours : rien du tout, ni titre ni phrase", () => {
    ready({ items: [], nextCursor: null })
    const view = mount()
    expect(view.container).toBeEmptyDOMElement()
  })

  it("pendant la première lecture et en cas d'échec : rien n'est affirmé", () => {
    const loading = mount()
    expect(loading.container).toBeEmptyDOMElement()
    loading.unmount()
    mocks.respond = () => FAILED
    expect(mount().container).toBeEmptyDOMElement()
  })

  it("une suite : « Voir plus » (44 px) lit la fenêtre suivante, la précédente reste affichée pendant la lecture", async () => {
    const next = { startedAt: NOW - 30 * 60_000, sessionId: "live-3" }
    const first = { data: { items: [card({ sessionId: "live-1", title: "Premier live (fictif)" })], nextCursor: next }, isError: false }
    mocks.respond = (args) => ((args as { cursor?: unknown }).cursor === undefined ? first : LOADING)
    mount()
    const more = screen.getByRole("button", { name: "Voir plus" })
    expect(more).toHaveClass("min-h-11")
    await userEvent.setup().click(more)
    expect(mocks.reads.at(-1)?.args).toEqual({ networkId: NETWORK.networkId, limit: 3, cursor: next })
    // La fenêtre suivante se lit : la carte reste, le bouton attend.
    expect(screen.getByRole("link", { name: /Premier live \(fictif\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voir plus" })).toBeDisabled()
  })

  it("une fenêtre sans live accessible mais avec une suite le dit, et garde « Voir plus »", () => {
    ready({ items: [], nextCursor: { startedAt: 1, sessionId: "live-9" } })
    mount()
    expect(screen.getByText("Aucun live accessible dans cette fenêtre. Poursuivez avec « Voir plus ».")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voir plus" })).toBeEnabled()
  })

  it("le « depuis … min » avance chaque minute", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    vi.setSystemTime(NOW)
    ready({ items: [card({ sessionId: "live-1", title: "Live (fictif)" })], nextCursor: null })
    mount()
    expect(screen.getByRole("link")).toHaveTextContent("en direct depuis 12 min")
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole("link")).toHaveTextContent("en direct depuis 13 min")
  })

  it("la classe de placement passe à la carte (en tête du fil : retirée dès 1 280 px)", () => {
    ready(TWO_LIVES)
    mount("fr", "xl:hidden")
    expect(document.querySelector("[data-lives-now]")).toHaveClass("xl:hidden", "p-4")
  })

  it("en anglais", () => {
    ready(TWO_LIVES)
    mount("en")
    const region = screen.getByRole("region", { name: "Live now" })
    expect(within(region).getAllByRole("link")[0]).toHaveTextContent("Awa OGOUÉ · live for 12 min")
    expect(within(region).getAllByRole("link")[1]).toHaveTextContent("Network member · just started")
  })
})

describe("lives en cours — fermés partout ailleurs", () => {
  it("démonstration de ce navigateur : rien, et aucune lecture", () => {
    mocks.dataSource = "demo"
    ready(TWO_LIVES)
    expect(mount().container).toBeEmptyDOMElement()
    expect(mocks.reads).toEqual([])
  })

  it("iCom fermé pour ce membre (la page du live ne s'ouvrirait pas) : rien, et aucune lecture", () => {
    mocks.icom = null
    ready(TWO_LIVES)
    expect(mount().container).toBeEmptyDOMElement()
    expect(mocks.reads).toEqual([])
  })
})
