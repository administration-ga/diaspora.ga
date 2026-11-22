// @vitest-environment jsdom
/**
 * « Mes pages » (`/mon-activite`) sous les modules activables (ADR-0041 du moteur, CH-816 lot P0) :
 * la source est GARDÉE comme l'application la monte (`gateSource`) et fournie par le vrai
 * `DataSourceProvider` — un module fermé n'a ni onglet, ni écran « indisponible ».
 */
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  gateSource,
  type DiasporaGaDataSource,
  type ManagedPageView,
  type MembershipView,
  type NetworkFeature,
} from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, getDefaultNormalizer, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { MyActivityScreen } from "./services-screens"

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  membership: null as unknown,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mon-activite",
}))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: unknown }) => ReactNode }) => <>{props.children({ membership: mocks.membership })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
// Chaque panneau a ses propres scénarios ; ici, seulement lequel l'écran monte.
vi.mock("@/components/my-pages-panel", () => ({ MyPagesPanel: () => <p>panneau-mes-pages</p> }))
vi.mock("@/components/service-inbox", () => ({ ServiceInbox: () => <p>panneau-demandes</p> }))
vi.mock("@/components/job-recruiter-panel", () => ({ JobRecruiterPanel: () => <p>panneau-emplois</p> }))
vi.mock("@/components/page-services-manager", () => ({ PageServicesManager: () => <p>panneau-offres</p> }))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
const text = (key: string) => normalize(String(t(key)))

const MEMBER = {
  personId: "person-me", handle: "recette", displayName: "Recette", status: "verifiee", badges: ["verified"],
  facet: { countryOfResidence: "FR", city: "Paris", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: 1, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
} as MembershipView

const COMPANY: ManagedPageView = { id: "page-1", handle: "coiffure-paris", name: "Coiffure Paris (fictif)", ownerKind: "company", role: "admin" }

/** Une source qui sert les quatre familles d'onglets ; la garde en retire celles des modules fermés. */
const FULL = {
  kind: "engine",
  pageAdmin: { useMyPages: () => ({ status: "ready", data: [COMPANY] }) },
  services: {},
  serviceRequests: {},
  serviceReviews: {},
  jobs: {},
} as unknown as DiasporaGaDataSource

function renderWith(open: readonly NetworkFeature[]) {
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={gateSource(FULL, open)}>
        <MyActivityScreen />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const tabs = () => screen.queryByRole("navigation", { name: "Sections de Mes pages" })
const UNAVAILABLE = ["services.activity.unavailableTitle", "services.results.unavailableTitle", "jobs.unavailable.title"]

beforeEach(() => {
  mocks.params = new URLSearchParams()
  mocks.membership = MEMBER
})
afterEach(cleanup)

describe("/mon-activite — « Mes pages », modules fermés absents (CH-816, P0)", () => {
  it("seul le module des pages ouvert : le titre « Mes pages », ses pages, aucune barre d'onglets ni écran « indisponible »", () => {
    renderWith(["pages", "pilotMetrics"])
    expect(screen.getByRole("heading", { level: 1, name: "Mes pages" })).toBeInTheDocument()
    // D2 (recette du 22/11) : le panneau seul, l'écran garde la phrase la plus précise, celle du panneau.
    expect(screen.getByText(text("pageAdmin.myPages.lead"))).toBeInTheDocument()
    expect(screen.queryByText(text("services.activity.lead"))).toBeNull()
    expect(tabs()).toBeNull()
    expect(screen.queryByRole("link", { name: "Offres" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Demandes" })).toBeNull()
    expect(screen.getByText("panneau-mes-pages")).toBeInTheDocument()
    for (const key of UNAVAILABLE) expect(screen.queryByText(text(key))).toBeNull()
  })

  it("pages et services ouverts : Offres, Demandes et Pages, sans Emplois ; les offres d'abord", () => {
    renderWith(["pages", "services"])
    const nav = tabs()!
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("href", routes.myActivity("offres"))
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Demandes" })).toHaveAttribute("href", routes.myActivity("demandes"))
    expect(screen.getByRole("link", { name: "Pages" })).toHaveAttribute("href", routes.myActivity("pages"))
    expect(screen.queryByRole("link", { name: "Emplois" })).toBeNull()
    expect(screen.getByText("panneau-offres")).toBeInTheDocument()
  })

  it("une adresse qui nomme un onglet fermé montre le premier onglet offert", () => {
    mocks.params = new URLSearchParams("onglet=emplois")
    const first = renderWith(["pages", "services"])
    expect(screen.queryByText("panneau-emplois")).toBeNull()
    expect(screen.getByText("panneau-offres")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("aria-current", "page")
    first.unmount()

    mocks.params = new URLSearchParams("onglet=demandes")
    renderWith(["pages"])
    expect(screen.queryByText("panneau-demandes")).toBeNull()
    expect(screen.getByText("panneau-mes-pages")).toBeInTheDocument()
    for (const key of UNAVAILABLE) expect(screen.queryByText(text(key))).toBeNull()
  })

  it("un onglet ouvert que nomme l'adresse reste choisi", () => {
    mocks.params = new URLSearchParams("onglet=demandes")
    renderWith(["pages", "services"])
    expect(screen.getByText("panneau-demandes")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Demandes" })).toHaveAttribute("aria-current", "page")
  })
})
