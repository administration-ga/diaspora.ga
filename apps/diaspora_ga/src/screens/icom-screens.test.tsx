// @vitest-environment jsdom
import { useNetwork, useRoutes } from "@antsia/api/network"
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type { MembershipView } from "@diaspora-ga/features/data"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { IcomNetwork, IcomState } from "@/components/icom"
import type { MessagesRouteTarget } from "@/lib/messages-route"
import { routes } from "@/lib/routes"

import { ConferenceScreen, MessagesScreen, StoriesScreen } from "./icom-screens"

const mocks = vi.hoisted(() => ({
  // CC-6 : l'injection contextuelle rendue par `useContextualMessages` (sonde, aucune connexion).
  contextual: { renderList: () => null, renderConversation: () => null },
  membership: null as MembershipView | null,
  network: null as IcomNetwork | null,
  icom: { status: "off", reason: "demo" } as IcomState,
  gate: vi.fn(),
  viewer: vi.fn(),
  messages: vi.fn(),
  direct: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
  usePathname: () => "/actus",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

vi.mock("@/components/gate", () => ({
  Gate: (props: { require: "member"; children: (session: { membership: MembershipView | null }) => ReactNode }) => {
    mocks.gate(props.require)
    return <>{props.children({ membership: mocks.membership })}</>
  },
  GateSkeleton: () => <div role="status" aria-label="Chargement du réseau" />,
}))
vi.mock("@/components/app-shell", () => ({
  AppShell: (props: { children: ReactNode }) => <>{props.children}</>,
}))

// L'îlot réseau reste réel ; les surfaces lourdes servent seulement de sondes
// montées, sans connexion Convex ni ouverture de la couche de communication.
vi.mock("@antsia/social-features/shell", () => ({ CommunicationShell: () => null }))
vi.mock("@antsia/social-features/messagerie", () => ({
  conversationHref: vi.fn(),
  dockStore: {},
  draftKey: vi.fn(),
  MessagesRoute: (props: MessagesRouteTarget) => {
    mocks.messages(props)
    return <div role="group" aria-label="Messagerie du moteur" />
  },
  useContextualMessages: () => mocks.contextual,
}))
vi.mock("@/components/icom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/icom")>()),
  useEngineNetwork: () => mocks.network,
  useIcomState: () => mocks.icom,
}))
// CH-817 : la page d'un direct du moteur, sonde montée sans salle ni serveur vidéo.
vi.mock("@antsia/social-features/direct", () => ({
  DirectPage: (props: { sessionId: string }) => {
    const network = useNetwork()
    const engineRoutes = useRoutes()
    mocks.direct({ ...props, network, conferenceHref: engineRoutes.conference(props.sessionId) })
    return <section aria-label="Page du direct du moteur" />
  },
}))
vi.mock("@antsia/social-features/stories", () => ({
  StoriesViewerPage: (props: { canCreate?: boolean; openCreate?: boolean }) => {
    const network = useNetwork()
    const engineRoutes = useRoutes()
    const [marker, setMarker] = useState("")
    mocks.viewer({ ...props, network, storiesHref: engineRoutes.stories() })
    return (
      <section aria-label="Lecteur des statuts du moteur">
        <input aria-label="Repère du lecteur" value={marker} onChange={(event) => setMarker(event.target.value)} />
      </section>
    )
  },
}))

const membership: MembershipView = {
  personId: "persons_awa",
  handle: "awa.demo",
  displayName: "Awa",
  status: "declaree",
  badges: ["community"],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: null,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "declaree", derivedFrom: "diaspora-ga" },
  canPublish: true,
  rateTier: "reinforced",
  directoryVisibility: "hidden",
}

const network = { networkId: "networks_diaspora-ga", slug: "diaspora-ga", personId: membership.personId } as IcomNetwork

function storiesTree(openCreate = false) {
  return <I18nProvider locale="fr"><StoriesScreen openCreate={openCreate} /></I18nProvider>
}

function messagesTree() {
  return <I18nProvider locale="fr"><MessagesScreen route={{ compose: "personne" }} /></I18nProvider>
}

beforeEach(() => {
  mocks.membership = membership
  mocks.network = network
  mocks.icom = { status: "on", network }
  vi.clearAllMocks()
})

afterEach(cleanup)

describe("Les statuts en pages — lecture et création distinctes", () => {
  it.each([false, true])("le membre en attente lit sans création, même par l'adresse nouvelle (%s)", (openCreate) => {
    mocks.membership = { ...membership, status: "en_attente", canPublish: false }
    mocks.icom = { status: "off", reason: "not_allowed" }
    render(storiesTree(openCreate))

    expect(mocks.gate).toHaveBeenLastCalledWith("member")
    expect(screen.getByRole("main")).toHaveAttribute("id", "contenu")
    expect(screen.getByRole("region", { name: "Lecteur des statuts du moteur" })).toBeInTheDocument()
    expect(mocks.viewer).toHaveBeenLastCalledWith({
      canCreate: false,
      openCreate: false,
      storiesHref: routes.stories(),
      network: expect.objectContaining({
        networkId: network.networkId,
        slug: "diaspora-ga",
        personId: membership.personId,
        charte: "diaspora-ga",
        storagePrefix: "antsia:diaspora-ga:",
      }),
    })
  })

  it.each([false, true])("le membre déclaré peut créer et l'adresse pilote l'ouverture (%s)", (openCreate) => {
    render(storiesTree(openCreate))

    expect(mocks.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ canCreate: true, openCreate }))
  })

  it.each(["demo", "suspendue"] as const)("garde le lecteur et le composeur fermés : %s", (state) => {
    mocks.network = null
    mocks.icom = { status: "off", reason: state === "demo" ? "demo" : "not_allowed" }
    if (state === "suspendue") mocks.membership = { ...membership, status: state, canPublish: false }
    render(storiesTree(true))

    expect(screen.getByRole("heading", { level: 1, name: "Statuts" })).toBeInTheDocument()
    expect(screen.getByText("Messagerie indisponible")).toBeInTheDocument()
    expect(mocks.viewer).not.toHaveBeenCalled()
  })

  it("attend la résolution du réseau sans monter le lecteur ni annoncer une indisponibilité", () => {
    mocks.network = null
    mocks.icom = { status: "loading" }
    render(storiesTree(true))

    expect(screen.getByRole("status", { name: "Chargement du réseau" })).toBeInTheDocument()
    expect(screen.queryByText("Messagerie indisponible")).not.toBeInTheDocument()
    expect(mocks.viewer).not.toHaveBeenCalled()
  })

  it.each(["personne", "droit", "réseau"] as const)("réinitialise le lecteur au changement de %s", (change) => {
    const { rerender } = render(storiesTree(true))
    fireEvent.change(screen.getByRole("textbox", { name: "Repère du lecteur" }), { target: { value: "ancienne série" } })

    if (change === "personne") {
      mocks.network = { ...network, personId: "persons_bob" as IcomNetwork["personId"] }
      mocks.membership = { ...membership, personId: "persons_bob" }
    } else if (change === "réseau") mocks.network = { ...network, networkId: "networks_other" as IcomNetwork["networkId"] }
    else {
      mocks.membership = { ...membership, status: "en_attente", canPublish: false }
      mocks.icom = { status: "off", reason: "not_allowed" }
    }
    rerender(storiesTree(true))

    expect(screen.getByRole("textbox", { name: "Repère du lecteur" })).toHaveValue("")
    if (change === "droit") expect(mocks.viewer).toHaveBeenLastCalledWith(expect.objectContaining({ canCreate: false, openCreate: false }))
  })

  it("attend que la personne du réseau corresponde à la nouvelle session avant de monter le lecteur", () => {
    const { rerender } = render(storiesTree())
    mocks.membership = { ...membership, personId: "persons_bob" }
    rerender(storiesTree())

    expect(screen.queryByRole("region", { name: "Lecteur des statuts du moteur" })).not.toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Chargement du réseau" })).toBeInTheDocument()

    mocks.network = { ...network, personId: "persons_bob" as IcomNetwork["personId"] }
    rerender(storiesTree())
    expect(screen.getByRole("region", { name: "Lecteur des statuts du moteur" })).toBeInTheDocument()
  })

  it("retire immédiatement le lecteur si l'adhésion est suspendue", () => {
    const { rerender } = render(storiesTree())

    mocks.membership = { ...membership, status: "suspendue", canPublish: false }
    mocks.network = null
    mocks.icom = { status: "off", reason: "not_allowed" }
    rerender(storiesTree())

    expect(screen.queryByRole("region", { name: "Lecteur des statuts du moteur" })).not.toBeInTheDocument()
    expect(screen.getByText("Messagerie indisponible")).toBeInTheDocument()
  })

  it("conserve la messagerie fermée au membre en attente malgré le réseau de lecture", () => {
    mocks.membership = { ...membership, status: "en_attente", canPublish: false }
    mocks.icom = { status: "off", reason: "not_allowed" }
    render(messagesTree())

    expect(mocks.gate).toHaveBeenLastCalledWith("member")
    expect(screen.getByText("Messagerie indisponible")).toBeInTheDocument()
    expect(mocks.messages).not.toHaveBeenCalled()
  })

  it("conserve le montage de la messagerie autorisée et sa cible", () => {
    render(messagesTree())

    expect(screen.getByRole("group", { name: "Messagerie du moteur" })).toBeInTheDocument()
    // CC-6 : la messagerie reçoit aussi nos conversations de mise en relation.
    expect(mocks.messages).toHaveBeenLastCalledWith({ compose: "personne", contextual: mocks.contextual })
  })
})

describe("La page d'un direct (CH-817) — l'écran du moteur, aux conditions d'iCom, sans coque", () => {
  function conferenceTree(sessionId = "sessions_1") {
    return <I18nProvider locale="fr"><ConferenceScreen sessionId={sessionId} /></I18nProvider>
  }

  it("un membre qui écrit : la page du direct du moteur, sur la session et le réseau de DIASPORA.GA", () => {
    render(conferenceTree())

    expect(mocks.gate).toHaveBeenLastCalledWith("member")
    expect(screen.getByRole("main")).toHaveAttribute("id", "contenu")
    expect(screen.getByRole("region", { name: "Page du direct du moteur" })).toBeInTheDocument()
    expect(mocks.direct).toHaveBeenLastCalledWith({
      sessionId: "sessions_1",
      conferenceHref: routes.conference("sessions_1"),
      network: expect.objectContaining({ networkId: network.networkId, slug: "diaspora-ga", personId: membership.personId, charte: "diaspora-ga" }),
    })
  })

  it.each([
    ["membre en attente", { status: "off", reason: "not_allowed" }],
    ["démonstration", { status: "off", reason: "demo" }],
  ] as const)("iCom fermé (%s) : la page dit pourquoi, sans monter le direct", (_name, icom) => {
    mocks.icom = icom
    if (icom.reason === "not_allowed") mocks.membership = { ...membership, status: "en_attente", canPublish: false }
    render(conferenceTree())

    expect(screen.getByRole("heading", { level: 1, name: "Conférence en direct" })).toBeInTheDocument()
    expect(screen.getByText("Messagerie indisponible")).toBeInTheDocument()
    expect(mocks.direct).not.toHaveBeenCalled()
  })

  it("attend la résolution d'iCom sans monter le direct ni annoncer une indisponibilité", () => {
    mocks.icom = { status: "loading" }
    render(conferenceTree())

    expect(screen.getByRole("status", { name: "Chargement du réseau" })).toBeInTheDocument()
    expect(screen.queryByText("Messagerie indisponible")).not.toBeInTheDocument()
    expect(mocks.direct).not.toHaveBeenCalled()
  })
})
