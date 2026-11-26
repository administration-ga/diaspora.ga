// @vitest-environment jsdom
/**
 * Le rail droit du fil au lancement (CH-816, lot P2) : la source est GARDÉE comme l'application la
 * monte (`gateSource`) et fournie par le vrai `DataSourceProvider`. Ordre, compteurs jamais à zéro,
 * aucun bloc qui dit « rien », et le rappel du parrainage.
 */
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import {
  DataSourceProvider,
  gateSource,
  type CountryHubView,
  type DiasporaGaDataSource,
  type HubPagesView,
  type Loadable,
  type MembershipView,
  type NetworkFeature,
  type PageView,
} from "@diaspora-ga/features/data"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { FeedRail } from "./feed-screen"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }))
// Le rail seul : la coque, le fil et le bandeau des actus (surfaces lourdes du moteur) restent hors de ce test.
vi.mock("@/components/gate", () => ({ Gate: () => null }))
vi.mock("@/components/app-shell", () => ({ AppShell: () => null, useComposer: () => ({ canPublish: false, open: vi.fn() }) }))
vi.mock("@/components/feed-pages", () => ({ FeedPages: () => null }))
vi.mock("@/components/feed-stories", () => ({ FeedStories: () => null }))
// Les lives en cours ont leurs propres scénarios (`feed-lives.test.tsx`) : ici, leur place dans le rail.
vi.mock("@/components/feed-lives", () => ({ FeedLives: () => <section aria-label="Lives en cours" /> }))
vi.mock("@/components/status-banner", () => ({ StatusBanner: () => null }))
// Les suggestions ont leurs propres scénarios : ici, seulement leur place dans le rail.
vi.mock("@diaspora-ga/features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@diaspora-ga/features")>()),
  MemberSuggestions: (props: { headingId: string }) => <section aria-label="Des membres à rencontrer" id={props.headingId} />,
}))

const MEMBER = {
  personId: "person-recette", handle: "recette", displayName: "Recette", status: "verifiee", badges: ["verified"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1, verifiedSince: 1, sponsoredBy: null, attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "verifiee", derivedFrom: "diaspora-ga" }, canPublish: true, rateTier: "standard", directoryVisibility: "hidden",
} as MembershipView

const HUB: CountryHubView = {
  country: "FR",
  open: true,
  counters: {
    dormant: false,
    members: { kind: "below_threshold", threshold: 20 },
    associations: { kind: "value", value: 0 },
    companies: { kind: "value", value: 0 },
    upcomingEvents: { kind: "value", value: 0 },
  },
  countersSource: "demo",
  countersComputedAt: Date.UTC(2026, 10, 9, 2, 30),
  officialPages: [],
  associations: [],
  companies: [],
  events: [],
  eventsSource: "demo",
}

const page = (id: string, name: string, ownerKind: PageView["ownerKind"], badge: PageView["badge"] = "community"): PageView => ({
  id, handle: id, name, ownerKind, trust: badge === "official" ? "official" : "community", badge, country: "FR", city: null, description: "", followers: 0, claimable: false,
})

const NO_PAGES: HubPagesView = { country: "FR", officialPages: [], associations: [], companies: [], more: { officialPages: false, associations: false, companies: false } }

function renderRail(options: { open?: readonly NetworkFeature[]; hub?: CountryHubView; pages?: HubPagesView; membership?: MembershipView } = {}) {
  const hub: Loadable<CountryHubView> = { status: "ready", data: options.hub ?? HUB }
  const pages: Loadable<HubPagesView> = { status: "ready", data: options.pages ?? NO_PAGES }
  const source = {
    kind: "demo",
    useCountryHub: () => hub,
    pages: { useHubPages: () => pages },
  } as unknown as DiasporaGaDataSource
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={gateSource(source, options.open ?? ["pages"])}>
        <FeedRail membership={options.membership ?? MEMBER} />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const follows = (first: Element, second: Element) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

afterEach(cleanup)

describe("/fil — le rail droit au lancement (CH-816, P2)", () => {
  it("dans l'ordre : des membres à rencontrer, le pays, ses pages (officielles d'abord), les évènements, les lives en cours, le parrainage", () => {
    renderRail({
      open: ["pages", "groupsAndEvents"],
      pages: { ...NO_PAGES, officialPages: [page("ambassade-france", "Ambassade (fictive)", "institution", "official")], associations: [page("amicale-lyon", "Amicale de Lyon (fictive)", "association")] },
    })
    const members = screen.getByRole("region", { name: "Des membres à rencontrer" })
    const country = screen.getByText("Votre pays")
    const pagesHeading = screen.getByRole("heading", { name: "Pages · France" })
    const events = screen.getByRole("heading", { name: "Prochains évènements" })
    const sponsor = screen.getByRole("heading", { name: "Parrainer un proche" })
    expect(follows(members, country)).toBe(true)
    expect(follows(country, pagesHeading)).toBe(true)
    expect(follows(pagesHeading, events)).toBe(true)
    // Les lives en cours à la place que leur donnent antsia.ga et administration.ga : après les évènements.
    const lives = screen.getByRole("region", { name: "Lives en cours" })
    expect(follows(events, lives)).toBe(true)
    expect(follows(lives, sponsor)).toBe(true)
    const official = screen.getByRole("link", { name: /Ambassade \(fictive\)/ })
    const association = screen.getByRole("link", { name: /Amicale de Lyon \(fictive\)/ })
    expect(follows(official, association)).toBe(true)
  })

  it("aucun compteur à zéro : la carte du pays n'a que son nom et « Ouvrir le hub »", () => {
    renderRail({ open: ["pages", "groupsAndEvents"] })
    expect(screen.getByText("France")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ouvrir le hub" })).toHaveAttribute("href", routes.hub("FR"))
    expect(screen.queryByText("Associations")).toBeNull()
    expect(screen.queryByText("Évènements à venir")).toBeNull()
    expect(screen.queryByText("0")).toBeNull()
  })

  it("un compteur positif s'affiche ; celui qui reste à zéro, non", () => {
    renderRail({ open: ["pages", "groupsAndEvents"], hub: { ...HUB, counters: { ...HUB.counters, associations: { kind: "value", value: 3 } } } })
    expect(screen.getByText("Associations")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.queryByText("Évènements à venir")).toBeNull()
  })

  it("aucune page dans le pays, sans suite : aucun bloc des pages ; avec une suite, la phrase et l'annuaire restent", () => {
    const view = renderRail()
    expect(screen.queryByRole("heading", { name: "Pages · France" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Toutes les pages du pays" })).toBeNull()
    view.unmount()
    renderRail({ pages: { ...NO_PAGES, more: { officialPages: false, associations: true, companies: false } } })
    expect(screen.getByText("D'autres pages de ce pays se trouvent dans l'annuaire des pages.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Toutes les pages du pays" })).toHaveAttribute("href", routes.pages({ country: "FR" }))
  })

  it("groupes et évènements fermés : aucun bloc d'évènements", () => {
    renderRail({ open: ["pages"] })
    expect(screen.queryByRole("heading", { name: "Prochains évènements" })).toBeNull()
  })

  it("le rappel du parrainage mène à la page du parrainage, une phrase, sans chiffre", () => {
    renderRail()
    const reminder = screen.getByRole("region", { name: "Parrainer un proche" })
    expect(reminder).toHaveTextContent("Votre parrainage permet à un proche qui a rejoint le réseau de publier et d'échanger.")
    expect(reminder.textContent).not.toMatch(/\d/)
    expect(screen.getByRole("link", { name: "Ouvrir le parrainage" })).toHaveAttribute("href", routes.sponsor())
  })

  it.each(["en_attente", "declaree"] as const)("un membre qui ne peut pas parrainer (%s) n'a pas de rappel", (status) => {
    renderRail({ membership: { ...MEMBER, status } })
    expect(screen.queryByRole("link", { name: "Ouvrir le parrainage" })).toBeNull()
  })
})
