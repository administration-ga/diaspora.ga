// @vitest-environment jsdom
/**
 * La gestion d'une page sous les modules activables (ADR-0041 du moteur, CH-816 lot P0) : la
 * source est GARDÉE comme l'application la monte (`gateSource`) et fournie par le vrai
 * `DataSourceProvider`. Services fermés : ni onglet « Services » ni « Demandes reçues », et
 * une adresse qui les nomme rend l'identité, sans écran « indisponible ».
 */
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  gateSource,
  type DiasporaGaDataSource,
  type Loadable,
  type ManagedPageDetailView,
  type MembershipView,
  type NetworkFeature,
  type PageManagement,
} from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, getDefaultNormalizer, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { PageManageScreen, type PageManageTab } from "./page-admin-screens"

const MEMBER = {
  personId: "person-me", handle: "awa.demo", displayName: "Awa", status: "verifiee", badges: ["verified"],
  facet: { countryOfResidence: "FR", city: "Lyon", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: 1, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
} as MembershipView

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => <>{props.children({ membership: MEMBER })}</>,
}))
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
// Les panneaux ont leurs propres scénarios ; ici, seulement lequel la gestion monte.
vi.mock("@/components/page-service-management", () => ({
  PageServiceManagement: (props: { readonly tab: string }) => <p>{`gestion-${props.tab}`}</p>,
}))
vi.mock("@/components/page-identity-form", () => ({ PageIdentityForm: () => <p>formulaire-identite</p> }))

const t = getFixedT("fr")
const normalize = getDefaultNormalizer()
const text = (key: string) => normalize(String(t(key)))

const PAGE: ManagedPageDetailView = {
  id: "page-1",
  handle: "amicale-lyon",
  name: "Amicale de Lyon",
  ownerKind: "association",
  badge: "community",
  country: "FR",
  shortName: null,
  description: "Accueil des nouveaux arrivants.",
  logoUrl: null,
  bannerUrl: null,
  myRole: "admin",
}

const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data })

const MANAGEMENT = {
  useManagedPage: () => ready(PAGE),
  useSignatories: () => ready([]),
  useMyInvitations: () => ready([]),
  useMyClaims: () => ready([]),
} as unknown as PageManagement

/** Une source qui sert la gestion des pages et les services ; la garde retire ceux des modules fermés. */
const FULL = {
  kind: "engine",
  pageAdmin: { useMyPages: () => ready([]), management: MANAGEMENT },
  services: {},
  serviceRequests: {},
} as unknown as DiasporaGaDataSource

function renderWith(open: readonly NetworkFeature[], tab: PageManageTab) {
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={gateSource(FULL, open)}>
        <PageManageScreen handle="amicale-lyon" tab={tab} />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const servicesTab = () => screen.queryByRole("link", { name: text("pageServiceManagement.tabServices") })
const requestsTab = () => screen.queryByRole("link", { name: text("pageServiceManagement.tabRequests") })
const identityTab = () => screen.getByRole("link", { name: text("pageAdmin.manage.tab.identity") })

afterEach(cleanup)

describe("gérer une page — onglets des services selon le module (CH-816, P0)", () => {
  it("services fermés : ni « Services » ni « Demandes reçues » pour une association", () => {
    renderWith(["pages"], "identite")
    expect(identityTab()).toHaveAttribute("aria-current", "page")
    expect(servicesTab()).toBeNull()
    expect(requestsTab()).toBeNull()
    expect(screen.getByText("formulaire-identite")).toBeInTheDocument()
  })

  it("services ouverts : les deux onglets mènent à la gestion des services de la page", () => {
    renderWith(["pages", "services"], "services")
    expect(servicesTab()).toHaveAttribute("href", routes.pageManage("amicale-lyon", "services"))
    expect(servicesTab()).toHaveAttribute("aria-current", "page")
    expect(requestsTab()).toHaveAttribute("href", routes.pageManage("amicale-lyon", "demandes"))
    expect(screen.getByText("gestion-services")).toBeInTheDocument()
  })

  it.each(["services", "demandes"] as const)("services fermés, une adresse `?onglet=%s` rend l'identité, sans écran des services", (tab) => {
    renderWith(["pages"], tab)
    expect(screen.queryByText(`gestion-${tab}`)).toBeNull()
    expect(screen.getByText("formulaire-identite")).toBeInTheDocument()
    expect(identityTab()).toHaveAttribute("aria-current", "page")
  })

  it("une adresse qui nomme un onglet absent de la page (avis, emplois) rend aussi l'identité, sans « indisponible »", () => {
    renderWith(["pages", "services"], "emplois")
    expect(screen.getByText("formulaire-identite")).toBeInTheDocument()
    expect(screen.queryByText(text("jobs.unavailable.title"))).toBeNull()
    cleanup()
    renderWith(["pages", "services"], "avis")
    expect(screen.getByText("formulaire-identite")).toBeInTheDocument()
    expect(screen.queryByText(text("pageReviews.unavailableTitle"))).toBeNull()
  })
})
