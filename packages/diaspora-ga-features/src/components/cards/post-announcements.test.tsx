import { screen, within } from "@testing-library/react"
import type { ComponentProps, ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PostEventView, PostLiveView, PostView } from "../../data/types"
import { getFixedT } from "../../i18n"
import { formatEventRange } from "../../lib/format"
import { RoutingProvider, type FeatureRoutes } from "../../routing"
import { renderWithI18n } from "../../test-utils"
import { liveAnnouncementHref, PostEventAnnouncement, PostLiveAnnouncement } from "./post-announcements"
import { PostCard } from "./post-card"

/**
 * Lot A5 — le direct et l'évènement annoncés dans la carte de publication. Données fictives.
 * L'interrupteur du direct est celui du dépôt (ouvert depuis le 26/11/2026) ; un test le referme.
 */
const switches = vi.hoisted(() => ({ live: null as "open" | "closed" | null }))
vi.mock("../../navigation/code-switches", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../navigation/code-switches")>()
  return {
    ...actual,
    // `null` : la valeur du dépôt ; sinon la position posée par le test.
    MEMBERS_APP_CODE_SWITCH_STATES: new Proxy(actual.MEMBERS_APP_CODE_SWITCH_STATES, {
      get: (target, key, receiver) => (key === "live" && switches.live !== null ? switches.live : Reflect.get(target, key, receiver)),
    }),
  }
})
// Le menu de la publication a son propre contrat de données.
vi.mock("../post-menu", () => ({ PostMenu: () => null }))

const BASE_ROUTES: FeatureRoutes = {
  profile: (handle) => `/@${handle}`,
  post: (id) => `/publication/${id}`,
  page: (handle) => `/pages/${handle}`,
  hub: (country) => `/pays/${country}`,
  feed: () => "/fil",
  sponsor: () => "/parrainer",
  settings: () => "/parametres",
  attestation: () => "/attestation",
  enter: () => "/entrer",
}
const WITH_CONFERENCE: FeatureRoutes = { ...BASE_ROUTES, conference: (sessionId) => `/direct/${encodeURIComponent(sessionId)}` }

const LIVE: PostLiveView = { sessionId: "sessions_demo_1", status: "live", title: "Démo — Rencontre des Gabonais de Lyon" }
const EVENT: PostEventView = {
  eventId: "events_demo_1",
  title: "Démo — Pique-nique de la communauté",
  startAt: Date.UTC(2026, 11, 5, 11, 0),
  endAt: Date.UTC(2026, 11, 5, 15, 30),
  timeZone: "Europe/Paris",
  status: "scheduled",
  myParticipation: null,
}

function Link({ children, ...rest }: ComponentProps<"a">) {
  return <a {...rest}>{children}</a>
}

function mount(ui: ReactElement, routes: FeatureRoutes = WITH_CONFERENCE, locale: "fr" | "en" = "fr") {
  return renderWithI18n(
    <RoutingProvider routes={routes} Link={Link}>
      {ui}
    </RoutingProvider>,
    locale,
  )
}

afterEach(() => {
  switches.live = null
})

describe("liveAnnouncementHref — la page du direct, seulement direct ouvert ET page servie", () => {
  it("la position du dépôt (ouvert) avec la page servie : l'adresse de la session", () => {
    expect(liveAnnouncementHref("sessions_demo_1", WITH_CONFERENCE)).toBe("/direct/sessions_demo_1")
  })

  it("refermé par le code : aucun lien, même si l'application connaît la page", () => {
    expect(liveAnnouncementHref("sessions_demo_1", WITH_CONFERENCE, { calls: "closed", live: "closed", icomPro: "closed" })).toBeNull()
  })

  it("ouvert mais la page n'est pas servie (démonstration) : aucun lien", () => {
    expect(liveAnnouncementHref("sessions_demo_1", BASE_ROUTES, { calls: "closed", live: "open", icomPro: "closed" })).toBeNull()
  })
})

describe("PostLiveAnnouncement — le direct annoncé", () => {
  it.each([
    ["live", "En direct", "Live now"],
    ["scheduled", "Programmé", "Scheduled"],
    ["ended", "Terminé", "Ended"],
  ] as const)("statut « %s » : « %s » en français, « %s » en anglais", (status, fr, en) => {
    const { unmount } = mount(<PostLiveAnnouncement live={{ ...LIVE, status }} />)
    expect(screen.getByRole("link")).toHaveTextContent(fr)
    unmount()
    mount(<PostLiveAnnouncement live={{ ...LIVE, status }} />, WITH_CONFERENCE, "en")
    expect(screen.getByRole("link")).toHaveTextContent(en)
  })

  it("le lien mène à la page du direct, fait 44 px au moins et dit le titre et le statut", () => {
    mount(<PostLiveAnnouncement live={LIVE} />)
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/direct/sessions_demo_1")
    expect(link).toHaveClass("min-h-11")
    expect(link).toHaveTextContent(getFixedT("fr")("post.announcement.live.label"))
    expect(link).toHaveTextContent(LIVE.title)
    expect(link).toHaveTextContent("En direct")
  })

  it("« En direct » porte un point décoratif qui ne pulse que si le mouvement est permis ; les autres statuts, aucun point", () => {
    const { container, unmount } = mount(<PostLiveAnnouncement live={LIVE} />)
    const dot = container.querySelector("[data-live-dot]")
    expect(dot).toHaveAttribute("aria-hidden", "true")
    expect(dot).toHaveClass("motion-safe:animate-pulse")
    expect(dot).not.toHaveClass("animate-pulse")
    unmount()
    for (const status of ["scheduled", "ended"] as const) {
      const view = mount(<PostLiveAnnouncement live={{ ...LIVE, status }} />)
      expect(view.container.querySelector("[data-live-dot]")).toBeNull()
      view.unmount()
    }
  })

  it("refermé par le code : le titre et le statut en texte simple, sans lien", () => {
    switches.live = "closed"
    const { container } = mount(<PostLiveAnnouncement live={LIVE} />)
    expect(screen.queryByRole("link")).toBeNull()
    const block = container.querySelector("[data-post-live]")
    expect(block?.tagName).toBe("DIV")
    expect(block).toHaveTextContent(LIVE.title)
    expect(block).toHaveTextContent("En direct")
  })

  it("la page du direct non servie (démonstration) : texte simple aussi", () => {
    mount(<PostLiveAnnouncement live={LIVE} />, BASE_ROUTES)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText(LIVE.title)).toBeInTheDocument()
  })
})

describe("PostEventAnnouncement — l'évènement annoncé", () => {
  it("son titre et sa plage dans la langue et le fuseau du lecteur, sans lien (aucune page d'évènement personnel)", () => {
    mount(<PostEventAnnouncement event={EVENT} />)
    const group = screen.getByRole("group", { name: "Évènement annoncé" })
    expect(group).toHaveTextContent(EVENT.title)
    // Le texte brut de l'élément `time` : les espaces fines d'Intl restent telles quelles.
    const time = group.querySelector("time")
    expect(time?.textContent).toBe(formatEventRange(EVENT.startAt, EVENT.endAt, "fr"))
    expect(time).toHaveAttribute("dateTime", new Date(EVENT.startAt).toISOString())
    expect(within(group).queryByRole("link")).toBeNull()
    expect(group).not.toHaveTextContent("Annulé")
  })

  it("en anglais, la plage suit la langue", () => {
    mount(<PostEventAnnouncement event={EVENT} />, WITH_CONFERENCE, "en")
    expect(screen.getByRole("group", { name: "Event announced" }).querySelector("time")?.textContent).toBe(formatEventRange(EVENT.startAt, EVENT.endAt, "en"))
  })

  it("annulé après l'annonce : la carte le dit", () => {
    mount(<PostEventAnnouncement event={{ ...EVENT, status: "cancelled" }} />)
    expect(screen.getByRole("group", { name: "Évènement annoncé" })).toHaveTextContent("Annulé")
  })

  it.each([
    ["pending", "Invitation sans réponse"],
    ["accepted", "Vous participez"],
    ["declined", "Vous ne participez pas"],
    ["maybe", "Vous participerez peut-être"],
  ] as const)("ma réponse « %s » : « %s »", (myParticipation, text) => {
    mount(<PostEventAnnouncement event={{ ...EVENT, myParticipation }} />)
    expect(screen.getByRole("group", { name: "Évènement annoncé" })).toHaveTextContent(text)
  })

  it("sans réponse de ma part (organisateur, non-invité) : rien n'est dit", () => {
    mount(<PostEventAnnouncement event={EVENT} />)
    const group = screen.getByRole("group", { name: "Évènement annoncé" })
    for (const text of ["Invitation sans réponse", "Vous participez", "Vous ne participez pas", "Vous participerez peut-être"]) expect(group).not.toHaveTextContent(text)
  })
})

describe("formatEventRange — la plage d'un évènement", () => {
  const start = Date.UTC(2026, 11, 3, 17, 0)
  it("le même jour : une date, deux heures, le fuseau à la fin", () => {
    const text = formatEventRange(start, start + 2 * 3_600_000, "fr", "UTC")
    expect(text).toContain("2026")
    expect(text).toContain("17:00")
    expect(text).toContain("19:00")
    expect(text).toContain("UTC")
    expect(text.match(/2026/g)).toHaveLength(1)
  })

  it("une fin qui ne suit pas le début : un instant seul", () => {
    expect(formatEventRange(start, start, "en", "UTC")).toBe(new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short", timeZone: "UTC" }).format(start))
  })
})

describe("PostCard — les annonces dans la carte", () => {
  const now = Date.UTC(2026, 10, 26, 12)
  const POST: PostView = {
    id: "post-annonce",
    author: { kind: "person", id: "person-demo", handle: "awa.demo", displayName: "Awa Démo", badges: [] },
    body: "Démo — rejoignez-nous.",
    media: [],
    share: null,
    shareCount: 0,
    scope: { reach: "diaspora" },
    audience: "public",
    visibility: "network",
    moderation: "published",
    createdAt: now - 60_000,
    reactionCount: 0,
    commentCount: 0,
    myReaction: null,
    isMine: false,
    bookmarked: false,
    edited: false,
  }

  it("une publication qui annonce un direct et un évènement montre les deux blocs après son texte", () => {
    const { container } = mount(<PostCard post={{ ...POST, live: LIVE, event: EVENT }} now={now} canReact={false} />)
    const article = screen.getByRole("article")
    expect(within(article).getByRole("link", { name: new RegExp(LIVE.title) })).toHaveAttribute("href", "/direct/sessions_demo_1")
    expect(within(article).getByRole("group", { name: "Évènement annoncé" })).toHaveTextContent(EVENT.title)
    const body = within(article).getByText(POST.body)
    const live = container.querySelector("[data-post-live]")!
    expect(body.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("une publication ordinaire ne montre aucun bloc d'annonce", () => {
    const { container } = mount(<PostCard post={POST} now={now} canReact={false} />)
    expect(container.querySelector("[data-post-live]")).toBeNull()
    expect(container.querySelector("[data-post-event]")).toBeNull()
  })
})
