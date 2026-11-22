// @vitest-environment jsdom
/**
 * La fiche d'une page sous les modules activables (ADR-0041 du moteur, CH-816 lot P0) : la source
 * est GARDÉE comme l'application la monte (`gateSource`) et fournie par le vrai `DataSourceProvider`.
 * Services fermés, la fiche d'une entreprise ne propose aucun « Demander un service ».
 */
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  gateSource,
  type DiasporaGaDataSource,
  type MembershipView,
  type NetworkFeature,
  type PageDetailView,
  type PagesCapability,
  type ServiceOfferCardView,
  type ServicesCapability,
} from "@diaspora-ga/features/data"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { PageScreen } from "./page-screen"

const MEMBER = {
  personId: "person-me", handle: "recette", displayName: "Recette", status: "declaree", badges: ["community"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: null, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "reinforced", directoryVisibility: "hidden",
} as MembershipView

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => <>{props.children({ membership: MEMBER })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
// Les rubriques voisines ont leurs scénarios propres ; l'entrée de contact du prestataire reste la vraie.
vi.mock("@/components/page-services-section", async (original) => ({
  ...(await original<typeof import("@/components/page-services-section")>()),
  PageServicesSection: () => null,
}))
vi.mock("@/components/page-about", () => ({ PageAbout: () => null }))
vi.mock("@/components/page-jobs-section", () => ({ PageJobsSection: () => null }))
vi.mock("@/components/page-admin-entry", () => ({ PageAdminEntry: () => null }))
vi.mock("@/components/association-membership-entry", () => ({ AssociationMembershipEntry: () => null }))
vi.mock("@/components/profile-images", () => ({ ProfileCover: () => null }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const COMPANY: PageDetailView = {
  page: {
    id: "page-coiffure",
    handle: "coiffure-paris",
    name: "Coiffure Paris (fictif)",
    ownerKind: "company",
    trust: "community",
    badge: "community",
    country: "FR",
    city: null,
    description: "Coiffure et soins, sur rendez-vous.",
    followers: 2,
    claimable: false,
    shortName: null,
    logoUrl: null,
  },
  bannerUrl: null,
  postCount: 0,
  posts: [],
  morePosts: false,
  events: [],
  viewer: { role: null, following: true },
}

const OFFER: ServiceOfferCardView = {
  id: "offer-1", version: 1, title: "Coupe et soin", description: "Prestation fictive de recette.", category: "beauty", country: "FR", city: "Paris",
  delivery: "onsite", languages: ["fr"], durationMinutes: 60, pricing: { mode: "from", amountMinor: 3000, currency: "EUR" },
  provider: { id: "page-coiffure", handle: "coiffure-paris", name: "Coiffure Paris (fictif)", ownerKind: "company", badge: "community", logoUrl: null },
  budgetFit: null, updatedAt: Date.UTC(2026, 10, 1),
}

const PAGES = {
  usePage: () => ({ status: "ready", data: COMPANY }),
  useDirectory: () => ({ status: "loading" }),
  useHubPages: () => ({ status: "loading" }),
  follow: vi.fn(),
  unfollow: vi.fn(),
} as unknown as PagesCapability

const SERVICES = {
  usePageOffers: () => ({ status: "ready", data: { items: [OFFER], isDone: true, continueCursor: "" } }),
} as unknown as ServicesCapability

/** Une source qui sert les pages et les services ; la garde retire les services quand leur module est fermé. */
const FULL = { kind: "engine", pages: PAGES, services: SERVICES } as unknown as DiasporaGaDataSource

function renderWith(open: readonly NetworkFeature[]) {
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={gateSource(FULL, open)}>
        <PageScreen handle="coiffure-paris" />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe("la fiche d'une entreprise — « Demander un service » selon le module (CH-816, P0)", () => {
  it("services fermés : la fiche se lit, sans aucun appel à demander un service", () => {
    renderWith(["pages"])
    expect(screen.getByRole("heading", { level: 1, name: "Coiffure Paris (fictif)" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Demander un service" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Demander un service" })).toBeNull()
  })

  it("services ouverts et une offre active : l'appel mène aux services de la page", () => {
    renderWith(["pages", "services"])
    expect(screen.getByRole("link", { name: "Demander un service" })).toHaveAttribute("href", routes.pageServices("coiffure-paris"))
  })
})
