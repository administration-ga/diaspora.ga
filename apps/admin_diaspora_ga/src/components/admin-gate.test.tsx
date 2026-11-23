// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { StrictMode, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { REQUESTED_SECTION_KEY } from "@/lib/requested-section"

/**
 * CH-815 A4 — la garde : rien de la coque ni d'une section ne se monte, ni ne lit, avant
 * les deux réponses du serveur (administration prouvée, puis accès journalisé) ; un refus
 * est indistinct ; l'accès n'est inscrit qu'une fois.
 */
const NETWORK = { _id: "network-diaspora", slug: "diaspora-ga", name: "DIASPORA.GA" }
const ADMIN = { personId: "person-one", displayName: "Awa NDONG", networkId: "network-diaspora", networkSlug: "diaspora-ga", networkName: "DIASPORA.GA" }

const mocks = vi.hoisted(() => ({
  convexUrl: "configured" as string | null,
  auth: { isAuthenticated: false, isUnauthenticated: false, isPending: false },
  network: undefined as unknown,
  admin: undefined as unknown,
  adminFailure: null as unknown,
  queried: [] as string[],
  args: new Map<string, unknown>(),
  record: vi.fn(),
  replace: vi.fn(),
  pathname: "/",
  section: vi.fn(),
}))

vi.mock("@/lib/env", () => ({
  get publicEnv() {
    return { convexUrl: mocks.convexUrl, membersSiteUrl: null }
  },
}))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => mocks.auth }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => mocks.pathname }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.queried.push(path)
      mocks.args.set(path, args)
      if (path === "modules/networks/networks:getBySlug") return mocks.network
      if (path === "modules/networks/adminAccess:myNetworkAdmin") {
        if (mocks.adminFailure) throw mocks.adminFailure
        return mocks.admin
      }
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      expect(name(reference)).toBe("modules/networks/adminAccess:recordAccess")
      return mocks.record
    },
  }
})

import { AdminGate } from "./admin-gate"

function Section() {
  mocks.section()
  return <p>section-montee</p>
}

function tree(): ReactNode {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
  return (
    <I18nextProvider i18n={i18n}>
      <AdminGate>
        <Section />
      </AdminGate>
    </I18nextProvider>
  )
}

function mount(strict = false) {
  return render(strict ? <StrictMode>{tree()}</StrictMode> : tree())
}

function expectNothingMounted() {
  expect(mocks.section).not.toHaveBeenCalled()
  expect(screen.queryByRole("navigation")).toBeNull()
  expect(screen.queryByText("section-montee")).toBeNull()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.convexUrl = "configured"
  mocks.auth = { isAuthenticated: false, isUnauthenticated: false, isPending: false }
  mocks.network = undefined
  mocks.admin = undefined
  mocks.adminFailure = null
  mocks.queried = []
  mocks.args = new Map()
  mocks.pathname = "/"
  mocks.record.mockResolvedValue(null)
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function authenticated() {
  mocks.auth = { isAuthenticated: true, isUnauthenticated: false, isPending: false }
}

describe("garde d'admin.diaspora.ga — rien ne se monte avant les deux réponses du serveur", () => {
  it("sans moteur configuré : le manque est dit, aucune lecture", () => {
    mocks.convexUrl = null
    mount()
    expect(screen.getByRole("alert").textContent).toBe("Le moteur n’est pas configuré pour cette application.")
    expect(mocks.queried).toEqual([])
    expectNothingMounted()
  })

  it("session en cours de lecture : attente, aucune lecture du serveur", () => {
    mocks.auth = { isAuthenticated: false, isUnauthenticated: false, isPending: true }
    mount()
    expect(screen.getByRole("status").textContent).toContain("Vérification de la session")
    expect(mocks.queried).toEqual([])
    expectNothingMounted()
  })

  it("sans session : l'entrée, et aucune lecture", () => {
    mocks.auth = { isAuthenticated: false, isUnauthenticated: true, isPending: false }
    mount()
    expect(mocks.replace).toHaveBeenCalledWith("/entrer")
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toBe("/entrer")
    expect(mocks.queried).toEqual([])
    expectNothingMounted()
  })

  it("sans session sur une adresse inconnue du registre : l'entrée sans section à rouvrir", () => {
    mocks.auth = { isAuthenticated: false, isUnauthenticated: true, isPending: false }
    mocks.pathname = "/inconnue"
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/modules")
    mount()
    expect(mocks.replace).toHaveBeenCalledWith("/entrer")
    // Une section retenue plus tôt ne survit pas à une demande qui n'en porte pas.
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBeNull()
  })

  it.each(["/modules", "/modules/une-cle"])("sans session sur une section (%s) : l'entrée NUE, la section retenue dans l'onglet (revue A1, F2)", (pathname) => {
    mocks.auth = { isAuthenticated: false, isUnauthenticated: true, isPending: false }
    mocks.pathname = pathname
    mount()
    expect(mocks.replace.mock.calls).toEqual([["/entrer"]])
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toBe("/entrer")
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBe("/modules")
    expect(mocks.queried).toEqual([])
    expectNothingMounted()
  })

  it("réseau puis droits en cours de lecture : ni coque ni section, et l'administration n'est lue qu'une fois le réseau connu", () => {
    authenticated()
    const view = mount()
    expect(mocks.queried).toEqual(["modules/networks/networks:getBySlug"])
    expectNothingMounted()
    mocks.network = NETWORK
    view.rerender(tree())
    expect(mocks.queried).toContain("modules/networks/adminAccess:myNetworkAdmin")
    expect(screen.getByRole("status").textContent).toContain("Vérification de la session")
    expectNothingMounted()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("accès non journalisé : recordAccess une seule fois (StrictMode compris), rien ne se monte avant la relecture", async () => {
    authenticated()
    mocks.network = NETWORK
    mocks.admin = { ...ADMIN, accessLogged: false }
    let resolve: (value: null) => void = () => undefined
    mocks.record.mockImplementation(() => new Promise<null>((done) => (resolve = done)))
    const view = render(<StrictMode>{tree()}</StrictMode>)
    expect(screen.getByRole("status").textContent).toContain("Enregistrement de votre accès au journal")
    expect(mocks.record).toHaveBeenCalledTimes(1)
    expect(mocks.record).toHaveBeenCalledWith({ networkId: NETWORK._id })
    expectNothingMounted()
    await act(async () => resolve(null))
    // La lecture réactive n'a pas encore rendu le journal : toujours rien.
    expectNothingMounted()
    expect(mocks.record).toHaveBeenCalledTimes(1)
    mocks.admin = { ...ADMIN, accessLogged: true }
    view.rerender(<StrictMode>{tree()}</StrictMode>)
    expect(screen.getByText("section-montee")).toBeDefined()
    expect(screen.getByRole("navigation", { name: "Sections de l’administration" })).toBeDefined()
    expect(mocks.record).toHaveBeenCalledTimes(1)
  })

  it("accès déjà journalisé : la coque et la section, sans nouvelle écriture", () => {
    authenticated()
    mocks.network = NETWORK
    mocks.admin = { ...ADMIN, accessLogged: true }
    mount()
    expect(screen.getByText("section-montee")).toBeDefined()
    expect(screen.getAllByText("DIASPORA.GA").length).toBeGreaterThan(0)
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("un échec du journal ne monte rien et se réessaie ; un refus du journal est le refus indistinct", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    authenticated()
    mocks.network = NETWORK
    mocks.admin = { ...ADMIN, accessLogged: false }
    mocks.record.mockRejectedValueOnce(new Error("transport"))
    mount()
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("La vérification n’a pas abouti"))
    expectNothingMounted()
    mocks.record.mockRejectedValueOnce({ data: { code: "notFound" } })
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Accès réservé à l’administration du réseau"))
    expect(mocks.record).toHaveBeenCalledTimes(2)
    expectNothingMounted()
  })
})

describe("garde d'admin.diaspora.ga — un refus, un seul écran", () => {
  function refusalScreen(): string {
    const main = screen.getByRole("main")
    return main.textContent ?? ""
  }

  it.each([
    ["non membre ou réseau étranger", { data: { code: "notFound" } }],
    ["membre au statut insuffisant", { data: { code: "statusInsufficient" } }],
    ["session sans preuve d'identité numérique", { data: { code: "unauthenticated" } }],
    ["adhésion suspendue", { data: { code: "membershipSuspended" } }],
    ["accès suspendu sur ordre", { data: { code: "policyRefused" } }],
  ])("%s : le même écran, la sortie possible, rien de monté", (_case, failure) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    authenticated()
    mocks.network = NETWORK
    mocks.adminFailure = failure
    mount()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Accès réservé à l’administration du réseau")
    expect(refusalScreen()).toBe(
      "Administration du réseauAccès réservé à l’administration du réseauCette application est réservée aux administrateurs du réseau, connectés par leur identité numérique.Se déconnecter partout",
    )
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull()
    expectNothingMounted()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("réseau absent ou fermé : le même refus, sans lire l'administration", () => {
    authenticated()
    mocks.network = null
    mount()
    expect(refusalScreen()).toBe(
      "Administration du réseauAccès réservé à l’administration du réseauCette application est réservée aux administrateurs du réseau, connectés par leur identité numérique.Se déconnecter partout",
    )
    expect(mocks.queried).not.toContain("modules/networks/adminAccess:myNetworkAdmin")
    expectNothingMounted()
  })

  it("une panne sans code reste distincte du refus et se réessaie", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    authenticated()
    mocks.network = NETWORK
    mocks.adminFailure = new Error("transport")
    mount()
    expect(screen.getByRole("alert").textContent).toContain("La vérification n’a pas abouti")
    expect(screen.queryByText("Accès réservé à l’administration du réseau")).toBeNull()
    mocks.adminFailure = null
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(screen.getByRole("status").textContent).toContain("Vérification de la session")
    expectNothingMounted()
  })

  it("un rôle retiré en cours de session remplace la coque par le refus", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    authenticated()
    mocks.network = NETWORK
    mocks.admin = { ...ADMIN, accessLogged: true }
    const view = mount()
    expect(screen.getByText("section-montee")).toBeDefined()
    mocks.adminFailure = { data: { code: "notFound" } }
    view.rerender(tree())
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Accès réservé à l’administration du réseau")
    expect(screen.queryByText("section-montee")).toBeNull()
  })
})

describe("références du moteur lues par la garde (contrat CH-815)", () => {
  it("lit le réseau par sa projection publique, puis l'administration du réseau", () => {
    authenticated()
    mocks.network = NETWORK
    mocks.admin = { ...ADMIN, accessLogged: true }
    mount()
    expect([...new Set(mocks.queried)]).toEqual(["modules/networks/networks:getBySlug", "modules/networks/adminAccess:myNetworkAdmin"])
    expect(mocks.args.get("modules/networks/networks:getBySlug")).toEqual({ slug: "diaspora-ga" })
    expect(mocks.args.get("modules/networks/adminAccess:myNetworkAdmin")).toEqual({ networkId: NETWORK._id })
  })
})
