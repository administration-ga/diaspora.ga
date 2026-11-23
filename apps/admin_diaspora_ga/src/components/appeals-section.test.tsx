// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { DECISION_REASON_BOUNDS, type AppealRow } from "@/lib/moderation-rules"

/**
 * CH-815 A6 — la section « Recours » : la file des recours montés au réseau, lue avec ses
 * arguments exacts et ses filtres, l'examen motivé, l'annulation confirmée, le refus traduit, la
 * partie au dossier sans geste. Personnes et dossiers fictifs.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const QUEUE = "modules/diaspora/moderationDesk:appealQueue"
const REVIEW = "modules/moderation/networkAdmin:reviewNetworkAppeal"

const mocks = vi.hoisted(() => ({
  window: undefined as unknown,
  readFailure: null as unknown,
  args: new Map<string, unknown[]>(),
  mutations: [] as string[],
  review: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (path === "modules/diaspora/hubs:listOpenCountries") return []
      if (path === QUEUE) {
        if (mocks.readFailure) throw mocks.readFailure
        return mocks.window
      }
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      mocks.mutations.push(name(reference))
      return mocks.review
    },
  }
})

import { AppealsSection } from "./appeals-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const rules = i18n.getFixedT("fr", "rules")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")

function appeal(overrides: Partial<AppealRow> = {}): AppealRow {
  return {
    appealId: "appeal-1",
    reportId: "report-1",
    surface: "post",
    country: "FR",
    reason: "spam",
    appealReason: "Je conteste ce retrait : il s'agissait d'une annonce d'association.",
    createdAt: Date.UTC(2026, 10, 20, 9, 30),
    decisionReason: "Publication répétée hors sujet.",
    decidedAt: Date.UTC(2026, 10, 19, 18, 0),
    sanctions: [{ kind: "removal", until: null }],
    party: null,
    ...overrides,
  } as AppealRow
}

const windowOf = (items: AppealRow[]) => ({ items, continueCursor: null, isDone: true })
const lastArgs = (path: string) => mocks.args.get(path)?.at(-1)

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <AppealsSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

async function openFirstAppeal() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: t("appeals.open") }))
  const dialog = await screen.findByRole("dialog")
  return { user, dialog: within(dialog) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.window = windowOf([appeal()])
  mocks.readFailure = null
  mocks.args.clear()
  mocks.mutations = []
  mocks.review.mockResolvedValue(null)
})
afterEach(() => cleanup())

describe("section Recours — la file", () => {
  it("lit la file des recours du réseau administré, pour l'administrateur admis, sans rien écrire", () => {
    mount()
    expect(lastArgs(QUEUE)).toEqual({
      networkId: NETWORK_ID,
      expectedPersonId: "person-admin",
      zone: { kind: "all" },
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(mocks.review).not.toHaveBeenCalled()
    expect(mocks.mutations.every((path) => path === REVIEW)).toBe(true)
  })

  it("une carte par recours : nature, pays, motif du dossier, décision contestée, mesures, motif du recours", () => {
    mount()
    const card = within(screen.getByRole("heading", { level: 2, name: members("moderationDesk.surface.post") }).closest("li")!)
    expect(card.getByText(members("moderationDesk.ground.spam"))).toBeInTheDocument()
    expect(card.getByText("Publication répétée hors sujet.")).toBeInTheDocument()
    expect(card.getByText(members("moderationDesk.sanction.removal"))).toBeInTheDocument()
    expect(card.getByText(/il s'agissait d'une annonce d'association/)).toBeInTheDocument()
  })

  it("filtrer par pays et par nature relit la file avec la zone et la nature demandées", async () => {
    const user = userEvent.setup()
    mount()
    await user.selectOptions(screen.getByLabelText(t("filters.zone")), "none")
    expect(lastArgs(QUEUE)).toMatchObject({ zone: { kind: "none" } })
    await user.selectOptions(screen.getByLabelText(t("filters.zone")), "SN")
    expect(lastArgs(QUEUE)).toMatchObject({ zone: { kind: "country", country: "SN" } })
    await user.selectOptions(screen.getByLabelText(t("filters.surface")), "comment")
    expect(lastArgs(QUEUE)).toMatchObject({ zone: { kind: "country", country: "SN" }, surface: "comment" })
  })

  it("une file vide le dit, filtrée ou non", async () => {
    mocks.window = windowOf([])
    const user = userEvent.setup()
    mount()
    expect(screen.getByText(t("appeals.emptyTitle"))).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(t("filters.surface")), "comment")
    expect(screen.getByText(t("appeals.emptyFilteredTitle"))).toBeInTheDocument()
  })

  it("un refus de lecture se dit par la traduction partagée, et se relit", async () => {
    mocks.readFailure = Object.assign(new Error("refus"), { data: { code: "notFound" } })
    const user = userEvent.setup()
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(i18n.getFixedT("fr", "errors")("notFound"))
    mocks.readFailure = null
    await user.click(screen.getByRole("button", { name: t("section.retry") }))
    expect(screen.getByRole("button", { name: t("appeals.open") })).toBeInTheDocument()
  })
})

describe("section Recours — l'examen", () => {
  it("sans issue ni motif suffisant, rien n'est envoyé", async () => {
    mount()
    const { user, dialog } = await openFirstAppeal()
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    expect(await dialog.findByText(t("appeals.outcomeRequired"))).toBeInTheDocument()
    await user.click(dialog.getByRole("radio", { name: new RegExp(t("appeals.uphold")) }))
    await user.type(dialog.getByLabelText(t("decision.reason")), "court")
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    expect(await dialog.findByText(t("decision.reasonLength", DECISION_REASON_BOUNDS))).toBeInTheDocument()
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it("maintenir : l'examen motivé part au moteur avec ses arguments exacts, puis la feuille se ferme", async () => {
    mount()
    const { user, dialog } = await openFirstAppeal()
    await user.click(dialog.getByRole("radio", { name: new RegExp(t("appeals.uphold")) }))
    await user.type(dialog.getByLabelText(t("decision.reason")), "  La décision d'équipe était fondée.  ")
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(1))
    expect(mocks.review).toHaveBeenCalledWith({ networkId: NETWORK_ID, appealId: "appeal-1", overturn: false, reason: "La décision d'équipe était fondée." })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // L'issue est dite une fois, dans la ligne d'état de la section, qui prend le focus.
    expect(screen.getByRole("status").textContent).toBe(t("appeals.doneUpheld"))
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("annuler : une confirmation explicite d'abord, puis l'examen part avec `overturn`", async () => {
    mount()
    const { user, dialog } = await openFirstAppeal()
    await user.click(dialog.getByRole("radio", { name: new RegExp(t("appeals.overturn")) }))
    await user.type(dialog.getByLabelText(t("decision.reason")), "Le contenu respectait les règles.")
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    const confirm = within(dialog.getByRole("group", { name: t("appeals.confirmTitle") }))
    expect(mocks.review).not.toHaveBeenCalled()
    await user.click(confirm.getByRole("button", { name: t("appeals.confirmOverturn") }))
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({ networkId: NETWORK_ID, appealId: "appeal-1", overturn: true, reason: "Le contenu respectait les règles." }))
  })

  it("un refus du moteur se dit en clair : déjà examiné, ou la règle enfreinte par la traduction partagée", async () => {
    mocks.review.mockRejectedValueOnce(Object.assign(new Error("refus"), { data: { code: "conflict" } }))
    mount()
    const { user, dialog } = await openFirstAppeal()
    await user.click(dialog.getByRole("radio", { name: new RegExp(t("appeals.uphold")) }))
    await user.type(dialog.getByLabelText(t("decision.reason")), "La décision d'équipe était fondée.")
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    expect(await dialog.findByText(n(t("appeals.conflict")))).toBeInTheDocument()
    mocks.review.mockRejectedValueOnce(Object.assign(new Error("refus"), { data: { code: "invalidArgument", rule: "DECISION_REASON_LENGTH", params: DECISION_REASON_BOUNDS } }))
    await user.click(dialog.getByRole("button", { name: t("appeals.submit") }))
    expect(await dialog.findByText(n(rules("DECISION_REASON_LENGTH", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("l'ancien décideur ne juge pas le recours : la feuille le dit, sans formulaire", async () => {
    mocks.window = windowOf([appeal({ party: "decider" })])
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: t("appeals.view") }))
    const dialog = within(await screen.findByRole("dialog"))
    expect(dialog.getByText(t("appeals.party.title"))).toBeInTheDocument()
    expect(dialog.getByText(members("moderationDesk.party.decider"))).toBeInTheDocument()
    expect(dialog.queryByRole("button", { name: t("appeals.submit") })).toBeNull()
  })
})
