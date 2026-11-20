// @vitest-environment jsdom
import type { Loadable, MembershipView, PageDetailView } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, getDefaultNormalizer, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AssociationActivitiesScreen } from "./association-activities-screens"

/**
 * Recette moteur du 20/11/2026 — le groupe d'une page en sommeil ou illisible disait « Cet
 * élément n'existe plus. » : le refus est celui de la fiche d'une page indisponible, qui ne dit
 * pas si la page existe.
 */
const mocks = vi.hoisted(() => ({
  page: { status: "loading" } as Loadable<PageDetailView | null>,
  group: vi.fn(),
  event: vi.fn(),
}))

vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => <>{props.children({ membership: {} as MembershipView })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: (props: { children: ReactNode }) => <>{props.children}</> }))
vi.mock("@/components/association-group", () => ({
  AssociationGroupContent: (props: { readonly pageId: string }) => {
    mocks.group(props.pageId)
    return <p>groupe-de-l-association</p>
  },
}))
vi.mock("@/components/association-events", () => ({
  AssociationEventDetail: (props: { readonly eventId: string }) => {
    mocks.event(props.eventId)
    return <p>evenement-de-l-association</p>
  },
}))
vi.mock("@diaspora-ga/features/data", async (original) => ({
  ...(await original<typeof import("@diaspora-ga/features/data")>()),
  usePage: () => mocks.page,
}))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
const text = (key: string) => normalize(String(t(key)))

function pageOf(ownerKind: PageDetailView["page"]["ownerKind"]): PageDetailView {
  return { page: { id: "page-1", ownerKind } } as PageDetailView
}

const wrap = (ui: ReactNode) => render(<I18nProvider locale="fr">{ui}</I18nProvider>)

beforeEach(() => {
  mocks.page = { status: "loading" }
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("/pages/<handle>/groupe — page en sommeil ou illisible", () => {
  it.each([
    ["une page qui ne se lit plus (en sommeil, retirée, inconnue)", { status: "ready", data: null } as Loadable<PageDetailView | null>],
    ["un refus indistinct du fournisseur", { status: "error", code: "not_found" } as Loadable<PageDetailView | null>],
    ["une page qui n'est pas une association", { status: "ready", data: pageOf("company") } as Loadable<PageDetailView | null>],
  ])("%s : le refus de la fiche d'une page indisponible, jamais « n'existe plus »", (_case, page) => {
    mocks.page = page
    wrap(<AssociationActivitiesScreen handle="amicale-endormie" />)
    expect(screen.getByText(text("page.unavailableTitle"))).toBeInTheDocument()
    expect(screen.getByText(text("page.unavailableBody"))).toBeInTheDocument()
    expect(screen.queryByText(text("errors.not_found"))).not.toBeInTheDocument()
    expect(mocks.group).not.toHaveBeenCalled()
  })

  it("même refus pour un évènement de la page", () => {
    mocks.page = { status: "ready", data: null }
    wrap(<AssociationActivitiesScreen handle="amicale-endormie" eventId="event-1" />)
    expect(screen.getByText(text("page.unavailableTitle"))).toBeInTheDocument()
    expect(mocks.event).not.toHaveBeenCalled()
  })

  it("une autre panne se dit telle quelle ; une association lisible monte son groupe", () => {
    mocks.page = { status: "error", code: "network_unavailable" }
    const view = wrap(<AssociationActivitiesScreen handle="amicale" />)
    expect(screen.getByRole("alert")).toHaveTextContent(text("errors.network_unavailable"))
    mocks.page = { status: "ready", data: pageOf("association") }
    view.rerender(<I18nProvider locale="fr"><AssociationActivitiesScreen handle="amicale" /></I18nProvider>)
    expect(screen.getByText("groupe-de-l-association")).toBeInTheDocument()
    expect(mocks.group).toHaveBeenCalledWith("page-1")
  })
})
