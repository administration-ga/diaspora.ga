// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { SECTIONS } from "@/lib/sections"

/** CH-815 A4 — la coque : menu groupé des seules sections présentes, entrée courante marquée, en-tête complet. */
const ADMIN = {
  personId: "person-one",
  displayName: "Awa NDONG",
  networkId: "network-diaspora",
  networkSlug: "diaspora-ga",
  networkName: "DIASPORA.GA",
  accessLogged: true,
} as never

const mocks = vi.hoisted(() => ({ pathname: "/", membersSiteUrl: null as string | null, exit: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: mocks.exit }))
vi.mock("@/lib/env", () => ({
  get publicEnv() {
    return { convexUrl: "configured", membersSiteUrl: mocks.membersSiteUrl }
  },
}))

import { AdminShell } from "./admin-shell"
import { NetworkAdminProvider } from "./network-admin-context"

function mount(admin = ADMIN) {
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={admin}>
        <AdminShell admin={admin}>
          {/* La section montée sous la coque (le tableau de bord a ses propres tests, lot A7). */}
          <h1>Section</h1>
        </AdminShell>
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = "/"
  mocks.membersSiteUrl = null
  mocks.exit.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe("coque d'admin.diaspora.ga", () => {
  it("le menu ne liste que les sections du registre, groupées, l'entrée courante marquée", () => {
    mount()
    const nav = screen.getByRole("navigation", { name: "Sections de l’administration" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(["Tableau de bord", "Mesure", "Journal", "Modules", "Aperçu du menu", "Institutions et pages officielles", "Fondateurs", "Pays ouverts", "Recours", "Équipe et responsables", "Règles"])
    expect(links.map((link) => link.getAttribute("href"))).toEqual(SECTIONS.map((section) => section.href))
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual(["page", ...SECTIONS.slice(1).map(() => null)])
    expect(within(within(nav).getByRole("list", { name: "Pilotage" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tableau de bord", "Mesure", "Journal"])
    expect(within(within(nav).getByRole("list", { name: "Application des membres" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Modules", "Aperçu du menu"])
    // CH-815 A6 : les décisions du réseau, déménagées du bureau de diaspora.ga.
    expect(within(within(nav).getByRole("list", { name: "Confiance" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Recours", "Équipe et responsables", "Règles"])
    // CH-815 A7 : la communauté du réseau.
    expect(within(within(nav).getByRole("list", { name: "Communauté" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Institutions et pages officielles", "Fondateurs", "Pays ouverts"])
  })

  it("sur une section, son entrée seule est marquée", () => {
    mocks.pathname = "/apercu"
    mount()
    const nav = screen.getByRole("navigation", { name: "Sections de l’administration" })
    expect(within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual(["Aperçu du menu"])
  })

  it("hors de la section, l'entrée n'est pas marquée", () => {
    mocks.pathname = "/journal"
    mount()
    const nav = screen.getByRole("navigation", { name: "Sections de l’administration" })
    expect(within(nav).getByRole("link", { name: "Tableau de bord" }).getAttribute("aria-current")).toBeNull()
  })

  it("en-tête : réseau, administrateur, sortie partout ; le lien des membres seulement s'il est configuré", () => {
    mount()
    const header = screen.getByRole("banner")
    expect(within(header).getByText("DIASPORA.GA")).toBeDefined()
    expect(within(header).getByText("Connecté en tant que Awa NDONG")).toBeDefined()
    expect(within(header).getByRole("button", { name: "Se déconnecter partout" })).toBeDefined()
    expect(within(header).queryByRole("link", { name: /Ouvrir diaspora\.ga/ })).toBeNull()
  })

  it("« Ouvrir diaspora.ga » mène à l'origine de l'environnement, dans un nouvel onglet", () => {
    mocks.membersSiteUrl = "https://membres.exemple"
    mount()
    const link = within(screen.getByRole("banner")).getByRole("link", { name: "Ouvrir diaspora.ga (nouvel onglet)" })
    expect(link.getAttribute("href")).toBe("https://membres.exemple")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("« Se déconnecter partout » passe par la porte unique", async () => {
    mount()
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Se déconnecter partout" }))
    expect(mocks.exit).toHaveBeenCalledOnce()
  })

  it("sous 834 px, la feuille reprend le même menu et les actions de l'en-tête", async () => {
    mocks.membersSiteUrl = "https://membres.exemple"
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }))
    const sheet = await screen.findByRole("dialog", { name: "Menu de l’administration" })
    const nav = within(sheet).getByRole("navigation", { name: "Sections de l’administration" })
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tableau de bord", "Mesure", "Journal", "Modules", "Aperçu du menu", "Institutions et pages officielles", "Fondateurs", "Pays ouverts", "Recours", "Équipe et responsables", "Règles"])
    expect(within(sheet).getByRole("link", { name: "Ouvrir diaspora.ga (nouvel onglet)" })).toBeDefined()
    expect(within(sheet).getByRole("button", { name: "Se déconnecter partout" })).toBeDefined()
    await userEvent.click(within(nav).getByRole("link", { name: "Tableau de bord" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("sans nom affiché : l'en-tête ne dit aucun nom, rien d'inventé", () => {
    mount({ ...(ADMIN as object), displayName: null } as never)
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 }).textContent).toBe("Section")
    expect(screen.queryByText(/Connecté en tant que/)).toBeNull()
  })
})
