// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import type { CountryRow } from "@/lib/countries"

/**
 * CH-815 A7 — la section « Pays ouverts » : la lecture des pays du réseau (ouverture, équipes du
 * pays, modérateurs actifs, compteurs présentés, `canOpen`), l'ouverture motivée avec
 * l'attestation obligatoire des associations relais (`relayAssociationsAttested: true`), la
 * fermeture motivée, l'anomalie d'un pays ouvert sans modérateur, les refus `moderator_missing` et
 * `relay_associations_missing` expliqués. Arguments exacts au moteur. Données fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const COUNTRIES = "modules/diaspora/networkSettings:countries"
const SET_OPEN = "modules/diaspora/networkSettings:setOpenCountry"

const mocks = vi.hoisted(() => ({
  rows: undefined as unknown,
  failure: null as unknown,
  args: [] as unknown[],
  setOpen: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      if (path !== COUNTRIES) throw new Error(`lecture inattendue : ${path}`)
      mocks.args.push(args)
      if (mocks.failure) throw mocks.failure
      return mocks.rows
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      if (name(reference) !== SET_OPEN) throw new Error(`écriture inattendue : ${name(reference)}`)
      return mocks.setOpen
    },
  }
})

import { CountriesSection } from "./countries-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const value = (count: number) => ({ kind: "value", value: count })

/** Un pays fictif : identifiants en clair (le moteur les rend opaques). */
function country(overrides: Partial<Record<keyof CountryRow, unknown>> = {}): CountryRow {
  return {
    country: "BE",
    open: false,
    counters: { dormant: false, members: value(42), associations: value(3), companies: value(5), upcomingEvents: value(1) },
    countersComputedAt: Date.UTC(2026, 10, 22, 3),
    teams: [{ teamId: "team-be", name: "Belgique", scope: null }],
    activeModerators: 2,
    canOpen: true,
    ...overrides,
  } as unknown as CountryRow
}

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <CountriesSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.args = []
  mocks.failure = null
  mocks.rows = [country(), country({ country: "FR", open: true, teams: [{ teamId: "team-fr", name: "France", scope: "post" }], activeModerators: 1 })]
  mocks.setOpen.mockResolvedValue({ open: true, changed: true })
})
afterEach(() => cleanup())

describe("couverture géographique", () => {
  it("charge une seule fiche lors de la sélection d’un pays", async () => {
    const user = userEvent.setup()
    mount()
    expect(mocks.args.at(-1)).toEqual({ networkId: NETWORK_ID })
    expect(screen.queryByRole("heading", { name: "France" })).toBeNull()
    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByRole("searchbox"), "France")
    await user.click(screen.getByRole("button", { name: /France/ }))
    expect(screen.getByRole("heading", { name: "France" })).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Belgique" })).toBeNull()
    expect(mocks.setOpen).not.toHaveBeenCalled()
  })

  it("annonce la lecture en cours", () => {
    mocks.rows = undefined
    mount()
    expect(screen.getByRole("status")).toBeVisible()
  })
})
