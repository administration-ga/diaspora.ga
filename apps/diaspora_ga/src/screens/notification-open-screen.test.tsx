// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import { RoutingProvider, type FeatureRoutes, type LinkComponent } from "@diaspora-ga/features"
import {
  DataSourceProvider,
  type DiasporaGaDataSource,
  type MembershipView,
  type NetworkFeature,
  type NotificationOpeningQuery,
  type NotificationOpeningView,
} from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { callJournalRoute } from "@/lib/calls"
import { routes } from "@/lib/routes"

import { NotificationOpenScreen } from "./notification-open-screen"

/**
 * `/notifications/ouvrir` (DS-14, ouverture) : la garde de membre, la coque, puis la destination
 * relue par le fournisseur — ou la page des notifications, le même repli pour tout le reste.
 */
const mocks = vi.hoisted(() => ({ gate: vi.fn(), replace: vi.fn(), membership: null as MembershipView | null }))

vi.mock("@/components/gate", () => ({
  Gate: (props: { require: string; children: (session: { membership: MembershipView | null }) => ReactNode }) => {
    mocks.gate(props.require)
    return <>{props.children({ membership: mocks.membership })}</>
  },
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div data-testid="coque">{children}</div> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))

const fr = getFixedT("fr")
const MEMBER: MembershipView = {
  personId: "person-me", handle: "recette", displayName: "Recette", status: "declaree", badges: ["community"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: null, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "reinforced", directoryVisibility: "hidden",
}

/** La table des surfaces telle que l'application la fournit, appels fermés (le journal n'y est pas). */
const featureRoutes: FeatureRoutes = {
  profile: routes.profile, post: routes.post, page: routes.page, hub: routes.hub,
  feed: (tag, context) => routes.feed(context?.scope, tag, context?.country),
  sponsor: routes.sponsor, settings: routes.settings, attestation: routes.attestation, enter: routes.enter,
  notifications: routes.notifications, serviceRequest: routes.serviceRequest,
  groupConversation: routes.groupConversation, personalConversation: routes.personalConversation,
  ...callJournalRoute(false),
}
const Link: LinkComponent = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>

const PERSONAL: NotificationOpeningView = { channel: "notice", notice: { kind: "personal_message", actor: { handle: "awa.demo" }, postId: null, personalThreadId: "fil-pair" } }

function query(state: NotificationOpeningQuery["state"], retry = vi.fn()): NotificationOpeningQuery {
  return { state, retry }
}

function mount(options: { reference?: string | null; opening?: NotificationOpeningQuery | null; openFeatures?: readonly NetworkFeature[]; featuresReady?: boolean } = {}) {
  const useOpening = vi.fn((_reference: string) => options.opening ?? query({ status: "ready", data: PERSONAL }))
  const source = {
    kind: "engine",
    ...(options.opening === null ? {} : { notificationOpening: { useOpening } }),
    ...(options.openFeatures === undefined ? {} : { openFeatures: options.openFeatures, featuresReady: options.featuresReady ?? true }),
  } as unknown as DiasporaGaDataSource
  render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <RoutingProvider routes={featureRoutes} Link={Link}>
          <NotificationOpenScreen reference={options.reference === undefined ? "delivery_demo" : options.reference} />
        </RoutingProvider>
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { useOpening }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.membership = MEMBER
})
afterEach(cleanup)

describe("écran /notifications/ouvrir", () => {
  it("réservé aux membres, dans la coque : un message à deux ouvre SA conversation, une seule fois, sans rien marquer lu", () => {
    const { useOpening } = mount()
    expect(mocks.gate).toHaveBeenCalledWith("member")
    expect(useOpening).toHaveBeenCalledWith("delivery_demo")
    expect(screen.getByTestId("coque")).toContainElement(screen.getByRole("status"))
    expect(screen.getByRole("status")).toHaveTextContent(fr("notificationOpen.loading"))
    expect(mocks.replace).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith(routes.personalConversation("fil-pair"))
  })

  it("une référence inconnue, l'avis d'un autre ou une cible fermée : la page des notifications", () => {
    mount({ opening: query({ status: "ready", data: null }) })
    expect(mocks.replace).toHaveBeenCalledWith(routes.notifications())
  })

  it("une référence illisible, ou un fournisseur qui ne pousse rien (démonstration) : la page des notifications, sans lecture", () => {
    const { useOpening } = mount({ reference: null })
    expect(useOpening).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith(routes.notifications())
    cleanup()
    vi.clearAllMocks()
    mount({ opening: null })
    expect(mocks.replace).toHaveBeenCalledWith(routes.notifications())
  })

  it("appels fermés : un appel poussé mène à la page des notifications, jamais à la brique iAppel", () => {
    mount({ opening: query({ status: "ready", data: { channel: "call", ringing: true } }) })
    expect(mocks.replace).toHaveBeenCalledWith(routes.notifications())
    expect(mocks.replace).not.toHaveBeenCalledWith(routes.callJournal())
  })

  it("une rubrique fermée sur le réseau ne s'ouvre pas : le même repli ; tant que les rubriques ne sont pas lues, on attend", () => {
    const request: NotificationOpeningView = { channel: "notice", notice: { kind: "service_request_declined", actor: null, postId: null, serviceNotice: { audience: "requester", requestId: "dem-1", pageHandle: null } } }
    mount({ opening: query({ status: "ready", data: request }), openFeatures: ["pages"], featuresReady: false })
    expect(mocks.replace).not.toHaveBeenCalled()
    cleanup()
    mount({ opening: query({ status: "ready", data: request }), openFeatures: ["pages"] })
    expect(mocks.replace).toHaveBeenCalledWith(routes.notifications())
    cleanup()
    vi.clearAllMocks()
    mount({ opening: query({ status: "ready", data: request }), openFeatures: ["pages", "services"] })
    expect(mocks.replace).toHaveBeenCalledWith(routes.serviceRequest("dem-1"))
  })

  it("une panne se dit, sans rien affirmer de l'avis : réessayer, ou voir toutes les notifications", async () => {
    const retry = vi.fn()
    mount({ opening: query({ status: "error", code: "unknown" }, retry) })
    expect(mocks.replace).not.toHaveBeenCalled()
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(fr("notificationOpen.error"))
    expect(screen.getByRole("link", { name: fr("bell.seeAll") })).toHaveAttribute("href", routes.notifications())
    await userEvent.setup().click(screen.getByRole("button", { name: fr("notificationsCenter.retry") }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("sans adhésion, rien n'est monté (la garde redirige)", () => {
    mocks.membership = null
    const { useOpening } = mount()
    expect(useOpening).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).toBeNull()
  })
})
