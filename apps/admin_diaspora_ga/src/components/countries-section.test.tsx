// @vitest-environment jsdom
import { COUNTRY_OPENING_REQUIREMENTS } from "@diaspora-ga/domain"
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import type { CountryRow } from "@/lib/countries"
import { DECISION_REASON_BOUNDS } from "@/lib/moderation-rules"

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
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const errors = i18n.getFixedT("fr", "errors")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const refusal = (data: Record<string, unknown>) => Object.assign(new Error("refus"), { data })
const REASON = "Équipe de Belgique en place et relais engagés."

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

describe("section Pays ouverts — lecture", () => {
  it("chaque carte dit le code puis le nom du pays une seule fois (et non deux fois le nom)", () => {
    mount()
    const [belgium, france] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(belgium!.getByRole("heading", { name: "Belgique" })).toHaveTextContent(/^BEBelgique$/)
    expect(france!.getByRole("heading", { name: "France" })).toHaveTextContent(/^FRFrance$/)
  })

  it("lit les pays du réseau administré ; ouverture, équipes, modérateurs actifs, compteurs présentés", () => {
    mount()
    expect(mocks.args.at(-1)).toEqual({ networkId: NETWORK_ID })
    const [belgium, france] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(belgium!.getByRole("heading", { name: "Belgique" })).toBeInTheDocument()
    expect(belgium!.getByText(t("countries.closed"))).toBeInTheDocument()
    expect(belgium!.getByText(n(t("countries.moderatorsCount", { count: 2, shown: "2" })))).toBeInTheDocument()
    expect(belgium!.getByText("42")).toBeInTheDocument()
    expect(belgium!.getByText(members("hub.counters.associations"))).toBeInTheDocument()
    // Les évènements à venir ne sont pas comptés exactement par cette lecture : aucun chiffre de façade.
    expect(belgium!.queryByText(members("hub.counters.events"))).toBeNull()
    expect(belgium!.getByRole("button", { name: t("countries.openFor", { country: "Belgique" }) })).toBeInTheDocument()
    expect(france!.getByText(t("countries.open"))).toBeInTheDocument()
    expect(france!.getByText(t("countries.teamWithScope", { name: "France", surface: members("moderationDesk.surface.post") }))).toBeInTheDocument()
    expect(france!.getByRole("button", { name: t("countries.closeFor", { country: "France" }) })).toBeInTheDocument()
    expect(mocks.setOpen).not.toHaveBeenCalled()
  })

  it("un pays sans équipe, au hub pas encore compté : il le dit, sans chiffre", () => {
    mocks.rows = [country({ teams: [], activeModerators: 0, canOpen: false, countersComputedAt: null })]
    mount()
    const card = within(screen.getByRole("listitem"))
    expect(card.getByText(t("countries.noTeam"))).toBeInTheDocument()
    expect(card.getByText(n(t("countries.notCounted")))).toBeInTheDocument()
    expect(card.queryByText("42")).toBeNull()
  })

  it("un pays ouvert sans modérateur actif : l'anomalie est signalée", () => {
    mocks.rows = [country({ country: "FR", open: true, teams: [], activeModerators: 0, canOpen: false })]
    mount()
    expect(screen.getByText(n(t("countries.anomaly")))).toBeInTheDocument()
  })

  it("aucun pays : un état vide qui renvoie à l'équipe", () => {
    mocks.rows = []
    mount()
    expect(screen.getByText(t("countries.emptyTitle"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t("countries.teamLink") })).toHaveAttribute("href", "/equipe")
  })

  it("pendant la lecture : un état de chargement ; un refus reste dans la section", () => {
    mocks.rows = undefined
    const { unmount } = mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("section.loading"))
    unmount()
    mocks.failure = refusal({ code: "policyRefused" })
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(errors("policyRefused"))
  })
})

describe("section Pays ouverts — ouvrir et fermer", () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: t("countries.openFor", { country: "Belgique" }) }))
    return within(await screen.findByRole("dialog"))
  }

  it("ouvrir : l'attestation des associations relais est obligatoire, comme le motif", async () => {
    const user = userEvent.setup()
    mount()
    const dialog = await openSheet(user)
    await user.click(dialog.getByRole("button", { name: t("countries.openConfirm") }))
    expect(await dialog.findByText(n(t("countries.attestationRequired")))).toBeInTheDocument()
    expect(dialog.getByText(n(t("decision.reasonLength", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(mocks.setOpen).not.toHaveBeenCalled()
  })

  it("ouvrir, relais attestés et motif donné : arguments exacts au moteur", async () => {
    const user = userEvent.setup()
    mount()
    const dialog = await openSheet(user)
    const attestation = dialog.getByRole("checkbox", { name: t("countries.attestation", { relays: COUNTRY_OPENING_REQUIREMENTS.relayAssociations, country: "Belgique" }) })
    expect(attestation).toHaveAttribute("aria-checked", "false")
    await user.click(attestation)
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("countries.openConfirm") }))
    await waitFor(() => expect(mocks.setOpen).toHaveBeenCalledWith({ networkId: NETWORK_ID, country: "BE", open: true, reason: REASON, relayAssociationsAttested: true }))
    expect(mocks.success).toHaveBeenCalledWith(t("countries.opened", { country: "Belgique" }))
  })

  it.each([
    ["moderator_missing", { code: "conflict", appRule: "moderator_missing", appParams: { required: 1 } }, t("countries.refusal.moderatorMissing", { required: 1 })],
    ["relay_associations_missing", { code: "conflict", appRule: "relay_associations_missing", appParams: { required: 2 } }, t("countries.refusal.relayMissing", { required: 2 })],
  ])("le refus du moteur %s est expliqué", async (_, data, text) => {
    const user = userEvent.setup()
    mocks.setOpen.mockRejectedValueOnce(refusal(data))
    mount()
    const dialog = await openSheet(user)
    await user.click(dialog.getByRole("checkbox"))
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("countries.openConfirm") }))
    expect(await dialog.findByText(n(text))).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("sans modérateur actif lu, l'ouverture n'est pas offerte : la section renvoie à l'équipe", async () => {
    const user = userEvent.setup()
    mocks.rows = [country({ activeModerators: 0, canOpen: false })]
    mount()
    const dialog = await openSheet(user)
    expect(dialog.getByText(n(t("countries.cannotOpen")))).toBeInTheDocument()
    expect(dialog.queryByRole("button", { name: t("countries.openConfirm") })).toBeNull()
    expect(dialog.getByRole("link", { name: t("countries.teamLink") })).toHaveAttribute("href", "/equipe")
  })

  it("fermer : motif exigé, arguments exacts, sans attestation", async () => {
    const user = userEvent.setup()
    mocks.setOpen.mockResolvedValueOnce({ open: false, changed: true })
    mount()
    await user.click(screen.getByRole("button", { name: t("countries.closeFor", { country: "France" }) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("countries.closeConfirm") }))
    await waitFor(() => expect(mocks.setOpen).toHaveBeenCalledWith({ networkId: NETWORK_ID, country: "FR", open: false, reason: REASON }))
    expect(mocks.success).toHaveBeenCalledWith(t("countries.closedDone", { country: "France" }))
  })

  it("sans changement, le moteur n'écrit rien : la section le dit", async () => {
    const user = userEvent.setup()
    mocks.setOpen.mockResolvedValueOnce({ open: true, changed: false })
    mount()
    const dialog = await openSheet(user)
    await user.click(dialog.getByRole("checkbox"))
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("countries.openConfirm") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("countries.unchangedOpen", { country: "Belgique" })))
  })
})
