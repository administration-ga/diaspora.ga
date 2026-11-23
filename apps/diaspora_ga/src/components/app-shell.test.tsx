// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import { RoutingProvider, type FeatureRoutes, type LinkComponent } from "@diaspora-ga/features"
import {
  DataSourceProvider,
  gateSource,
  NETWORK_FEATURES,
  type AssociationListPage,
  type DiasporaGaActions,
  type DiasporaGaDataSource,
  type Loadable,
  type ManagedPageView,
  type MembershipView,
  type ModerationDeskView,
  type MyAssociationItemView,
  type NetworkFeature,
  type PilotMetricsAccessView,
  type SleepingPageView,
  type TeamPageView,
} from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { memberMenu, type MemberCreateEntry, type MemberMenuEntry } from "@diaspora-ga/features/navigation"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { IcomNetwork } from "@/lib/icom-state"
import { memberCreateHref, memberMenuHref } from "@/lib/member-menu"
import { PRIMARY_DESTINATIONS, ROUTE_DESTINATIONS, type NavDestination, type RouteKey } from "@/lib/nav-destinations"
import { routes } from "@/lib/routes"

import { AppShell, useComposer } from "./app-shell"

const mocks = vi.hoisted(() => ({
  pathname: "/fil",
  icom: null as IcomNetwork | null,
  network: null as IcomNetwork | null,
  desktop: true,
  composer: vi.fn(),
  /** Les rendus du lecteur des non-lus : aucun tant qu'iCom est fermé. */
  unreadReads: 0,
  /** Le chiffre que le lecteur remonte à la coque, comme le ferait le serveur. */
  reportUnread: null as ((total: number) => void) | null,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Un lien ordinaire : suivre un lien dans un test ne déclenche aucune navigation de jsdom.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))

// iCom et le dock du moteur : des sondes, sans Convex ni couche de communication.
vi.mock("@/components/icom", () => ({
  useIcomNetwork: () => mocks.icom,
  useEngineNetwork: () => mocks.network,
  IcomIsland: (props: { children: ReactNode }) => <>{props.children}</>,
}))
vi.mock("@antsia/social-features/messagerie", () => ({ MessagerieDock: () => <section aria-label="Carte iCom" /> }))
// Le lecteur des non-lus a ses propres tests (deux décomptes du serveur) : ici, une sonde que le test fait parler.
vi.mock("@/components/messages-unread", () => ({
  MessagesUnreadReader: (props: { onTotal: (total: number) => void }) => {
    mocks.unreadReads += 1
    mocks.reportUnread = props.onTotal
    return null
  },
}))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => !mocks.desktop }))

// Le composeur a ses propres tests : ici, une sonde qui dit s'il est ouvert et avec quoi.
vi.mock("@diaspora-ga/features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@diaspora-ga/features")>()),
  PostComposerSheet: (props: { open: boolean; share?: unknown; memberCountry: string; draftKey?: string }) => {
    mocks.composer(props)
    return props.open ? <div role="dialog" aria-label={props.share === undefined ? "Composeur" : "Partage"} /> : null
  },
}))

const NOW = Date.UTC(2026, 9, 18, 12)
const t = getFixedT("fr")

const MEMBER: MembershipView = {
  personId: "persons_awa",
  handle: "awa.demo",
  displayName: "Awa Ogooué",
  status: "declaree",
  badges: ["community"],
  facet: { countryOfResidence: "FR", city: "Lyon", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: null,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" },
  canPublish: true,
  rateTier: "reinforced",
  directoryVisibility: "hidden",
}

const NETWORK = { networkId: "networks_diaspora-ga", slug: "diaspora-ga", personId: MEMBER.personId } as IcomNetwork

const featureRoutes: FeatureRoutes = {
  profile: routes.profile,
  post: routes.post,
  page: routes.page,
  hub: routes.hub,
  feed: (tag, context) => routes.feed(context?.scope, tag, context?.country),
  sponsor: routes.sponsor,
  settings: routes.settings,
  attestation: routes.attestation,
  enter: routes.enter,
}
const Link: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
)

/** Un écran qui ouvre le composeur de la coque (« Quoi de neuf ? »), comme le fil. */
function ComposerProbe() {
  const composer = useComposer()
  return (
    <button type="button" onClick={composer.open} disabled={!composer.canPublish}>
      Quoi de neuf ?
    </button>
  )
}

/** Un responsable reconnu par le serveur : modérateur du réseau et lecteur de la mesure du pilote (lectures stables). */
const RESPONSIBLE_DESK: Loadable<ModerationDeskView | null> = {
  status: "ready",
  data: { role: "network_admin", networkWide: true, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true, canReviewClaims: true, teams: [] },
}
const PILOT_ALLOWED: Loadable<PilotMetricsAccessView> = { status: "ready", data: { allowed: true } }

function withResponsibleAccess(source: DiasporaGaDataSource): DiasporaGaDataSource {
  const { moderationDesk, pilotMetrics } = source
  if (!moderationDesk || !pilotMetrics) throw new Error("La démonstration sert la modération et la mesure du pilote.")
  return { ...source, moderationDesk: { ...moderationDesk, useDesk: () => RESPONSIBLE_DESK }, pilotMetrics: { ...pilotMetrics, useAccess: () => PILOT_ALLOWED } }
}

const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data })
const LOADING = { status: "loading" } as const
const REFUSED = { status: "error", code: "not_found" } as const

/** Une page dont le membre fait partie de l'équipe vivante (AS-10), telle que « Mes pages » la lit. */
const TEAM_PAGE: TeamPageView = { id: "pages_amicale", handle: "amicale-lyon", name: "Amicale des Gabonais de Lyon", ownerKind: "association", teamRole: "moderator" }
/** Une page où le membre parle (fournisseur antérieur à AS-10, sans lecture de l'équipe). */
const SPEAKING_PAGE: ManagedPageView = { id: "pages_atelier", handle: "atelier-lyon", name: "Atelier de Lyon", ownerKind: "company", role: "admin" }
/** Une page en sommeil de son équipe (AS-11a) : elle ne se lit plus que dans « Mes pages ». */
const SLEEPING_PAGE: SleepingPageView = {
  id: "pages_dort",
  handle: "atelier-endormi",
  name: "Atelier endormi",
  ownerKind: "company",
  badge: "community",
  country: "FR",
  teamRole: "admin",
  sleepEndsAt: NOW + 86_400_000,
  state: "asleep",
  canWake: true,
}

function associationItem(status: MyAssociationItemView["status"]): MyAssociationItemView {
  return { membershipId: `adhesion-${status}`, status, role: "member", decisionReason: null, statusChangedAt: NOW, page: { id: "pages_amicale", handle: "amicale-lyon", name: "Amicale des Gabonais de Lyon" } }
}

function associationsPage(...statuses: MyAssociationItemView["status"][]): Loadable<AssociationListPage<MyAssociationItemView>> {
  return ready({ items: statuses.map(associationItem), continueCursor: null, isDone: true })
}

/** Ce que les lectures personnelles du membre rendent (équipe des pages, pages en sommeil, adhésions). */
interface Holdings {
  readonly teamPages?: Loadable<readonly TeamPageView[]>
  readonly sleepingPages?: Loadable<readonly SleepingPageView[]>
  readonly associations?: Loadable<AssociationListPage<MyAssociationItemView>>
}

/** Un membre qui gère une page et adhère à une association : « Mes pages » et « Mes associations » ont un contenu. */
const HOLDS_ALL: Holdings = { teamPages: ready([TEAM_PAGE]), sleepingPages: ready([]), associations: associationsPage("accepted") }
/** Un membre qui n'en a aucune : les deux lectures répondent, vides. */
const HOLDS_NOTHING: Holdings = { teamPages: ready([]), sleepingPages: ready([]), associations: associationsPage() }

/** Les lectures de la démonstration remplacées par celles du test, capacités servies par le vrai fournisseur. */
function withHoldings(source: DiasporaGaDataSource, holdings: Holdings): DiasporaGaDataSource {
  const { pageAdmin, associations } = source
  if (!pageAdmin || !associations) throw new Error("La démonstration sert la gestion des pages et les associations.")
  const { teamPages, sleepingPages, associations: mine } = holdings
  const management = pageAdmin.management
  return {
    ...source,
    pageAdmin: {
      ...pageAdmin,
      ...(teamPages ? { useMyTeamPages: () => teamPages } : {}),
      ...(sleepingPages && management ? { management: { ...management, useMySleepingPages: () => sleepingPages } } : {}),
    },
    associations: mine ? { ...associations, useMyAssociations: () => mine } : associations,
  }
}

function renderShell(
  options: {
    pathname?: string
    membership?: MembershipView
    icom?: boolean
    network?: boolean
    responsible?: boolean
    /** Les lectures personnelles du membre (CH-816 : une entrée personnelle n'apparaît qu'avec un contenu). */
    holdings?: Holdings
    /** Remplacer une capacité de la source avant la garde (fournisseur antérieur, capacité absente). */
    overrides?: Partial<DiasporaGaDataSource>
    locale?: "fr" | "en"
    actions?: Partial<DiasporaGaActions>
    /** ADR-0041 du moteur : la source gardée comme l'application la monte (clés ouvertes, ou lecture en cours). */
    features?: readonly NetworkFeature[] | "loading"
  } = {},
) {
  mocks.pathname = options.pathname ?? "/fil"
  mocks.icom = options.icom ? NETWORK : null
  mocks.network = options.network ?? options.icom ? NETWORK : null
  const demo = createDemoDataSource(new DemoStore(null, () => NOW, 0))
  const responsible = options.responsible ? withResponsibleAccess(demo) : demo
  const held = { ...(options.holdings ? withHoldings(responsible, options.holdings) : responsible), ...options.overrides }
  const source = options.features === undefined ? held : gateSource(held, options.features === "loading" ? [] : options.features, options.features !== "loading")
  return render(
    <I18nProvider locale={options.locale ?? "fr"}>
      <DataSourceProvider source={{ ...source, actions: { ...source.actions, ...options.actions } }}>
        <RoutingProvider routes={featureRoutes} Link={Link}>
          <AppShell membership={options.membership ?? MEMBER}>
            <ComposerProbe />
          </AppShell>
        </RoutingProvider>
      </DataSourceProvider>
    </I18nProvider>,
  )
}

/** Le rail du bureau et la barre basse : deux navigations principales, une seule visible selon la largeur. */
function mainNavigations(locale: "fr" | "en" = "fr") {
  const navs = screen.getAllByRole("navigation", { name: locale === "fr" ? "Navigation principale" : "Main navigation" })
  expect(navs).toHaveLength(2)
  return { rail: navs[0]!, bar: navs[1]! }
}

function linksOf(container: HTMLElement) {
  return within(container)
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")])
}

/** Les entrées d'un menu : Radix donne aux liens le rôle « menuitem ». */
function menuItemsOf(container: HTMLElement) {
  return within(container)
    .getAllByRole("menuitem")
    .map((item) => [item.textContent, item.getAttribute("href")])
}

function currentLinks(container: HTMLElement) {
  return within(container)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent)
}

function accountTrigger(kind: "menu" | "dialog", name = "Menu du compte (Awa Ogooué)") {
  const trigger = screen
    .getAllByRole("button", { name })
    .find((button) => button.getAttribute("aria-haspopup") === kind)
  expect(trigger).toBeDefined()
  return trigger!
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.desktop = true
  mocks.unreadReads = 0
  mocks.reportUnread = null
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** La navigation de page (`window.location.assign`), que jsdom n'exécute pas. */
function stubPageNavigation() {
  const assign = vi.fn()
  vi.stubGlobal("window", new Proxy(window, {
    get(target, property) {
      return property === "location" ? { assign } : Reflect.get(target, property, target)
    },
  }))
  return assign
}

/** Une sortie que le test termine quand il le décide. */
function pendingSignOut() {
  let finish: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const action = vi.fn<DiasporaGaActions["signOutEverywhere"]>().mockReturnValueOnce(pending)
  return { action, pending, finish: () => finish() }
}

describe("coque — la barre, cinq entrées au plus (DG-005, menu léger CH-816)", () => {
  it("tous modules servis : Fil, Membres, Services, Communautés et Messages dans cet ordre, au bureau comme au téléphone", () => {
    renderShell({ icom: true })
    const { rail, bar } = mainNavigations()
    const expected = [
      ["Fil", "/fil"],
      ["Membres", "/explorer"],
      ["Services", "/services"],
      ["Communautés", "/communautes"],
      ["Messages", "/messages"],
    ]
    expect(linksOf(rail)).toEqual(expected)
    expect(linksOf(bar)).toEqual(expected)
    expect(within(bar).getAllByRole("listitem")).toHaveLength(5)
  })

  it("parle anglais avec les mêmes adresses : « Members » mène toujours à /explorer", () => {
    renderShell({ icom: true, locale: "en" })
    const { bar } = mainNavigations("en")
    expect(linksOf(bar)).toEqual([
      ["Feed", "/fil"],
      ["Members", "/explorer"],
      ["Services", "/services"],
      ["Communities", "/communautes"],
      ["Messages", "/messages"],
    ])
  })

  it("sans iCom (démonstration), Messages disparaît sans laisser de trou dans la barre", () => {
    renderShell({ icom: false })
    const { rail, bar } = mainNavigations()
    expect(within(bar).getAllByRole("listitem")).toHaveLength(4)
    expect(linksOf(bar).map(([label]) => label)).toEqual(["Fil", "Membres", "Services", "Communautés"])
    expect(within(rail).queryByRole("link", { name: "Messages" })).toBeNull()
  })

  it("Membres et Communautés ne se ressemblent jamais : deux icônes distinctes", () => {
    renderShell({ icom: true, features: ["pages", "groupsAndEvents"] })
    const { rail, bar } = mainNavigations()
    for (const navigation of [rail, bar]) {
      const icon = (name: string) => within(navigation).getByRole("link", { name }).querySelector("svg")?.innerHTML ?? ""
      expect(icon("Membres")).not.toBe("")
      expect(icon("Communautés")).not.toBe("")
      expect(icon("Membres")).not.toBe(icon("Communautés"))
    }
  })

  it.each([
    ["/fil", "Fil"],
    ["/publication/post-12", "Fil"],
    ["/actus", "Fil"],
    ["/explorer", "Membres"],
    ["/membres", "Membres"],
    ["/services", "Services"],
    ["/services/offre-coiffure", "Services"],
    ["/communautes", "Communautés"],
    ["/pays/fr", "Communautés"],
    ["/pays/ca", "Communautés"],
    ["/messages", "Messages"],
    ["/messages/conversation-7", "Messages"],
    // Décision 5 du plan 02 (UX-05) : la vie communautaire sous Communautés, les pages et les autres membres sous Membres.
    ["/entraide", "Communautés"],
    ["/entraide/question-1", "Communautés"],
    ["/kit-arrivee", "Communautés"],
    ["/mentorat/mentor-1", "Communautés"],
    ["/emploi/offre-1", "Communautés"],
    ["/talents", "Communautés"],
    ["/agenda", "Communautés"],
    ["/pages/asso-lyon/groupe", "Communautés"],
    ["/pages/asso-lyon/evenements/evt-42", "Communautés"],
    ["/pages", "Membres"],
    ["/pages/asso-lyon", "Membres"],
    ["/pages/asso-lyon/revendiquer", "Membres"],
    ["/@autre.membre", "Membres"],
    ["/@autre.membre/albums/album-1", "Membres"],
  ])("sur %s, seule la destination « %s » est courante", (pathname, current) => {
    renderShell({ pathname, icom: true })
    const { rail, bar } = mainNavigations()
    expect(currentLinks(bar)).toEqual([current])
    expect(currentLinks(rail)).toEqual([current])
  })

  it.each(["/servicesx", "/filtre", "/messagesx", "/parametres", "/@awa.demo", "/mes-demandes"])(
    "sur %s, aucune destination principale n'est courante",
    (pathname) => {
      renderShell({ pathname, icom: true })
      const { rail, bar } = mainNavigations()
      expect(currentLinks(bar)).toEqual([])
      expect(currentLinks(rail)).toEqual([])
    },
  )
})

/** Ouvre la feuille du compte (téléphone) et rend sa navigation « Mon compte ». */
async function openAccountSheet() {
  await userEvent.setup().click(accountTrigger("dialog"))
  const sheet = await screen.findByRole("dialog", { name: "Mon compte" })
  return within(sheet).getByRole("navigation", { name: "Mon compte" })
}

/** Ouvre le menu du compte (bureau) et rend ses entrées, liens et sortie. */
async function openAccountMenu() {
  await userEvent.setup().click(accountTrigger("menu"))
  return screen.findByRole("menu")
}

/** Les entrées personnelles et réservées que le rail portait jusqu'au CH-816. */
const PERSONAL_HREFS = [
  routes.myServiceRequests(),
  routes.myActivity(),
  routes.myAssociations(),
  routes.myApplications(),
  routes.myMentoring(),
  routes.relations(),
  routes.bookmarks(),
  routes.sponsor(),
  routes.moderationDesk(),
  routes.pilotDashboard(),
]

describe("coque — les entrées personnelles, dans le menu du compte seulement (CH-816)", () => {
  it("le rail du bureau n'a plus de groupe « Mon espace » : aucune entrée personnelle hors du menu du compte", () => {
    renderShell({ icom: true, network: true, responsible: true, holdings: HOLDS_ALL })
    expect(screen.queryByRole("navigation", { name: "Mon espace" })).toBeNull()
    expect(screen.queryByText("Mon espace")).toBeNull()
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    for (const href of PERSONAL_HREFS) expect(links, href).not.toContain(href)
  })

  it("le menu du compte du bureau porte Mes relations, Mes enregistrements et Parrainer, modules fermés comme ouverts", async () => {
    renderShell({ network: true, features: ["pages"] })
    const menu = await openAccountMenu()
    for (const [label, href] of [
      ["Mes relations", "/relations"],
      ["Mes enregistrements", "/enregistrements"],
      ["Parrainer", "/parrainer"],
    ] as const) {
      expect(within(menu).getByRole("menuitem", { name: label })).toHaveAttribute("href", href)
    }
  })

  it("garde la règle d'avant pour les relations : absentes sans réseau du moteur", async () => {
    renderShell({ network: false })
    const account = await openAccountSheet()
    expect(within(account).queryByRole("link", { name: "Mes relations" })).toBeNull()
    expect(within(account).getByRole("link", { name: "Parrainer" })).toHaveAttribute("href", "/parrainer")
  })

  it("Modération (et la mesure du pilote) : dans le menu du compte quand le serveur le dit, absente sinon", async () => {
    renderShell({ responsible: true, features: ["pages", "pilotMetrics"] })
    let menu = await openAccountMenu()
    expect(within(menu).getByRole("menuitem", { name: "Modération" })).toHaveAttribute("href", routes.moderationDesk())
    expect(within(menu).getByRole("menuitem", { name: t("pilotMetrics.nav") })).toHaveAttribute("href", routes.pilotDashboard())
    cleanup()
    renderShell({ features: ["pages", "pilotMetrics"] })
    menu = await openAccountMenu()
    expect(within(menu).queryByRole("menuitem", { name: "Modération" })).toBeNull()
    expect(within(menu).queryByRole("menuitem", { name: t("pilotMetrics.nav") })).toBeNull()
  })

  it.each([
    ["/mes-demandes", "Mes demandes"],
    ["/mes-demandes/demande-3", "Mes demandes"],
    ["/mon-activite", "Mes pages"],
    ["/mon-activite/demandes/demande-3", "Mes pages"],
    ["/nouvelle-page", "Mes pages"],
    ["/pages/asso-lyon/gerer", "Mes pages"],
    ["/mes-associations", "Mes associations"],
    ["/mes-candidatures", "Mes candidatures"],
    ["/mes-mentorats", "Mes mentorats"],
    ["/relations", "Mes relations"],
    ["/enregistrements", "Mes enregistrements"],
    ["/parrainer", "Parrainer"],
  ])("sur %s, « %s » est courante dans le menu du compte", async (pathname, current) => {
    renderShell({ pathname, network: true, holdings: HOLDS_ALL })
    expect(currentLinks(await openAccountSheet())).toEqual([current])
  })

  it("lire une page ou la revendiquer ne relève pas de Mes pages", async () => {
    renderShell({ pathname: "/pages/asso-lyon/revendiquer", network: true, holdings: HOLDS_ALL })
    expect(currentLinks(await openAccountSheet())).toEqual([])
  })
})

describe("coque — « Mes pages » et « Mes associations » n'apparaissent qu'avec un contenu (CH-816)", () => {
  /** Les libellés de la navigation du compte, au téléphone, le module des pages ouvert. */
  async function accountLabels(options: Parameters<typeof renderShell>[0]) {
    renderShell({ network: true, features: ["pages"], ...options })
    return linksOf(await openAccountSheet()).map(([label]) => label)
  }

  it("« Mes pages » : absente sans page gérée, présente avec une (modérateur compris), avant « Mes associations »", async () => {
    expect(await accountLabels({ holdings: HOLDS_NOTHING })).not.toContain("Mes pages")
    cleanup()
    const labels = await accountLabels({ holdings: { ...HOLDS_NOTHING, teamPages: ready([TEAM_PAGE]) } })
    expect(labels).toContain("Mes pages")
    expect(within(screen.getByRole("dialog", { name: "Mon compte" })).getByRole("link", { name: "Mes pages" })).toHaveAttribute("href", routes.myActivity())
    expect(labels).not.toContain("Mes associations")
  })

  it("« Mes pages » : une page en sommeil suffit, elle reste à son équipe", async () => {
    expect(await accountLabels({ holdings: { ...HOLDS_NOTHING, sleepingPages: ready([SLEEPING_PAGE]) } })).toContain("Mes pages")
  })

  it("« Mes pages » : un fournisseur sans lecture de l'équipe se lit par les pages où je parle", async () => {
    expect(await accountLabels({ overrides: { pageAdmin: { useMyPages: () => ready([SPEAKING_PAGE]) } } })).toContain("Mes pages")
    cleanup()
    expect(await accountLabels({ overrides: { pageAdmin: { useMyPages: () => ready([]) } } })).not.toContain("Mes pages")
  })

  it.each([
    ["en cours de lecture", LOADING],
    ["refusée", REFUSED],
  ] as const)("« Mes pages » : rien tant que la lecture est %s (aucun clignement)", async (_state, read) => {
    expect(await accountLabels({ holdings: { teamPages: read, sleepingPages: read } })).not.toContain("Mes pages")
  })

  it("« Mes associations » : absente sans adhésion, ni avec un refus, un départ ou une exclusion seuls", async () => {
    expect(await accountLabels({ holdings: HOLDS_NOTHING })).not.toContain("Mes associations")
    cleanup()
    expect(await accountLabels({ holdings: { ...HOLDS_NOTHING, associations: associationsPage("rejected", "left", "removed", "cancelled") } })).not.toContain("Mes associations")
  })

  it.each(["accepted", "requested"] as const)("« Mes associations » : présente avec une adhésion %s", async (status) => {
    const labels = await accountLabels({ holdings: { ...HOLDS_NOTHING, associations: associationsPage("left", status) } })
    expect(labels).toContain("Mes associations")
    expect(within(screen.getByRole("dialog", { name: "Mon compte" })).getByRole("link", { name: "Mes associations" })).toHaveAttribute("href", routes.myAssociations())
  })

  it.each([
    ["en cours de lecture", LOADING],
    ["refusée", REFUSED],
  ] as const)("« Mes associations » : rien tant que la lecture est %s", async (_state, read) => {
    expect(await accountLabels({ holdings: { ...HOLDS_NOTHING, associations: read } })).not.toContain("Mes associations")
  })

  it("module des pages fermé : ni « Mes pages » ni « Mes associations », même avec un contenu", async () => {
    const labels = await accountLabels({ holdings: HOLDS_ALL, features: [] })
    expect(labels).not.toContain("Mes pages")
    expect(labels).not.toContain("Mes associations")
  })

  it("parle anglais : « My pages » et « My associations »", async () => {
    renderShell({ network: true, features: ["pages"], holdings: HOLDS_ALL, locale: "en" })
    await userEvent.setup().click(accountTrigger("dialog", "Account menu (Awa Ogooué)"))
    const sheet = await screen.findByRole("dialog", { name: "My account" })
    const labels = linksOf(within(sheet).getByRole("navigation", { name: "My account" })).map(([label]) => label)
    expect(labels).toEqual(expect.arrayContaining(["My pages", "My associations"]))
  })
})

describe("coque — une seule entrée courante pour chaque route de membre (UX-05)", () => {
  const LABEL_KEYS: Readonly<Record<NavDestination, string>> = {
    feed: "nav.feed",
    explore: "nav.members",
    services: "nav.services",
    communities: "nav.communities",
    messages: "nav.messages",
    myRequests: "nav.myRequests",
    myActivity: "nav.myActivity",
    myAssociations: "nav.myAssociations",
    myApplications: "nav.myApplications",
    myMentoring: "nav.myMentoring",
    relations: "nav.relations",
    bookmarks: "bookmarks.title",
    sponsor: "nav.sponsor",
    moderation: "nav.moderation",
    pilot: "pilotMetrics.nav",
    profile: "nav.profile",
    settings: "nav.settings",
  }
  const PRIMARY = new Set<NavDestination>(PRIMARY_DESTINATIONS)

  /** Une adresse de la table, composée en donnant la même valeur à chaque paramètre : la route dit elle-même son chemin. */
  function compose(key: RouteKey, value: string): string {
    const route = routes[key] as unknown as (...values: readonly string[]) => string
    return route(value, value, value).split(/[?#]/)[0] ?? ""
  }

  /** Toutes les adresses de membre de la table ; un profil l'est deux fois : le sien, puis celui d'un autre membre. */
  const CASES = (Object.keys(ROUTE_DESTINATIONS) as RouteKey[]).flatMap((key): [string, string, NavDestination][] => {
    const home = ROUTE_DESTINATIONS[key]
    if (home.kind === "outside") return []
    if (home.kind === "person") return [[key, compose(key, MEMBER.handle), "profile"], [key, compose(key, "autre.membre"), "explore"]]
    return [[key, compose(key, "valeur-1"), home.destination]]
  })

  it("parcourt toutes les adresses de membre de la table des routes", () => {
    expect(CASES.length).toBeGreaterThan(60)
  })

  it.each(CASES)("%s (%s) : seule l'entrée de « %s » est courante, à la barre ou dans le menu du compte", async (_key, pathname, destination) => {
    // Tous modules servis, un membre responsable qui gère une page et adhère à une association : chaque entrée existe.
    renderShell({ pathname, icom: true, network: true, responsible: true, holdings: HOLDS_ALL })
    const label = t(LABEL_KEYS[destination])
    const { rail, bar } = mainNavigations()
    const marked = () => Array.from(document.querySelectorAll("[aria-current]")).map((element) => element.textContent)
    if (PRIMARY.has(destination)) {
      expect(currentLinks(rail)).toEqual([label])
      expect(currentLinks(bar)).toEqual([label])
      expect(marked()).toEqual([label, label])
      return
    }
    // Sous l'avatar (CH-816, plus de « Mon espace » au rail) : ni le rail ni la barre ne marquent
    // d'entrée, le menu du compte marque la sienne.
    expect(currentLinks(rail)).toEqual([])
    expect(currentLinks(bar)).toEqual([])
    expect(marked()).toEqual([])
    await userEvent.setup().click(accountTrigger("dialog"))
    const sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    expect(currentLinks(sheet)).toEqual([label])
    expect(marked()).toEqual([label])
  })
})

describe("coque — la pastille de non-lus sur Messages (UX-06)", () => {
  /** Le chiffre du serveur arrive : la coque le pose, sans rechargement. */
  function report(total: number) {
    const send = mocks.reportUnread
    expect(send).not.toBeNull()
    act(() => send?.(total))
  }

  function badgeOf(link: HTMLElement) {
    return link.querySelector("[data-unread-badge]")
  }

  it("iCom fermé (démonstration, membre qui ne peut pas encore écrire) : aucune lecture, aucune pastille", () => {
    renderShell({ icom: false, network: true })
    expect(mocks.unreadReads).toBe(0)
    expect(mocks.reportUnread).toBeNull()
    expect(document.querySelector("[data-unread-badge]")).toBeNull()
  })

  it("iCom ouvert, rien d'attente : pas de pastille, Messages garde son seul libellé", () => {
    renderShell({ icom: true })
    expect(mocks.unreadReads).toBeGreaterThan(0)
    report(0)
    const { rail, bar } = mainNavigations()
    for (const navigation of [rail, bar]) {
      expect(badgeOf(within(navigation).getByRole("link", { name: "Messages" }))).toBeNull()
    }
  })

  it("un message reçu fait paraître la pastille au rail et à la barre basse, annoncée avec l'entrée ; le lire la retire", () => {
    renderShell({ icom: true })
    report(3)
    const { rail, bar } = mainNavigations()
    for (const navigation of [rail, bar]) {
      const link = within(navigation).getByRole("link", { name: "Messages, 3 non lus" })
      expect(link).toHaveAttribute("href", "/messages")
      // Le chiffre se voit, et ne s'entend qu'une fois : par le nom de l'entrée.
      expect(badgeOf(link)).toHaveTextContent("3")
      expect(badgeOf(link)).toHaveAttribute("aria-hidden", "true")
    }
    report(0)
    for (const navigation of [rail, bar]) {
      expect(badgeOf(within(navigation).getByRole("link", { name: "Messages" }))).toBeNull()
    }
  })

  it("au singulier : « Messages, 1 non lu »", () => {
    renderShell({ icom: true })
    report(1)
    const { rail, bar } = mainNavigations()
    expect(within(rail).getByRole("link", { name: "Messages, 1 non lu" })).toBeInTheDocument()
    expect(within(bar).getByRole("link", { name: "Messages, 1 non lu" })).toBeInTheDocument()
  })

  it("plafonnée comme la carte iCom : « 99+ » à l'écran, « 99 non lus ou plus » annoncé", () => {
    renderShell({ icom: true })
    report(99)
    const { rail, bar } = mainNavigations()
    for (const navigation of [rail, bar]) {
      expect(badgeOf(within(navigation).getByRole("link", { name: "Messages, 99 non lus ou plus" }))).toHaveTextContent("99+")
    }
  })

  it("sur la messagerie, l'entrée reste la seule courante et garde sa pastille", () => {
    renderShell({ pathname: "/messages/conversation-7", icom: true })
    report(2)
    const { rail, bar } = mainNavigations()
    for (const navigation of [rail, bar]) {
      expect(within(navigation).getByRole("link", { name: "Messages, 2 non lus" })).toHaveAttribute("aria-current", "page")
      expect(within(navigation).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1)
    }
  })

  it("parle anglais", () => {
    renderShell({ icom: true, locale: "en" })
    report(3)
    const { rail, bar } = mainNavigations("en")
    expect(within(rail).getByRole("link", { name: "Messages, 3 unread" })).toBeInTheDocument()
    expect(within(bar).getByRole("link", { name: "Messages, 3 unread" })).toBeInTheDocument()
    report(99)
    expect(within(bar).getByRole("link", { name: "Messages, 99 or more unread" })).toBeInTheDocument()
  })
})

describe("coque — le menu du compte, sous l'avatar", () => {
  // Tous modules servis, un membre qui gère une page et adhère à une association (`HOLDS_ALL`).
  const ACCOUNT = [
    ["Profil", "/@awa.demo"],
    ["Réglages", "/parametres"],
    ["Mes demandes", "/mes-demandes"],
    ["Mes pages", "/mon-activite"],
    ["Mes associations", "/mes-associations"],
    ["Mes candidatures", "/mes-candidatures"],
    ["Mes mentorats", "/mes-mentorats"],
    ["Mes relations", "/relations"],
    ["Mes enregistrements", "/enregistrements"],
    ["Parrainer", "/parrainer"],
    ["Mes données", "/parametres#mes-donnees"],
  ]
  const INFORMATION = [
    ["Mentions légales", "/mentions-legales"],
    ["Confidentialité", "/confidentialite"],
    ["Conditions d'utilisation", "/conditions-utilisation"],
    ["Règles de la communauté", "/regles-communaute"],
    ["Contact", "/contact"],
    ["Charte graphique", "/charte"],
  ]
  const SIGN_OUT = "Se déconnecter partout"

  it("au bureau : un menu au clavier — Entrée l'ouvre, les flèches le parcourent, Échap rend le focus à l'avatar", async () => {
    const user = userEvent.setup()
    renderShell({ pathname: "/parametres", network: true, holdings: HOLDS_ALL })
    const trigger = accountTrigger("menu")
    trigger.focus()
    await user.keyboard("{Enter}")

    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    // Le compte, puis les informations du site, puis la sortie (une action, pas un lien).
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([...ACCOUNT, ...INFORMATION, [SIGN_OUT, null]])
    expect(menuItemsOf(within(menu).getByRole("group", { name: "Informations" }))).toEqual(INFORMATION)
    expect(items.filter((item) => item.getAttribute("aria-current") === "page").map((item) => item.textContent)).toEqual(["Réglages"])
    expect(items[0]).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(items[1]).toHaveFocus()
    await user.keyboard("{End}")
    expect(items[items.length - 1]).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it("au téléphone : une feuille — Échap la ferme et rend le focus à l'avatar, suivre un lien la referme", async () => {
    mocks.desktop = false
    const user = userEvent.setup()
    renderShell({ pathname: "/@awa.demo/albums/album-1", network: true, holdings: HOLDS_ALL })
    const trigger = accountTrigger("dialog")

    await user.click(trigger)
    let sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    expect(linksOf(within(sheet).getByRole("navigation", { name: "Mon compte" }))).toEqual(ACCOUNT)
    expect(linksOf(within(sheet).getByRole("navigation", { name: "Informations" }))).toEqual(INFORMATION)
    // La sortie, en bouton neutre, est le seul bouton de la feuille hors de sa fermeture.
    expect(within(sheet).getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
      "Fermer le menu du compte",
      SIGN_OUT,
    ])
    expect(currentLinks(sheet)).toEqual(["Profil"])
    expect(sheet).toHaveTextContent("@awa.demo")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Mon compte" })).toBeNull()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    await user.click(within(sheet).getByRole("link", { name: "Parrainer" }))
    expect(screen.queryByRole("dialog", { name: "Mon compte" })).toBeNull()
  })

  it("aucun lien d'avant n'est perdu : profil, réglages, relations et parrainage restent à deux gestes", async () => {
    const user = userEvent.setup()
    renderShell({ network: true })
    await user.click(accountTrigger("dialog"))
    const sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    for (const [label, href] of [
      ["Profil", "/@awa.demo"],
      ["Réglages", "/parametres"],
      ["Mes relations", "/relations"],
      ["Parrainer", "/parrainer"],
    ] as const) {
      expect(within(sheet).getByRole("link", { name: label })).toHaveAttribute("href", href)
    }
  })
  it.each([
    ["Mentions légales", "/mentions-legales"],
    ["Confidentialité", "/confidentialite"],
    ["Conditions d'utilisation", "/conditions-utilisation"],
    ["Règles de la communauté", "/regles-communaute"],
    ["Contact", "/contact"],
    ["Charte graphique", "/charte"],
  ])("« %s » est à deux gestes depuis tout écran : l'avatar, puis le lien, au bureau comme au téléphone", async (label, href) => {
    const user = userEvent.setup()
    renderShell({ pathname: "/services/offre-coiffure" })

    await user.click(accountTrigger("menu"))
    const menu = await screen.findByRole("menu")
    expect(within(within(menu).getByRole("group", { name: "Informations" })).getByRole("menuitem", { name: label })).toHaveAttribute("href", href)
    await user.keyboard("{Escape}")

    mocks.desktop = false
    await user.click(accountTrigger("dialog"))
    const sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    const link = within(within(sheet).getByRole("navigation", { name: "Informations" })).getByRole("link", { name: label })
    expect(link).toHaveAttribute("href", href)
    await user.click(link)
    expect(screen.queryByRole("dialog", { name: "Mon compte" })).toBeNull()
  })

  it("se déconnecter partout depuis le menu du bureau, au clavier : la porte unique est appelée une fois, le menu dit l'attente", async () => {
    const user = userEvent.setup()
    const exit = pendingSignOut()
    renderShell({ actions: { signOutEverywhere: exit.action } })
    const trigger = accountTrigger("menu")
    trigger.focus()
    await user.keyboard("{Enter}")
    const menu = await screen.findByRole("menu")
    await user.keyboard("{End}")
    expect(within(menu).getByRole("menuitem", { name: SIGN_OUT })).toHaveFocus()

    await user.keyboard("{Enter}")
    await user.keyboard("{Enter}")
    expect(exit.action).toHaveBeenCalledOnce()
    // Le menu reste ouvert : la sortie s'y lit, fermée à un second geste.
    const pending = within(screen.getByRole("menu")).getByRole("menuitem", { name: "Déconnexion…" })
    expect(pending).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("menu")).toHaveAttribute("aria-busy", "true")

    // La démonstration recharge l'accueil une fois la sortie faite (le moteur garde sa propre navigation).
    const assign = stubPageNavigation()
    await act(async () => {
      exit.finish()
      await exit.pending
    })
    expect(assign).toHaveBeenCalledExactlyOnceWith(routes.home())
  })

  it("se déconnecter partout depuis la feuille du téléphone ; un échec reste générique, passe par un avis et laisse réessayer", async () => {
    mocks.desktop = false
    const user = userEvent.setup()
    const failed = vi.spyOn(toast, "error")
    const action = vi.fn<DiasporaGaActions["signOutEverywhere"]>().mockRejectedValueOnce(new Error("diagnostic privé de la révocation")).mockReturnValue(new Promise<void>(() => {}))
    renderShell({ actions: { signOutEverywhere: action } })
    await user.click(accountTrigger("dialog"))
    const sheet = await screen.findByRole("dialog", { name: "Mon compte" })

    await user.click(within(sheet).getByRole("button", { name: SIGN_OUT }))
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce())
    expect(failed).toHaveBeenCalledWith(t("errors.unknown"), expect.objectContaining({ id: expect.any(String) }))
    expect(screen.queryByText(/diagnostic privé/)).toBeNull()
    expect(within(sheet).getByRole("button", { name: SIGN_OUT })).toBeEnabled()

    await user.click(within(sheet).getByRole("button", { name: SIGN_OUT }))
    expect(action).toHaveBeenCalledTimes(2)
    expect(within(sheet).getByRole("button", { name: "Déconnexion…" })).toBeDisabled()
    expect(failed).toHaveBeenCalledOnce()
  })

  it("parle anglais : informations et sortie dans la langue de la personne", async () => {
    const user = userEvent.setup()
    renderShell({ locale: "en" })
    await user.click(accountTrigger("menu", "Account menu (Awa Ogooué)"))
    const menu = await screen.findByRole("menu")
    expect(menuItemsOf(within(menu).getByRole("group", { name: "Information" }))).toEqual([
      ["Legal notice", "/mentions-legales"],
      ["Privacy", "/confidentialite"],
      ["Terms of use", "/conditions-utilisation"],
      ["Community rules", "/regles-communaute"],
      ["Contact", "/contact"],
      ["Design charter", "/charte"],
    ])
    expect(within(menu).getByRole("menuitem", { name: "Sign out everywhere" })).not.toHaveAttribute("href")
  })
})

describe("coque — Publier, une action stable", () => {
  it("ouvre le composeur depuis l'en-tête, depuis le rail et depuis un écran (useComposer)", async () => {
    const user = userEvent.setup()
    renderShell()
    const [railButton, headerButton] = screen.getAllByRole("button", { name: "Publier" })
    expect(railButton).not.toHaveAttribute("aria-disabled")
    expect(headerButton).not.toHaveAttribute("aria-disabled")

    await user.click(headerButton!)
    expect(screen.getByRole("dialog", { name: "Composeur" })).toBeInTheDocument()
    expect(mocks.composer).toHaveBeenCalledWith(
      expect.objectContaining({ open: true, memberCountry: "FR", draftKey: "diaspora-ga:brouillon:persons_awa" }),
    )
  })

  it("un écran ouvre le même composeur par useComposer", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Quoi de neuf ?" }))
    expect(screen.getByRole("dialog", { name: "Composeur" })).toBeInTheDocument()
  })

  it("fermée pour un compte en attente : focalisable, raison annoncée, explication et chemins sans composeur", async () => {
    const user = userEvent.setup()
    renderShell({ membership: { ...MEMBER, status: "en_attente", canPublish: false } })
    const reason = "Publication possible après un parrainage ou une vérification"
    const buttons = screen.getAllByRole("button", { name: "Publier" })
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-disabled", "true")
      expect(button).not.toBeDisabled()
      expect(button).toHaveAccessibleDescription(reason)
    }
    // Écrite sous le bouton du rail, annoncée avec celui de l'en-tête.
    expect(screen.getAllByText(reason)).toHaveLength(2)

    const headerButton = buttons[1]!
    await user.click(headerButton)
    const explanation = await screen.findByRole("dialog", { name: reason })
    expect(explanation).toHaveTextContent("Pour publier, demandez un parrainage à un membre vérifié")
    expect(within(explanation).getByRole("link", { name: "Obtenir un parrainage" })).toHaveAttribute("href", "/parametres#parrainage")
    expect(within(explanation).getByRole("link", { name: "Vérifier mon inscription consulaire" })).toHaveAttribute("href", "/verification")
    expect(screen.queryByRole("dialog", { name: "Composeur" })).toBeNull()
    expect(mocks.composer).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: reason })).toBeNull()
    expect(headerButton).toHaveFocus()

    // Suivre un chemin referme l'explication.
    await user.click(headerButton)
    await user.click(within(await screen.findByRole("dialog", { name: reason })).getByRole("link", { name: "Obtenir un parrainage" }))
    expect(screen.queryByRole("dialog", { name: reason })).toBeNull()
  })

  it("fermée pendant une suspension : la raison et le chemin des recours", async () => {
    const user = userEvent.setup()
    renderShell({ membership: { ...MEMBER, status: "suspendue", canPublish: false } })
    const [railButton] = screen.getAllByRole("button", { name: "Publier" })
    expect(railButton).toHaveAccessibleDescription("Publication indisponible pendant la suspension du compte")

    await user.click(railButton!)
    const explanation = await screen.findByRole("dialog", { name: "Votre compte est suspendu." })
    expect(explanation).toHaveTextContent("Vous pourrez publier de nouveau à la fin de la suspension.")
    expect(within(explanation).getByRole("link", { name: "Mes données" })).toHaveAttribute("href", "/parametres#mes-donnees")
    await user.click(within(explanation).getByRole("button", { name: "Fermer l'explication" }))
    expect(screen.queryByRole("dialog", { name: "Votre compte est suspendu." })).toBeNull()
  })
})

describe("coque — le contexte pays", () => {
  it("garde le pays de résidence visible et le relie à Communautés", () => {
    renderShell()
    const homeLinks = screen.getAllByRole("link", { name: /^Mon pays/ })
    expect(homeLinks.length).toBeGreaterThan(0)
    for (const link of homeLinks) {
      expect(link).toHaveAttribute("href", "/communautes")
      expect(link).toHaveTextContent("France")
    }
  })

  it("annonce la zone consultée sur le hub d'un autre pays, sans toucher à la résidence", () => {
    renderShell({ pathname: "/pays/ca" })
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("Zone consultée : Canada")
    expect(note).toHaveTextContent("Votre pays de résidence ne change pas : France.")
    expect(within(note).getByRole("link", { name: "Revenir à mon pays" })).toHaveAttribute("href", "/communautes")
  })

  it.each(["/pays/fr", "/pays/ga", "/pays/xx", "/communautes", "/fil"])("sur %s, aucune zone consultée n'est annoncée", (pathname) => {
    renderShell({ pathname })
    expect(screen.queryByRole("note")).toBeNull()
  })

  it("dit la zone consultée en anglais", () => {
    renderShell({ pathname: "/pays/be", locale: "en" })
    expect(screen.getByRole("note")).toHaveTextContent("Area you're viewing: Belgium")
    expect(screen.getByRole("link", { name: "Back to my country" })).toHaveAttribute("href", "/communautes")
  })

  /** Les deux liens « Mon pays » : au rail du bureau et dans l'en-tête du téléphone. */
  function homeCountryLinks() {
    const links = screen.getAllByRole("link", { name: /^Mon pays/ })
    expect(links).toHaveLength(2)
    return links
  }

  it.each(["/communautes", "/pays/fr", "/pays/ca"])(
    "sur %s, sans « Communautés » dans la barre, « Mon pays » est l'entrée courante (CH-816)",
    (pathname) => {
      renderShell({ pathname, icom: true, features: ["pages"] })
      const { rail, bar } = mainNavigations()
      expect(currentLinks(rail)).toEqual([])
      expect(currentLinks(bar)).toEqual([])
      for (const link of homeCountryLinks()) expect(link).toHaveAttribute("aria-current", "page")
    },
  )

  it("avec « Communautés » dans la barre, c'est elle l'entrée courante du hub, pas « Mon pays »", () => {
    renderShell({ pathname: "/pays/fr", icom: true, features: ["pages", "groupsAndEvents"] })
    expect(currentLinks(mainNavigations().bar)).toEqual(["Communautés"])
    for (const link of homeCountryLinks()) expect(link).not.toHaveAttribute("aria-current")
  })

  it("hors des adresses de Communautés, « Mon pays » n'est jamais courant", () => {
    renderShell({ pathname: "/fil", icom: true, features: ["pages"] })
    for (const link of homeCountryLinks()) expect(link).not.toHaveAttribute("aria-current")
  })
})

describe("coque — « Créer », le menu de création (modèle du réseau de l'administration)", () => {
  it("au bureau, sous « Publier » : une actu quand iCom est ouvert, puis les deux inscriptions, chacune dite en une ligne", async () => {
    const user = userEvent.setup()
    renderShell({ icom: true })
    // « Publier » garde son bouton à part : le menu ne le double pas (vu avant l'ouverture, le menu étant modal).
    expect(screen.getAllByRole("button", { name: "Publier" })).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: "Créer" }))
    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((item) => item.getAttribute("href"))).toEqual([routes.newStory(), routes.newPage("association"), routes.newPage("company")])
    expect(items[1]).toHaveTextContent("Inscrire une association")
    expect(items[1]).toHaveTextContent("Sa page, ses adhérents, son groupe et ses évènements.")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("sans iCom (démonstration), seulement les inscriptions", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Créer" }))
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem")
    expect(items.map((item) => item.getAttribute("href"))).toEqual([routes.newPage("association"), routes.newPage("company")])
  })

  it("au téléphone, la feuille du compte porte « Créer » ; suspendu, aucun format", async () => {
    mocks.desktop = false
    const user = userEvent.setup()
    renderShell({ network: true })
    await user.click(accountTrigger("dialog"))
    const sheet = await screen.findByRole("dialog", { name: "Mon compte" })
    expect(linksOf(within(sheet).getByRole("navigation", { name: "Créer" }))).toEqual([
      ["Inscrire une association", routes.newPage("association")],
      ["Inscrire une entreprise", routes.newPage("company")],
    ])
    cleanup()
    renderShell({ membership: { ...MEMBER, status: "suspendue", canPublish: false } })
    expect(screen.queryByRole("button", { name: "Créer" })).toBeNull()
  })
})

describe("réseau simple (ADR-0041 du moteur) : la coque ne monte que les modules ouverts", () => {
  const MODULE_HREFS = [routes.services(), routes.myServiceRequests(), routes.myActivity(), routes.myAssociations(), routes.myApplications(), routes.myMentoring(), routes.pilotDashboard()]

  it("tout fermé : la barre est Fil, Membres, Messages ; le menu du compte garde le socle", async () => {
    renderShell({ icom: true, network: true, responsible: true, features: [], holdings: HOLDS_ALL })
    const { bar } = mainNavigations()
    expect(within(bar).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([routes.feed(), routes.explore(), routes.messages()])
    const hrefs = linksOf(await openAccountSheet()).map(([, href]) => href)
    for (const href of MODULE_HREFS) expect(hrefs, href).not.toContain(href)
    for (const href of [routes.relations(), routes.bookmarks(), routes.sponsor(), routes.moderationDesk()]) expect(hrefs, href).toContain(href)
  })

  // Fiche de lancement, § 4 : trois entrées au jour J, quatre en vague 1, cinq en vague 2.
  it.each([
    [[], ["Fil", "Membres", "Messages"]],
    [["pages"], ["Fil", "Membres", "Messages"]],
    [["pages", "pilotMetrics"], ["Fil", "Membres", "Messages"]],
    [["pages", "services"], ["Fil", "Membres", "Services", "Messages"]],
    [["pages", "services", "groupsAndEvents"], ["Fil", "Membres", "Services", "Communautés", "Messages"]],
    [["pages", "jobs"], ["Fil", "Membres", "Communautés", "Messages"]],
  ] as const)("modules ouverts %j : la barre est %j, au rail comme au téléphone", (features, labels) => {
    renderShell({ icom: true, features })
    const { rail, bar } = mainNavigations()
    expect(linksOf(rail).map(([label]) => label)).toEqual(labels)
    expect(linksOf(bar).map(([label]) => label)).toEqual(labels)
    // Aucun nombre de colonnes écrit : de trois à cinq onglets se partagent la largeur, sans trou.
    const items = within(bar).getAllByRole("listitem")
    expect(items).toHaveLength(labels.length)
    for (const item of items) expect(item).toHaveClass("flex-auto")
    expect(bar.querySelector('[class*="grid-cols"]')).toBeNull()
  })

  it("tout fermé : « Créer » n'offre plus l'inscription d'une organisation", async () => {
    const user = userEvent.setup()
    renderShell({ icom: true, features: [] })
    await user.click(screen.getByRole("button", { name: "Créer" }))
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem")
    expect(items.map((item) => item.getAttribute("href"))).toEqual([routes.newStory()])
  })

  it("un module ouvert retrouve ses entrées, les autres restent fermés", async () => {
    renderShell({ icom: true, network: true, features: ["pages", "services"], holdings: HOLDS_ALL })
    const { bar } = mainNavigations()
    expect(within(bar).getAllByRole("link").map((link) => link.getAttribute("href"))).toContain(routes.services())
    const hrefs = linksOf(await openAccountSheet()).map(([, href]) => href)
    expect(hrefs).toEqual(expect.arrayContaining([routes.myServiceRequests(), routes.myActivity(), routes.myAssociations()]))
    expect(hrefs).not.toContain(routes.myApplications())
    expect(hrefs).not.toContain(routes.myMentoring())
  })

  it("l'adresse d'un module fermé dit « introuvable » dans la coque, comme une page qui n'existe pas", () => {
    renderShell({ pathname: routes.jobs(), features: [] })
    expect(screen.getByRole("heading", { level: 1, name: t("notFound.title") })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Quoi de neuf ?" })).toBeNull()
    expect(screen.getByRole("link", { name: t("appError.backToFeed") }).getAttribute("href")).toBe(routes.feed())
    cleanup()
    renderShell({ pathname: routes.jobs(), features: ["pages", "jobs"] })
    expect(screen.queryByRole("heading", { level: 1, name: t("notFound.title") })).toBeNull()
    expect(screen.getByRole("button", { name: "Quoi de neuf ?" })).toBeTruthy()
  })

  it("le socle reste servi ; pendant la lecture des modules, l'adresse d'un module attend sans rien affirmer", () => {
    renderShell({ pathname: routes.feed(), features: [] })
    expect(screen.getByRole("button", { name: "Quoi de neuf ?" })).toBeTruthy()
    cleanup()
    renderShell({ pathname: routes.mentoring(), features: "loading" })
    expect(screen.queryByRole("heading", { level: 1, name: t("notFound.title") })).toBeNull()
    expect(screen.queryByRole("button", { name: "Quoi de neuf ?" })).toBeNull()
  })
})

describe("coque — elle rend exactement le menu partagé, celui que montre l'aperçu d'admin.diaspora.ga (CH-815 A5)", () => {
  // Deux situations : un membre qui écrit, sans contenu ni rôle ; un responsable qui gère une page et adhère à une association.
  const SITUATIONS = [
    { name: "un membre qui écrit", icom: true, network: true, responsible: false, holdings: HOLDS_NOTHING, holds: false },
    { name: "un responsable qui gère une page et adhère", icom: true, network: true, responsible: true, holdings: HOLDS_ALL, holds: true },
  ] as const
  const FEATURE_SETS: readonly (readonly NetworkFeature[])[] = [[], ["pages"], NETWORK_FEATURES]
  const CASES = FEATURE_SETS.flatMap((features) => SITUATIONS.map((situation) => [features, situation.name, situation] as const))

  const entryLink = (entry: MemberMenuEntry) => [t(entry.labelKey), memberMenuHref(entry, MEMBER.handle)]
  const createHrefs = (entries: readonly MemberCreateEntry[]) => entries.map((entry) => memberCreateHref(entry))

  it.each(CASES)("modules %j, %s : rail, barre du téléphone, menu du compte et « Créer », au bureau comme au téléphone", async (features, _name, situation) => {
    const user = userEvent.setup()
    renderShell({ icom: situation.icom, network: situation.network, responsible: situation.responsible, holdings: situation.holdings, features })
    const expected = memberMenu({
      openFeatures: features,
      icom: situation.icom,
      engineNetwork: situation.network,
      canPublish: MEMBER.canPublish,
      status: MEMBER.status,
      holdsPageRole: situation.holds,
      holdsAssociation: situation.holds,
      moderator: situation.responsible,
      pilotReader: situation.responsible,
    })

    // La barre : le rail du bureau et la barre basse du téléphone.
    const { rail, bar } = mainNavigations()
    expect(linksOf(rail)).toEqual(expected.rail.map(entryLink))
    expect(linksOf(bar)).toEqual(expected.phoneBar.map(entryLink))

    // « Créer », au bureau.
    await user.click(screen.getByRole("button", { name: "Créer" }))
    const create = within(await screen.findByRole("menu")).getAllByRole("menuitem")
    expect(create.map((item) => item.getAttribute("href"))).toEqual(createHrefs(expected.create))
    expected.create.forEach((entry, index) => expect(create[index]).toHaveTextContent(t(entry.labelKey)))
    await user.keyboard("{Escape}")

    // Le menu du compte, au bureau : profil, réglages, « Mon espace », mes données, puis les informations.
    const account = menuItemsOf(await openAccountMenu()).filter(([, href]) => href !== null)
    expect(account).toEqual([...expected.account, ...expected.information].map(entryLink))
    await user.keyboard("{Escape}")

    // La feuille du compte, au téléphone : les mêmes entrées, « Créer » et les informations.
    await user.click(accountTrigger("dialog"))
    const sheet = within(await screen.findByRole("dialog", { name: "Mon compte" }))
    expect(linksOf(sheet.getByRole("navigation", { name: "Mon compte" }))).toEqual(expected.account.map(entryLink))
    expect(linksOf(sheet.getByRole("navigation", { name: "Créer" })).map(([, href]) => href)).toEqual(createHrefs(expected.create))
    expect(linksOf(sheet.getByRole("navigation", { name: "Informations" }))).toEqual(expected.information.map(entryLink))
  })
})
