/**
 * Cloche DIASPORA.GA — les avis d'un LIVE se nomment et mènent à la page du live. L'hôte en tête de
 * la phrase, par son profil publié ; la page du live sous la phrase, seulement quand l'application
 * la sert (interrupteur du direct ouvert ET moteur branché : `conferenceFeatureRoute`) — sinon la
 * phrase reste, sans lien. Jamais le titre du live : le moteur ne le met pas dans l'avis. Plus aucun
 * avis de live ne se lit « Nouvelle activité dans DIASPORA.GA ».
 */
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DataSourceProvider } from "../data/context"
import type { DiasporaGaDataSource } from "../data/port"
import type { NotificationView } from "../data/types"
import { getFixedT } from "../i18n"
import { RoutingProvider, type FeatureRoutes } from "../routing"
import { renderWithI18n } from "../test-utils"
import { NotificationBell } from "./notification-bell"
import { noticeLink, openingDestination } from "./notification-destinations"

const fr = getFixedT("fr")
const en = getFixedT("en")
const NOW = Date.UTC(2026, 10, 26, 9)

/** Ce que fournit l'application quand le live n'est pas servi (démonstration, interrupteur fermé) : aucune page de live. */
const withoutLive: FeatureRoutes = {
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

/** Interrupteur du direct ouvert et moteur branché : la page d'un live est fournie. */
const withLive: FeatureRoutes = { ...withoutLive, conference: (sessionId) => `/direct/${encodeURIComponent(sessionId)}` }

function Link({ children, ...props }: ComponentProps<"a">) {
  return <a {...props}>{children}</a>
}

function source(items: readonly NotificationView[]): DiasporaGaDataSource {
  const unread = items.filter((item) => !item.read).length
  return {
    kind: "engine",
    useNotifications: () => ({ status: "ready", data: items }),
    useUnreadCount: () => ({ status: "ready", data: { count: unread, capped: false } }),
    actions: {
      markNotificationRead: vi.fn(async () => ({ ok: true, value: null })),
      markAllNotificationsRead: vi.fn(async () => ({ ok: true, value: null })),
    },
  } as unknown as DiasporaGaDataSource
}

const HOST = { handle: "awa.demo", displayName: "Awa OGOUÉ" }

function notice(overrides: Partial<NotificationView> & Pick<NotificationView, "kind">): NotificationView {
  return { id: `avis-${overrides.kind}`, actor: HOST, createdAt: NOW - 60_000, read: false, pendingConnectionId: null, inviteOutcome: null, postId: null, liveSessionId: "live-1", ...overrides }
}

function mount(items: readonly NotificationView[], routes: FeatureRoutes = withLive, locale: "fr" | "en" = "fr") {
  return renderWithI18n(
    <DataSourceProvider source={source(items)}>
      <RoutingProvider routes={routes} Link={Link}>
        <NotificationBell />
      </RoutingProvider>
    </DataSourceProvider>,
    locale,
  )
}

async function openBell(count: number, t = fr) {
  await userEvent.setup().click(screen.getByRole("button", { name: t("bell.openUnread", { count }) }))
  return screen.getByRole("dialog")
}

function rowOf(dialog: HTMLElement, text: string) {
  return within(dialog).getByText(text).closest("li") as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("cloche — les avis d'un live", () => {
  it("« Awa OGOUÉ est en direct. » : l'hôte mène à son profil, « Voir le live » à la page du live", async () => {
    mount([notice({ kind: "live_started" })])
    const dialog = await openBell(1)
    const row = rowOf(dialog, fr("bell.kind.live_started"))
    expect(row).toHaveTextContent(`${HOST.displayName} est en direct.`)
    expect(within(row).getByRole("link", { name: HOST.displayName })).toHaveAttribute("href", "/@awa.demo")
    expect(within(row).getByRole("link", { name: "Voir le live" })).toHaveAttribute("href", "/direct/live-1")
    // Le seul geste de la ligne : la marquer comme lue.
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([fr("bell.markRead")])
  })

  it("les invitations : à son live, à prendre la parole ; leur issue une fois tranchée", async () => {
    mount([
      notice({ id: "invite", kind: "live_invite", liveSessionId: "live-2" }),
      notice({ id: "antenne", kind: "live_antenna_invite", liveSessionId: "live-3", inviteOutcome: "gone", read: true }),
    ])
    const dialog = await openBell(1)
    const invite = rowOf(dialog, fr("bell.kind.live_invite"))
    expect(invite).toHaveTextContent(`${HOST.displayName} vous invite à son live.`)
    expect(within(invite).getByRole("link", { name: "Voir le live" })).toHaveAttribute("href", "/direct/live-2")
    const antenna = rowOf(dialog, fr("bell.kind.live_antenna_invite"))
    expect(antenna).toHaveTextContent(`${HOST.displayName} vous invite à prendre la parole dans son live.`)
    expect(antenna).toHaveTextContent(fr("bell.outcome.gone"))
    expect(within(antenna).getByRole("link", { name: "Voir le live" })).toHaveAttribute("href", "/direct/live-3")
  })

  it("le replay publié mène à la même page, « Voir le replay »", async () => {
    mount([notice({ kind: "live_replay_published", liveSessionId: "live-4" })])
    const dialog = await openBell(1)
    const row = rowOf(dialog, fr("bell.kind.live_replay_published"))
    expect(row).toHaveTextContent(`${HOST.displayName} a publié le replay de son live.`)
    expect(within(row).getByRole("link", { name: "Voir le replay" })).toHaveAttribute("href", "/direct/live-4")
  })

  it("plus aucun avis de live ne se lit « Nouvelle activité » ; sans profil publié, un membre sans nom", async () => {
    mount([notice({ id: "a", kind: "live_started" }), notice({ id: "b", kind: "live_started", actor: null, liveSessionId: "live-5" })])
    const dialog = await openBell(2)
    expect(within(dialog).queryByText(fr("bell.system.other"))).not.toBeInTheDocument()
    expect(within(dialog).getByText(`${fr("bell.someone")} ${fr("bell.kind.live_started")}`)).toBeInTheDocument()
  })

  it("live non servi (démonstration ou interrupteur fermé) : la phrase reste, aucun lien vers une page introuvable", async () => {
    mount([notice({ id: "a", kind: "live_started" }), notice({ id: "b", kind: "live_replay_published" })], withoutLive)
    const dialog = await openBell(2)
    expect(within(dialog).getByText(fr("bell.kind.live_started"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("link", { name: "Voir le live" })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("link", { name: "Voir le replay" })).not.toBeInTheDocument()
    // Le nom de l'hôte mène toujours à son profil.
    expect(within(dialog).getAllByRole("link", { name: HOST.displayName })).toHaveLength(2)
  })

  it("sans session relue : la phrase seule", async () => {
    mount([notice({ kind: "live_started", liveSessionId: null })])
    const dialog = await openBell(1)
    expect(within(dialog).getByText(fr("bell.kind.live_started"))).toBeInTheDocument()
    expect(within(dialog).queryByRole("link", { name: "Voir le live" })).not.toBeInTheDocument()
  })

  it("en anglais, les mêmes avis", async () => {
    mount([notice({ id: "a", kind: "live_started" }), notice({ id: "b", kind: "live_antenna_invite", liveSessionId: "live-6" }), notice({ id: "c", kind: "live_replay_published", liveSessionId: "live-7" })], withLive, "en")
    const dialog = await openBell(3, en)
    expect(rowOf(dialog, en("bell.kind.live_started"))).toHaveTextContent(`${HOST.displayName} is live.`)
    expect(rowOf(dialog, en("bell.kind.live_antenna_invite"))).toHaveTextContent(`${HOST.displayName} invited you to speak in their live.`)
    expect(within(dialog).getAllByRole("link", { name: "Watch the live" }).map((link) => link.getAttribute("href"))).toEqual(["/direct/live-1", "/direct/live-6"])
    expect(within(dialog).getByRole("link", { name: "Watch the replay" })).toHaveAttribute("href", "/direct/live-7")
  })
})

describe("destinations d'un avis de live (module pur)", () => {
  const target = (kind: NotificationView["kind"], liveSessionId: string | null = "live-1") => ({ kind, actor: { handle: "awa.demo" }, postId: null, liveSessionId })

  it("la page du live quand l'application la sert, rien sinon", () => {
    expect(noticeLink(target("live_started"), withLive)).toEqual({ href: "/direct/live-1", label: "bell.openLive" })
    expect(noticeLink(target("live_replay_published"), withLive)).toEqual({ href: "/direct/live-1", label: "bell.openLiveReplay" })
    expect(noticeLink(target("live_invite"), withoutLive)).toBeNull()
    expect(noticeLink(target("live_antenna_invite", null), withLive)).toBeNull()
  })

  it("une notification poussée d'un live ouvre sa page ; non servie, le repli neutre", () => {
    expect(openingDestination({ channel: "notice", notice: target("live_started") }, withLive, "/notifications")).toBe("/direct/live-1")
    expect(openingDestination({ channel: "notice", notice: target("live_started") }, withoutLive, "/notifications")).toBe("/notifications")
  })
})
