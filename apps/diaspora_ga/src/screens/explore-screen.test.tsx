// @vitest-environment jsdom
import { DataSourceProvider, type DiasporaGaDataSource } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource, createDemoSeed } from "@diaspora-ga/features/demo"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExploreScreen } from "./explore-screen"

const mocks = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/explorer",
  useSearchParams: () => new URLSearchParams(),
}))

// La coque a ses propres tests ; l'annuaire des pages appartient au chantier « pages ».
vi.mock("@diaspora-ga/features", async (original) => ({ ...(await original<typeof import("@diaspora-ga/features")>()), MemberSuggestions: () => null }))
vi.mock("@/components/app-shell", () => ({ AppShell: (props: { children: ReactNode }) => <>{props.children}</> }))
vi.mock("@/components/icom", () => ({ useEngineNetwork: () => null }))
const NOW = Date.UTC(2026, 9, 18, 12)

/** Le fournisseur de DÉMONSTRATION, session ouverte au nom d'une personne du jeu d'essai. */
function demoSource(personId: string | null, overrides: Partial<DiasporaGaDataSource> = {}): DiasporaGaDataSource {
  const state = { ...createDemoSeed(NOW), session: { personId } }
  const storage = { getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }
  return { ...createDemoDataSource(new DemoStore(storage, () => NOW, 0)), ...overrides }
}

function renderExplore(source: DiasporaGaDataSource, locale: "fr" | "en" = "fr") {
  return render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={source}>
        <ExploreScreen />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("Membres", () => {
  it("présente immédiatement la recherche et les deux gestes de partage", async () => {
    renderExplore(demoSource("p-mireille"))
    expect(screen.getByRole("heading", { name: "Membres", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Chercher un membre" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Partager mon profil" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Inviter un contact" }))
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Inviter par SMS" })).toBeInTheDocument()
  })

  it("conserve la recherche de publications et les espaces communautaires en second niveau", async () => {
    const searched = vi.fn()
    renderExplore(demoSource("p-mireille", {
      postSearch: { usePostSearch: (args) => { searched(args); return { status: "ready", data: { items: [], hasMore: false, capped: false } } } },
    }))
    expect(screen.queryByRole("region", { name: "Pays ouverts" })).toBeNull()
    expect(screen.getByRole("link", { name: "Toutes les pages" })).toHaveAttribute("href", "/pages")
    const user = userEvent.setup()
    await user.click(screen.getByText("Autres espaces du réseau"))
    expect(screen.getByRole("link", { name: "Entraide" })).toHaveAttribute("href", "/entraide?pays=FR")
    await user.click(screen.getByRole("button", { name: "Publications" }))
    await user.type(screen.getByRole("searchbox", { name: "Mots à chercher dans les publications" }), "valise")
    expect(await screen.findByText(/Aucune publication pour/)).toBeInTheDocument()
    expect(searched).toHaveBeenLastCalledWith({ query: "valise", limit: 20 })
  })

  it("localise les invitations et le profil", () => {
    renderExplore(demoSource("p-mireille"), "en")
    expect(screen.getByRole("button", { name: "Invite a contact" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Share my profile" })).toBeInTheDocument()
  })

  it("conserve la garde de l'annuaire de membres", () => {
    renderExplore(demoSource(null))
    expect(screen.queryByRole("heading", { name: "Membres" })).toBeNull()
    expect(mocks.replace).toHaveBeenCalledWith("/entrer")
  })
})
