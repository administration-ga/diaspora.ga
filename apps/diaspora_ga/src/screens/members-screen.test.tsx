// @vitest-environment jsdom
import { DataSourceProvider, type DiasporaGaDataSource } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource, createDemoSeed, type DemoState } from "@diaspora-ga/features/demo"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MembersScreen, cityTitle, memberBrowseFromParams, membersHrefOf } from "./members-screen"

/**
 * `/membres` (CH-816, lot P3) : on parcourt l'annuaire par défaut — pays ouvert, ville,
 * « vérifiés seulement », filtres dans l'adresse —, un nom bascule sur la recherche, et les
 * états vides ou refusés ne promettent rien. Fournisseur de DÉMONSTRATION (membres fictifs).
 */
const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/membres",
  useSearchParams: () => mocks.params,
}))

// La coque et iCom ont leurs propres tests ; la démonstration n'ouvre pas iCom.
vi.mock("@/components/app-shell", () => ({ AppShell: (props: { children: ReactNode }) => <>{props.children}</> }))
vi.mock("@/components/icom", () => ({ useEngineNetwork: () => null }))
// Les suggestions ont leurs propres scénarios : ici, leur seule place dans l'écran.
vi.mock("@diaspora-ga/features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@diaspora-ga/features")>()),
  MemberSuggestions: (props: { headingId: string }) => <section aria-label="Des membres à rencontrer" id={props.headingId} />,
}))

const NOW = Date.UTC(2026, 10, 23, 12)

function demoSource(personId: string, patch: (state: DemoState) => DemoState = (state) => state, overrides: Partial<DiasporaGaDataSource> = {}): DiasporaGaDataSource {
  const state = patch({ ...createDemoSeed(NOW), session: { personId } })
  const storage = { getItem: () => JSON.stringify(state), setItem: () => undefined, removeItem: () => undefined }
  return { ...createDemoDataSource(new DemoStore(storage, () => NOW, 0)), ...overrides }
}

function renderMembers(source: DiasporaGaDataSource, locale: "fr" | "en" = "fr") {
  return render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={source}>
        <MembersScreen />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

async function browseList() {
  return await screen.findByRole("list", { name: "Membres de l’annuaire" })
}

const names = (list: HTMLElement) => within(list).getAllByRole("link").map((link) => link.getAttribute("href"))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.params = new URLSearchParams()
})
afterEach(cleanup)

describe("/membres — parcourir l'annuaire", () => {
  it("par défaut : mon pays ouvert, les membres qui ont choisi d'être trouvés, chacun vers son profil", async () => {
    renderMembers(demoSource("p-steeve"))
    expect(screen.getByRole("heading", { level: 2, name: "Parcourir l’annuaire des membres" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Pays" })).toHaveValue("FR")
    expect(screen.getByRole("heading", { name: "Membres\u00a0: France" })).toBeInTheDocument()
    expect(names(await browseList())).toEqual(["/@steeve.ngounie", "/@prisca.abanga", "/@mireille.ivindo"])
    // Aucune coordonnée : la carte mène au profil, le contact passe par la messagerie.
    expect(screen.queryByText(/@example\.com/)).toBeNull()
  })

  it("« Vérifiés seulement » s'applique aussitôt et s'écrit dans l'adresse", async () => {
    renderMembers(demoSource("p-steeve"))
    await browseList()
    fireEvent.click(screen.getByRole("switch", { name: "Vérifiés seulement" }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/membres?pays=FR&verifies=1"))
    await waitFor(async () => expect(names(await browseList())).toEqual(["/@prisca.abanga", "/@mireille.ivindo"]))
  })

  it("la ville vient de l'adresse ; une ville que personne ne me montre : un vide qui ne promet rien", async () => {
    mocks.params = new URLSearchParams({ pays: "FR", ville: "Bordeaux" })
    const { unmount } = renderMembers(demoSource("p-steeve"))
    expect(screen.getByRole("heading", { name: "Membres\u00a0: Bordeaux, France" })).toBeInTheDocument()
    expect(names(await browseList())).toEqual(["/@prisca.abanga"])
    unmount()

    mocks.params = new URLSearchParams({ pays: "FR", ville: "Paris" })
    renderMembers(demoSource("p-steeve"))
    expect(await screen.findByText("Aucun membre visible dans cette ville pour l’instant.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull()
  })

  it("un nom bascule sur la recherche ; l'effacer revient au parcours", async () => {
    renderMembers(demoSource("p-steeve"))
    await browseList()
    const search = screen.getByRole("searchbox", { name: "Chercher un membre" })
    fireEvent.change(search, { target: { value: "prisca" } })
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "Parcourir l’annuaire des membres" })).toBeNull())
    expect(await screen.findByRole("link", { name: /Prisca ABANGA/ })).toHaveAttribute("href", "/@prisca.abanga")
    fireEvent.change(search, { target: { value: "" } })
    expect(await screen.findByRole("heading", { level: 2, name: "Parcourir l’annuaire des membres" })).toBeInTheDocument()
  })

  it("un compte en attente peut chercher un membre visible dès son arrivée", async () => {
    renderMembers(
      demoSource("p-rodrigue", (state) => ({
        ...state,
        memberships: { ...state.memberships, "p-rodrigue": { ...state.memberships["p-rodrigue"]!, grounds: { ...state.memberships["p-rodrigue"]!.grounds, sponsored: false } } },
      })),
    )
    const field = screen.getByRole("searchbox", { name: "Chercher un membre" })
    fireEvent.change(field, { target: { value: "prisca" } })
    expect(await screen.findByRole("link", { name: /Prisca ABANGA/ })).toHaveAttribute("href", "/@prisca.abanga")
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull()
  })

  it("sans la capacité du parcours, la recherche par nom reste seule", () => {
    renderMembers(demoSource("p-steeve", (state) => state, { memberBrowse: undefined }))
    expect(screen.queryByRole("heading", { level: 2, name: "Parcourir l’annuaire des membres" })).toBeNull()
    expect(screen.getByText("Cherchez un membre par son nom ou son identifiant.")).toBeInTheDocument()
  })

  it("en anglais", async () => {
    renderMembers(demoSource("p-steeve"), "en")
    expect(screen.getByRole("heading", { level: 2, name: "Browse the members’ directory" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Verified only" })).toBeInTheDocument()
    expect(await screen.findByRole("list", { name: "Directory members" })).toBeInTheDocument()
  })
})

describe("/membres — le parcours dans l'adresse", () => {
  it("un pays fermé ou inconnu revient au mien s'il est ouvert, sinon au premier pays ouvert", () => {
    expect(memberBrowseFromParams(new URLSearchParams({ pays: "BE" }), "FR", ["FR"])).toEqual({ country: "FR", city: "", verifiedOnly: false })
    expect(memberBrowseFromParams(new URLSearchParams({ pays: "fr", ville: "  Saint   Denis ", verifies: "1" }), "BE", ["FR"])).toEqual({ country: "FR", city: "Saint Denis", verifiedOnly: true })
    expect(memberBrowseFromParams(new URLSearchParams(), "BE", ["FR"])).toEqual({ country: "FR", city: "", verifiedOnly: false })
    expect(memberBrowseFromParams(new URLSearchParams({ ville: "x".repeat(120) }), "FR", ["FR"]).city).toHaveLength(80)
  })

  it("l'adresse d'un parcours vient de la table des routes", () => {
    expect(membersHrefOf({ country: "FR", city: "", verifiedOnly: false })).toBe("/membres?pays=FR")
    expect(membersHrefOf({ country: "FR", city: "Lyon", verifiedOnly: true })).toBe("/membres?pays=FR&ville=Lyon&verifies=1")
  })
})

describe("/membres — la ville dans le titre", () => {
  it("prend une capitale à sa première lettre, sans toucher au reste", () => {
    expect(cityTitle("bordeaux")).toBe("Bordeaux")
    expect(cityTitle("  saint-étienne ")).toBe("Saint-étienne")
    expect(cityTitle("Le Havre")).toBe("Le Havre")
    expect(cityTitle("")).toBe("")
  })
})
