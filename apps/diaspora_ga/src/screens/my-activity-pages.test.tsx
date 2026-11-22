// @vitest-environment jsdom
/**
 * « Mes pages » (`/mon-activite`) et son panneau des pages sous les modules activables
 * (ADR-0041 du moteur, CH-816 lot P0, recette du 22/11) : la source est GARDÉE comme
 * l'application la monte (`gateSource`) et fournie par le vrai `DataSourceProvider`.
 *  · D1 — services fermés, la carte d'une page ne mène ni aux services, ni aux demandes, ni aux avis ;
 *  · D2 — le panneau seul (pages seules ouvertes) ne répète pas le titre « Mes pages ».
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
import { cleanup, getDefaultNormalizer, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MyPagesPanel } from "@/components/my-pages-panel"
import { routes } from "@/lib/routes"

import { MyActivityScreen } from "./services-screens"

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }))

const MEMBER = {
  personId: "person-me", handle: "recette", displayName: "Recette", status: "verifiee", badges: ["verified"],
  facet: { countryOfResidence: "FR", city: "Paris", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: 1, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
} as MembershipView

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mon-activite",
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView }) => ReactNode }) => <>{props.children({ membership: MEMBER })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/page-services-manager", () => ({ PageServicesManager: () => <p>panneau-offres</p> }))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
const text = (key: string) => normalize(String(t(key)))

const COMPANY: ManagedPageView = { id: "page-1", handle: "saveurs-okoume", name: "Saveurs d'Okoumé (démo)", ownerKind: "company", role: "admin" }
const INSTITUTION: ManagedPageView = { id: "page-2", handle: "poste-demo", name: "Poste fictif", ownerKind: "institution", role: "admin" }

/** Une source qui sert pages, services et avis ; la garde retire ce que les modules fermés gouvernent. */
const FULL = {
  kind: "engine",
  pageAdmin: { useMyPages: () => ({ status: "ready", data: [COMPANY, INSTITUTION] }) },
  services: {},
  serviceRequests: {},
  serviceReviews: { usePageReviews: () => ({ status: "loading" }) },
} as unknown as DiasporaGaDataSource

function wrap(open: readonly NetworkFeature[], ui: ReactNode) {
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={gateSource(FULL, open)}>{ui}</DataSourceProvider>
    </I18nProvider>,
  )
}

/** La carte d'une page du panneau, repérée par le lien vers sa fiche. */
function card(name: string): HTMLElement {
  return screen.getByRole("link", { name }).closest("li")!
}

const QUICK = {
  services: () => text("pageServiceManagement.tabServices"),
  demandes: () => text("pageServiceManagement.tabRequests"),
  avis: () => text("pageReviews.tab"),
}

beforeEach(() => {
  mocks.params = new URLSearchParams()
})
afterEach(cleanup)

describe("D1 — les liens rapides d'une page suivent les onglets qu'elle offre (CH-816, P0)", () => {
  it("services fermés : la carte d'une entreprise ne mène ni aux services, ni aux demandes reçues, ni aux avis", () => {
    wrap(["pages"], <MyPagesPanel />)
    const company = within(card(COMPANY.name))
    expect(company.getByRole("link", { name: text("pagePostManagement.tab") })).toHaveAttribute("href", routes.pageManage(COMPANY.handle, "publications"))
    for (const label of Object.values(QUICK)) expect(company.queryByRole("link", { name: label() })).toBeNull()
  })

  it("services ouverts : l'entreprise mène aux services, aux demandes reçues et aux avis de sa gestion", () => {
    wrap(["pages", "services"], <MyPagesPanel />)
    const company = within(card(COMPANY.name))
    expect(company.getByRole("link", { name: QUICK.services() })).toHaveAttribute("href", routes.pageManage(COMPANY.handle, "services"))
    expect(company.getByRole("link", { name: QUICK.demandes() })).toHaveAttribute("href", routes.pageManage(COMPANY.handle, "demandes"))
    expect(company.getByRole("link", { name: QUICK.avis() })).toHaveAttribute("href", routes.pageManage(COMPANY.handle, "avis"))
  })

  it.each([[["pages"]], [["pages", "services"]]] as const)("une institution ne propose pas de services : aucun de ces liens (modules %j)", (open) => {
    wrap(open, <MyPagesPanel />)
    const institution = within(card(INSTITUTION.name))
    expect(institution.getByRole("link", { name: text("pagePostManagement.tab") })).toBeInTheDocument()
    for (const label of Object.values(QUICK)) expect(institution.queryByRole("link", { name: label() })).toBeNull()
  })
})

describe("D2 — un seul titre « Mes pages » quand le panneau des pages est seul (CH-816, P0)", () => {
  it("pages seules ouvertes : le titre de l'écran nomme le panneau, une seule phrase d'introduction", () => {
    wrap(["pages"], <MyActivityScreen />)
    expect(screen.getAllByRole("heading", { name: "Mes pages" })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Mes pages" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Mes pages" })).toBeInTheDocument()
    expect(screen.getAllByText(text("pageAdmin.myPages.lead"))).toHaveLength(1)
    expect(screen.queryByText(text("services.activity.lead"))).toBeNull()
  })

  it("plusieurs onglets offerts : l'écran garde son titre et le panneau des pages retrouve le sien", () => {
    mocks.params = new URLSearchParams("onglet=pages")
    wrap(["pages", "services"], <MyActivityScreen />)
    expect(screen.getByRole("heading", { level: 1, name: "Mes pages" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Mes pages" })).toBeInTheDocument()
    expect(screen.getByText(text("services.activity.lead"))).toBeInTheDocument()
    expect(screen.getByText(text("pageAdmin.myPages.lead"))).toBeInTheDocument()
  })
})
