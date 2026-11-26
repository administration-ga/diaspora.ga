// @vitest-environment jsdom
import { useNetwork } from "@antsia/api/network"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { IcomNetwork } from "@/lib/icom-state"

import { IcomIsland } from "./icom"

/**
 * CH-817 : l'interrupteur du direct de DIASPORA.GA passe par l'îlot au moteur (`liveAvailable`),
 * comme celui des appels (`callsAvailable`). C'est cette déclaration que lisent la couche de
 * communication (hôte du direct), le lecteur des actus (directs en cours) et le lancement d'une
 * conférence depuis un appel. Personne fictive.
 */
// `null` : l'interrupteur réel, la position du dépôt (ouvert depuis le 26/11/2026) ; un test le force.
const mocks = vi.hoisted(() => ({ liveOpen: null as boolean | null }))
vi.mock("@/lib/live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live")>()
  return { ...actual, liveIsOpen: () => mocks.liveOpen ?? actual.liveIsOpen() }
})
vi.mock("@antsia/social-features/shell", () => ({ CommunicationShell: () => null }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/fil",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

const NETWORK = { networkId: "networks_diaspora-ga", slug: "diaspora-ga", personId: "persons_awa" } as IcomNetwork

function Declared() {
  return <output data-testid="live-available">{String(useNetwork().liveAvailable)}</output>
}

function mount() {
  return render(
    <I18nProvider locale="fr">
      <IcomIsland network={NETWORK}>
        <Declared />
      </IcomIsland>
    </I18nProvider>,
  )
}

beforeEach(() => {
  mocks.liveOpen = null
})
afterEach(cleanup)

describe("iCom — l'interrupteur du direct déclaré au moteur (liveAvailable)", () => {
  it("la position du dépôt (ouvert le 26/11/2026) : le moteur le lit ouvert", () => {
    mount()
    expect(screen.getByTestId("live-available")).toHaveTextContent("true")
  })

  it("ouvert : le moteur le lit ouvert", () => {
    mocks.liveOpen = true
    mount()
    expect(screen.getByTestId("live-available")).toHaveTextContent("true")
  })

  it("refermé : le moteur le lit fermé, aucun direct n'est monté", () => {
    mocks.liveOpen = false
    mount()
    expect(screen.getByTestId("live-available")).toHaveTextContent("false")
  })
})
