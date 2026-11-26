// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import { DataSourceProvider, gateSource, type DiasporaGaActions, type DiasporaGaDataSource, type MembershipView } from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ARRIVAL_KEY, rememberArrival } from "@/lib/arrival"
import { consulateGatewayLinks } from "@/lib/consulate-gateway"
import { explicitSignOutHappened } from "@/lib/explicit-sign-out"

const env = vi.hoisted(() => ({ consulateUrl: null as string | null }))
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>()
  return {
    ...actual,
    publicEnv: {
      ...actual.publicEnv,
      get consulateUrl() {
        return env.consulateUrl
      },
    },
  }
})

import { ArrivalCard } from "./arrival-card"

/**
 * CH-863, lot D1 — la carte d'arrivée : une personne passée par la porte `/entrer?depuis=consulat`
 * qui atteint le fil (connectée, ou après sa connexion) lit UNE fois « Vous arrivez de consulat.ga ·
 * vous êtes ici @identifiant · Revenir à consulat.ga », et peut dire « Ce n'est pas moi ».
 */
const t = getFixedT("fr")
const ORIGIN = "https://consulat.example"
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

/** `gated` : la source telle que l'application la monte, tous les modules du réseau fermés (l'état de départ). */
function mount(options: { gated?: boolean } = {}) {
  const demo = createDemoDataSource(new DemoStore(null, () => Date.now(), 0))
  const signOutEverywhere = vi.fn<DiasporaGaActions["signOutEverywhere"]>().mockResolvedValue(undefined)
  // Le moteur garde sa navigation de sortie : la porte ordinaire, sans recharger ici.
  const engine: DiasporaGaDataSource = { ...demo, kind: "engine", actions: { ...demo.actions, signOutEverywhere } }
  const source = options.gated ? gateSource(engine, []) : engine
  const view = render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <Toaster />
        <ArrivalCard membership={MEMBER} />
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { ...view, signOutEverywhere }
}

beforeEach(() => {
  env.consulateUrl = ORIGIN
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("carte d'arrivée — venue de consulat.ga", () => {
  it("dit d'où l'on arrive et sous quel identifiant, propose le retour à consulat.ga, puis oublie le repère", async () => {
    rememberArrival("consulat")
    mount()
    expect(await screen.findByText(t("consulateGateway.arrival.cardTitle"))).toBeInTheDocument()
    expect(screen.getByText(t("consulateGateway.arrival.cardBody", { handle: MEMBER.handle }))).toBeInTheDocument()
    const back = screen.getByRole("link", { name: t("consulateGateway.arrival.back") })
    expect(back).toHaveAttribute("href", consulateGatewayLinks(ORIGIN)!.mySpace)
    expect(back).toHaveAttribute("rel", "noopener noreferrer")
    expect(back).toHaveAttribute("referrerpolicy", "no-referrer")
    expect(back).not.toHaveAttribute("target")
    expect(window.sessionStorage.getItem(ARRIVAL_KEY)).toBeNull()
  })

  it("une seule fois : l'écran remonté sans nouveau passage par la porte ne la remontre pas", async () => {
    rememberArrival("consulat")
    const first = mount()
    expect(await screen.findByText(t("consulateGateway.arrival.cardTitle"))).toBeInTheDocument()
    first.unmount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    cleanup()
    mount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByText(t("consulateGateway.arrival.cardTitle"))).toBeNull()
  })

  it("sans adresse de consulat.ga configurée : la carte, sans lien de retour", async () => {
    env.consulateUrl = null
    rememberArrival("consulat")
    mount()
    expect(await screen.findByText(t("consulateGateway.arrival.cardTitle"))).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: t("consulateGateway.arrival.back") })).toBeNull()
    expect(screen.getByRole("button", { name: t("consulateGateway.arrival.notMe") })).toBeInTheDocument()
  })

  it("le module de l'entrée du menu fermé (CH-863 : l'état de départ du réseau) : la carte et son retour restent, ils ne dépendent que de l'adresse", async () => {
    rememberArrival("consulat")
    mount({ gated: true })
    expect(await screen.findByText(t("consulateGateway.arrival.cardTitle"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t("consulateGateway.arrival.back") })).toHaveAttribute("href", consulateGatewayLinks(ORIGIN)!.mySpace)
    expect(screen.getByRole("button", { name: t("consulateGateway.arrival.notMe") })).toBeInTheDocument()
  })

  it("sans passage par la porte d'arrivée : aucune carte", async () => {
    mount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByText(t("consulateGateway.arrival.cardTitle"))).toBeNull()
  })

  it("« Ce n'est pas moi » passe par la porte unique de « Se déconnecter partout », une fois", async () => {
    rememberArrival("consulat")
    const { signOutEverywhere } = mount()
    // Un clic simple : le glissement de la pile (sonner) réclame la capture du pointeur, absente de jsdom.
    fireEvent.click(await screen.findByRole("button", { name: t("consulateGateway.arrival.notMe") }))
    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1))
    // CH-863 D2 : une déconnexion explicite, retenue : la porte d'arrivée redemandera l'identité.
    expect(explicitSignOutHappened()).toBe(true)
  })
})
