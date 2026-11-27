// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import { RoutingProvider, type FeatureRoutes, type LinkComponent } from "@diaspora-ga/features"
import { GatedDataSourceProvider, NETWORK_FEATURES, type DiasporaGaDataSource, type Loadable, type MembershipView, type NetworkFeature, type SessionView } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CONSULATE_GATEWAY_SEEN_KEY, consulateGatewayLinks } from "@/lib/consulate-gateway"
import { routes } from "@/lib/routes"

import { AppShell } from "./app-shell"

/**
 * CH-863 — la passerelle « consulat.ga » dans la coque des membres : le groupe
 * « Démarches administratives » du menu du compte (bureau et téléphone), entre « Mon espace » et
 * « Mes données », et un lien discret au pied du rail du bureau. Un vrai lien vers consulat.ga,
 * dans le même onglet ; la première fois, un clic simple ouvre la feuille d'information ; ensuite,
 * il mène directement. Elle est réglée par le module du réseau `consulateGateway`, fermé par
 * défaut et ouvert dans admin.diaspora.ga : module fermé, lecture des modules en cours, ou adresse
 * de consulat.ga absente, rien n'est monté. La coque est montée comme dans l'application : par le
 * fournisseur GARDÉ, qui lit les modules ouverts du réseau.
 */
const mocks = vi.hoisted(() => ({
  pathname: "/fil",
  desktop: true,
  consulateUrl: null as string | null,
  idnPortalUrl: null as string | null,
  /** Les modules que le réseau dit ouverts (`networks/features.open`) ; `null` : la lecture n'a pas encore répondu. */
  openFeatures: ["consulateGateway"] as readonly string[] | null,
  /** Les liens vers consulat.ga que le navigateur suivrait (clic non intercepté), dans l'ordre. */
  followed: [] as string[],
}))

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>()
  return {
    ...actual,
    publicEnv: {
      ...actual.publicEnv,
      get consulateUrl() {
        return mocks.consulateUrl
      },
      get idnPortalUrl() {
        return mocks.idnPortalUrl
      },
    },
  }
})
vi.mock("@antsia/social-features/features/iappel/conference-launch-store", () => ({ requestConferenceLaunch: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
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
vi.mock("@/components/icom", () => ({
  useIcomNetwork: () => null,
  useEngineNetwork: () => null,
  IcomIsland: (props: { children: ReactNode }) => <>{props.children}</>,
}))
vi.mock("@antsia/social-features/messagerie", () => ({ MessagerieDock: () => null }))
vi.mock("@/components/messages-unread", () => ({ MessagesUnreadReader: () => null }))
vi.mock("@antsia/ui/overlay", () => ({ useIsReseauMobile: () => !mocks.desktop }))
vi.mock("@diaspora-ga/features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@diaspora-ga/features")>()),
  PostComposerSheet: () => null,
}))

const t = getFixedT("fr")
const NOW = Date.UTC(2026, 10, 26, 12)
const ORIGIN = "https://consulat.example"
const LINKS = consulateGatewayLinks(ORIGIN)!

const MEMBER: MembershipView = {
  personId: "persons_awa",
  handle: "awa.demo",
  displayName: "Awa OGOOUÉ",
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
const ATTESTED: MembershipView = { ...MEMBER, status: "verifiee", attestation: { outcome: "verified", postSlug: "consulat-paris", requestedAt: 1 } }

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

/** La session du compte : relié à identite.ga, ou compte léger (code par e-mail). */
function sessionOf(membership: MembershipView, idn: boolean): Loadable<SessionView> {
  return {
    status: "ready",
    data: {
      status: "signed_in",
      account: { id: "accounts_awa", idn: idn ? { loa: 2 } : null, local: idn ? null : { kind: "email", masked: "a•••@exemple.org" }, nameHints: {} },
      membership,
    },
  }
}

function renderShell(options: { membership?: MembershipView; idn?: boolean } = {}) {
  const membership = options.membership ?? MEMBER
  const demo = createDemoDataSource(new DemoStore(null, () => NOW, 0))
  const session = sessionOf(membership, options.idn ?? false)
  // Les modules ouverts, tels que le moteur les rend à un membre ; lus à chaque rendu.
  const open = (): Loadable<readonly NetworkFeature[]> =>
    mocks.openFeatures === null ? { status: "loading" } : { status: "ready", data: NETWORK_FEATURES.filter((feature) => mocks.openFeatures?.includes(feature)) }
  const source: DiasporaGaDataSource = { ...demo, useSession: () => session, networkFeatures: { useOpen: open } }
  const tree = () => (
    <I18nProvider locale="fr">
      <GatedDataSourceProvider source={source}>
        <RoutingProvider routes={featureRoutes} Link={Link}>
          <AppShell membership={membership}>
            <p>Contenu</p>
          </AppShell>
        </RoutingProvider>
      </GatedDataSourceProvider>
    </I18nProvider>
  )
  const view = render(tree())
  /** Le réseau a répondu, ou une décision est tombée : le même arbre relit les modules ouverts. */
  return { ...view, refresh: () => view.rerender(tree()) }
}

/** Note les liens vers consulat.ga que le navigateur suivrait, sans laisser jsdom naviguer. */
function recordOutboundClicks(event: MouseEvent) {
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
  if (!link || !link.href.startsWith(ORIGIN)) return
  if (!event.defaultPrevented) mocks.followed.push(link.getAttribute("href") ?? "")
  event.preventDefault()
}

function accountTrigger(kind: "menu" | "dialog") {
  const trigger = screen.getAllByRole("button", { name: `Menu du compte (${MEMBER.displayName})` }).find((button) => button.getAttribute("aria-haspopup") === kind)
  expect(trigger).toBeDefined()
  return trigger!
}

async function openAccountMenu() {
  const user = userEvent.setup()
  await user.click(accountTrigger("menu"))
  return screen.findByRole("menu")
}

const GROUP = "Démarches administratives"
const SHEET_TITLE = t("consulateGateway.sheet.title")

beforeEach(() => {
  mocks.pathname = "/fil"
  mocks.desktop = true
  mocks.consulateUrl = ORIGIN
  mocks.idnPortalUrl = null
  // L'administrateur du réseau a ouvert le module : l'état des tests qui regardent la passerelle.
  mocks.openFeatures = ["consulateGateway"]
  mocks.followed = []
  window.localStorage.clear()
  window.addEventListener("click", recordOutboundClicks)
})

afterEach(() => {
  window.removeEventListener("click", recordOutboundClicks)
  cleanup()
  vi.clearAllMocks()
})

it("le badge CONSULAT.GA du fil ouvre l’espace consulaire au téléphone", () => {
  mocks.desktop = false
  renderShell()
  const badge = screen.getByRole("link", { name: /^CONSULAT\.GA$/i })
  expect(badge).toHaveAttribute("href", LINKS.mySpace)
  expect(badge).toHaveAttribute("target", "_blank")
})

describe("coque — passerelle consulat.ga absente", () => {
  it("sans adresse de consulat.ga configurée : ni groupe, ni lien du rail, au bureau comme au téléphone", async () => {
    mocks.consulateUrl = null
    renderShell()
    expect(screen.queryByRole("link", { name: t("consulateGateway.rail") })).toBeNull()
    const menu = await openAccountMenu()
    expect(within(menu).queryByRole("group", { name: GROUP })).toBeNull()
    expect(within(menu).queryByRole("menuitem", { name: t("consulateGateway.entry.label") })).toBeNull()
  })

  it("module fermé (aucune décision : l'état de départ du réseau) : rien, même avec l'adresse, au bureau", async () => {
    mocks.openFeatures = []
    renderShell()
    expect(screen.queryByRole("link", { name: t("consulateGateway.rail") })).toBeNull()
    const menu = await openAccountMenu()
    expect(within(menu).queryByRole("group", { name: GROUP })).toBeNull()
    expect(within(menu).queryByRole("menuitem", { name: t("consulateGateway.entry.label") })).toBeNull()
  })

  it("module fermé : rien non plus au téléphone, dans la feuille du compte", async () => {
    mocks.openFeatures = []
    mocks.desktop = false
    const user = userEvent.setup()
    renderShell()
    await user.click(accountTrigger("dialog"))
    const account = await screen.findByRole("dialog", { name: "Mon compte" })
    expect(within(account).queryByRole("group", { name: GROUP })).toBeNull()
    expect(within(account).queryByRole("link", { name: t("consulateGateway.entry.label") })).toBeNull()
  })

  it("tous les autres modules ouverts, pas le sien : rien — aucun autre module ne l'apporte", async () => {
    mocks.openFeatures = NETWORK_FEATURES.filter((feature) => feature !== "consulateGateway")
    renderShell()
    expect(screen.queryByRole("link", { name: t("consulateGateway.rail") })).toBeNull()
    const menu = await openAccountMenu()
    expect(within(menu).queryByRole("group", { name: GROUP })).toBeNull()
  })

  it("tant que la lecture des modules n'a pas répondu : rien ; elle paraît dès que le réseau la dit ouverte, et se retire s'il la referme, sans rechargement", () => {
    mocks.openFeatures = null
    const view = renderShell()
    expect(screen.queryByRole("link", { name: t("consulateGateway.rail") })).toBeNull()
    mocks.openFeatures = ["consulateGateway"]
    view.refresh()
    expect(screen.getByRole("link", { name: t("consulateGateway.rail") })).toHaveAttribute("href", LINKS.mySpace)
    mocks.openFeatures = []
    view.refresh()
    expect(screen.queryByRole("link", { name: t("consulateGateway.rail") })).toBeNull()
  })

  it("module ouvert par l'administrateur du réseau, seul : la passerelle paraît, sans qu'aucun autre module le soit", async () => {
    renderShell()
    expect(screen.getByRole("link", { name: t("consulateGateway.rail") })).toHaveAttribute("href", LINKS.mySpace)
    const menu = await openAccountMenu()
    expect(within(within(menu).getByRole("group", { name: GROUP })).getByRole("menuitem", { name: t("consulateGateway.entry.label") })).toHaveAttribute("href", LINKS.mySpace)
  })
})

describe("coque — passerelle consulat.ga au bureau, dans le menu du compte", () => {
  it("un groupe « Démarches administratives » entre « Mon espace » et « Mes données », un vrai lien vers l'espace consulat.ga", async () => {
    renderShell()
    const menu = await openAccountMenu()
    const group = within(menu).getByRole("group", { name: GROUP })
    const entry = within(group).getByRole("menuitem", { name: t("consulateGateway.entry.label") })
    expect(entry).toHaveAttribute("href", LINKS.mySpace)
    expect(entry).toHaveAttribute("rel", "noopener noreferrer")
    expect(entry).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(entry).toHaveAttribute("target", "_blank")
    expect(entry).toHaveAccessibleDescription(t("consulateGateway.entry.hint"))
    // L'ordre des familles : « Mon espace », puis les démarches, puis « Mes données ».
    const order = Array.from(menu.querySelectorAll('[role="group"], [role="menuitem"]')).map((node) =>
      node.getAttribute("role") === "group" ? `[${node.getAttribute("aria-labelledby") ? document.getElementById(node.getAttribute("aria-labelledby")!)?.textContent : ""}]` : node.textContent,
    )
    const space = order.indexOf("[Mon espace]")
    const gateway = order.indexOf(`[${GROUP}]`)
    const data = order.indexOf("Mes données")
    expect(space).toBeGreaterThan(-1)
    expect(gateway).toBeGreaterThan(space)
    expect(data).toBeGreaterThan(gateway)
  })

  it("le premier clic simple ouvre la feuille (le menu se ferme, le focus passe au titre puis revient à l'avatar) ; le suivant mène à consulat.ga", async () => {
    const user = userEvent.setup()
    renderShell()
    let menu = await openAccountMenu()
    await user.click(within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }))
    const sheet = await screen.findByRole("dialog", { name: SHEET_TITLE })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(mocks.followed).toEqual([])
    expect(window.localStorage.getItem(CONSULATE_GATEWAY_SEEN_KEY)).toBe("1")
    await waitFor(() => expect(within(sheet).getByRole("heading", { name: SHEET_TITLE })).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(accountTrigger("menu")).toHaveFocus()

    menu = await openAccountMenu()
    await user.click(within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }))
    expect(screen.queryByRole("dialog", { name: SHEET_TITLE })).toBeNull()
    expect(mocks.followed).toEqual([LINKS.mySpace])
  })

  it("au clavier : Entrée sur l'entrée ouvre la feuille la première fois", async () => {
    const user = userEvent.setup()
    renderShell()
    const trigger = accountTrigger("menu")
    trigger.focus()
    await user.keyboard("{Enter}")
    const menu = await screen.findByRole("menu")
    within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }).focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: SHEET_TITLE })).toBeInTheDocument()
    expect(mocks.followed).toEqual([])
  })

  it("un clic avec une touche de modification passe tel quel : aucune feuille, rien de retenu", async () => {
    const user = userEvent.setup()
    renderShell()
    const menu = await openAccountMenu()
    await user.keyboard("{Control>}")
    await user.click(within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }))
    await user.keyboard("{/Control}")
    expect(screen.queryByRole("dialog", { name: SHEET_TITLE })).toBeNull()
    expect(mocks.followed).toEqual([LINKS.mySpace])
    expect(window.localStorage.getItem(CONSULATE_GATEWAY_SEEN_KEY)).toBeNull()
  })

  it("inscription attestée par le consulat : « Mon espace consulat.ga », sans feuille, dès le premier clic", async () => {
    const user = userEvent.setup()
    renderShell({ membership: ATTESTED })
    const menu = await openAccountMenu()
    const entry = within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.attestedLabel") })
    await user.click(entry)
    expect(screen.queryByRole("dialog", { name: SHEET_TITLE })).toBeNull()
    expect(mocks.followed).toEqual([LINKS.mySpace])
  })

  it("la feuille suit la personne : compte relié à identite.ga, ouvrir son espace ; compte léger, les étapes et l'inscription", async () => {
    const user = userEvent.setup()
    renderShell({ idn: true })
    let menu = await openAccountMenu()
    await user.click(within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }))
    let sheet = await screen.findByRole("dialog", { name: SHEET_TITLE })
    expect(within(sheet).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([LINKS.mySpace, LINKS.register])
    cleanup()

    window.localStorage.clear()
    mocks.idnPortalUrl = "https://identite.example"
    renderShell({ idn: false })
    menu = await openAccountMenu()
    await user.click(within(menu).getByRole("menuitem", { name: t("consulateGateway.entry.label") }))
    sheet = await screen.findByRole("dialog", { name: SHEET_TITLE })
    expect(within(sheet).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([LINKS.register, LINKS.mySpace, "https://identite.example"])
  })
})

describe("coque — passerelle consulat.ga au pied du rail du bureau", () => {
  it("visible sans ouvrir le menu, dans la carte du rail ; le premier clic ouvre la feuille, le focus lui revient", async () => {
    const user = userEvent.setup()
    const { container } = renderShell()
    const rail = container.querySelector<HTMLElement>("[data-desktop-rail]")!
    const link = within(rail).getByRole("link", { name: t("consulateGateway.rail") })
    expect(link).toHaveAttribute("href", LINKS.mySpace)
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(link).toHaveAccessibleDescription(t("consulateGateway.entry.hint"))
    await user.click(link)
    expect(await screen.findByRole("dialog", { name: SHEET_TITLE })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(link).toHaveFocus()
    await user.click(link)
    expect(mocks.followed).toEqual([LINKS.mySpace])
  })

  it("attestée : « Mon espace consulat.ga » au pied du rail aussi", () => {
    const { container } = renderShell({ membership: ATTESTED })
    const rail = container.querySelector<HTMLElement>("[data-desktop-rail]")!
    expect(within(rail).getByRole("link", { name: t("consulateGateway.entry.attestedLabel") })).toHaveAttribute("href", LINKS.mySpace)
  })
})

describe("coque — passerelle consulat.ga au téléphone, dans la feuille du compte", () => {
  it("le même groupe, entre « Mon espace » et « Mes données » ; le premier clic ferme la feuille du compte et ouvre l'information", async () => {
    mocks.desktop = false
    const user = userEvent.setup()
    renderShell()
    await user.click(accountTrigger("dialog"))
    const account = await screen.findByRole("dialog", { name: "Mon compte" })
    const group = within(account).getByRole("group", { name: GROUP })
    const link = within(group).getByRole("link", { name: t("consulateGateway.entry.label") })
    expect(link).toHaveAttribute("href", LINKS.mySpace)
    const data = within(account).getByRole("link", { name: "Mes données" })
    expect(group.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const space = within(account).queryByRole("group", { name: "Mon espace" })
    if (space) expect(space.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(link)
    const sheet = await screen.findByRole("dialog", { name: SHEET_TITLE })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mon compte" })).toBeNull())
    expect(mocks.followed).toEqual([])
    await waitFor(() => expect(within(sheet).getByRole("heading", { name: SHEET_TITLE })).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(accountTrigger("dialog")).toHaveFocus()
  })
})
