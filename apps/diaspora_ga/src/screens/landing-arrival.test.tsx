// @vitest-environment jsdom
import { DataSourceProvider, type DiasporaGaActions, type DiasporaGaDataSource, type EntryDoorsView, type Loadable, type SessionView } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import EnterPage from "@/app/entrer/page"
import { ARRIVAL_KEY } from "@/lib/arrival"
import { rememberExplicitSignOut } from "@/lib/explicit-sign-out"
import { routes } from "@/lib/routes"

/**
 * CH-863, lot D1 — la porte d'arrivée `/entrer?depuis=consulat` : la valeur fermée, lue côté
 * serveur, fait dire à la porte « Vous arrivez de consulat.ga » ; l'action principale est l'entrée
 * EXISTANTE par l'identité numérique (aucun départ automatique vers identite.ga), les codes par e-mail ne sont pas proposés ; le repère d'arrivée est retenu dans l'onglet pour la carte du fil.
 */
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))

const t = getFixedT("fr")
const flat = (text: string) => text.replace(/\s+/g, " ").trim()
const IDN_OPEN: Loadable<EntryDoorsView> = { status: "ready", data: { idn: true, emailCode: true } }

function setup(options: { kind?: DiasporaGaDataSource["kind"]; session?: Loadable<SessionView> } = {}) {
  const demo = createDemoDataSource(new DemoStore(null, () => Date.UTC(2026, 10, 26, 12), 0))
  const signInWithIdn = vi.fn<DiasporaGaActions["signInWithIdn"]>().mockResolvedValue({ ok: true, value: null })
  const source: DiasporaGaDataSource = {
    ...demo,
    kind: options.kind ?? "demo",
    ...(options.kind === "engine" ? { useEntryDoors: () => IDN_OPEN } : {}),
    ...(options.session ? { useSession: () => options.session! } : {}),
    actions: { ...demo.actions, signInWithIdn },
  }
  const mount = (children: ReactNode) =>
    render(
      <I18nProvider locale="fr">
        <DataSourceProvider source={source}>{children}</DataSourceProvider>
      </I18nProvider>,
    )
  return { mount, signInWithIdn }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
})

describe("porte d'arrivée — `/entrer?depuis=consulat`", () => {
  it("présente uniquement IDN et retient l’arrivée consulaire dans l’onglet", async () => {
    const { mount } = setup()
    mount(await EnterPage({ searchParams: Promise.resolve({ depuis: "consulat" }) }))
    expect(screen.getByText(flat(t("consulateGateway.arrival.door")))).toBeInTheDocument()
    expect(screen.getByText(flat(t("consulateGateway.arrival.doorHint")))).toBeInTheDocument()
    // Démonstration : la simulation d'IDN, sous le libellé de l'arrivée.
    expect(screen.getByRole("link", { name: t("consulateGateway.arrival.continueIdn") })).toHaveAttribute("href", routes.enterIdn())
    expect(screen.queryByRole("link", { name: t("landing.idnContinue") })).toBeNull()
    expect(screen.queryByRole("textbox", { name: t("code.emailLabel") })).toBeNull()
    await waitFor(() => expect(window.sessionStorage.getItem(ARRIVAL_KEY)).not.toBeNull())
    expect(JSON.parse(window.sessionStorage.getItem(ARRIVAL_KEY)!)).toMatchObject({ origin: "consulat" })
  })

  it("avec le moteur : l'action principale est l'entrée par l'identité numérique existante, jamais lancée d'elle-même", async () => {
    const user = userEvent.setup()
    const { mount, signInWithIdn } = setup({ kind: "engine" })
    mount(await EnterPage({ searchParams: Promise.resolve({ depuis: "consulat" }) }))
    const idn = screen.getByRole("button", { name: t("consulateGateway.arrival.continueIdn") })
    expect(idn).toBeEnabled()
    // Aucun départ automatique vers identite.ga : rien tant que la personne n'a pas choisi.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signInWithIdn).not.toHaveBeenCalled()
    await user.click(idn)
    // CH-863 D2 : au geste explicite, et sur cette porte seulement, l'entrée sans ressaisie est demandée.
    expect(signInWithIdn).toHaveBeenCalledExactlyOnceWith(undefined, { reuseIdnSession: true })
    expect(screen.queryByRole("textbox", { name: t("code.emailLabel") })).toBeNull()
  })

  it("après une déconnexion explicite dans ce navigateur : le départ ordinaire, ressaisie exigée", async () => {
    const user = userEvent.setup()
    rememberExplicitSignOut()
    const { mount, signInWithIdn } = setup({ kind: "engine" })
    mount(await EnterPage({ searchParams: Promise.resolve({ depuis: "consulat" }) }))
    await user.click(screen.getByRole("button", { name: t("consulateGateway.arrival.continueIdn") }))
    expect(signInWithIdn).toHaveBeenCalledExactlyOnceWith()
  })

  it("la porte ordinaire ne demande jamais l'entrée sans ressaisie", async () => {
    const user = userEvent.setup()
    const { mount, signInWithIdn } = setup({ kind: "engine" })
    mount(await EnterPage({ searchParams: Promise.resolve({}) }))
    await user.click(screen.getByRole("button", { name: t("landing.idnContinue") }))
    expect(signInWithIdn).toHaveBeenCalledExactlyOnceWith()
  })

  it("toute autre valeur rend la porte ordinaire : aucune phrase d'arrivée, rien de retenu", async () => {
    for (const depuis of ["Consulat", "consulat.ga", "identite", ["consulat"], undefined]) {
      const { mount } = setup()
      mount(await EnterPage({ searchParams: Promise.resolve({ depuis }) }))
      expect(screen.queryByText(flat(t("consulateGateway.arrival.door")))).toBeNull()
      expect(screen.getByRole("link", { name: t("landing.idnContinue") })).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(window.sessionStorage.getItem(ARRIVAL_KEY), JSON.stringify(depuis)).toBeNull()
      cleanup()
    }
  })

  it("déjà connecté : l'arrivée est retenue AVANT le départ vers le fil, qui montrera la carte", async () => {
    const membership = null
    const session: Loadable<SessionView> = {
      status: "ready",
      data: { status: "signed_in", account: { id: "accounts_awa", idn: { loa: 2 }, local: null, nameHints: {} }, membership },
    }
    let storedAtDeparture: string | null = "absent"
    navigation.replace.mockImplementation(() => {
      storedAtDeparture = window.sessionStorage.getItem(ARRIVAL_KEY)
    })
    const { mount } = setup({ session })
    mount(await EnterPage({ searchParams: Promise.resolve({ depuis: "consulat" }) }))
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled())
    expect(storedAtDeparture).not.toBeNull()
    expect(storedAtDeparture).not.toBe("absent")
  })
})
