// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import type { Admission, CohortView } from "@/lib/founders"
import { DECISION_REASON_BOUNDS } from "@/lib/moderation-rules"

/**
 * CH-815 A7 — la section « Fondateurs » : la cohorte (plafond, nombre, qui a admis qui et pourquoi,
 * dispense d'ancienneté, admissions retirées), l'admission d'un membre trouvé par son identifiant
 * public, avec ou sans dispense, le retrait motivé, la cohorte pleine (lue, puis refusée par le
 * moteur), les refus métier traduits. Arguments exacts au moteur. Personnes fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const COHORT = "modules/diaspora/founders:cohort"
const CANDIDATE = "modules/diaspora/founders:candidate"
const ADMIT = "modules/diaspora/founders:admit"
const WITHDRAW = "modules/diaspora/founders:withdraw"

const mocks = vi.hoisted(() => ({
  cohort: undefined as unknown,
  failure: null as unknown,
  args: new Map<string, unknown[]>(),
  writes: new Map<string, ReturnType<typeof vi.fn>>(),
  oneShot: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (path !== COHORT) throw new Error(`lecture inattendue : ${path}`)
      if (mocks.failure) throw mocks.failure
      return mocks.cohort
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      const write = mocks.writes.get(name(reference))
      if (!write) throw new Error(`écriture inattendue : ${name(reference)}`)
      return write
    },
    useConvex: () => ({
      query: async (reference: FunctionReference<"query">, args: unknown) => await mocks.oneShot(name(reference), args),
    }),
  }
})

import { FoundersSection } from "./founders-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const errors = i18n.getFixedT("fr", "errors")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const refusal = (data: Record<string, unknown>) => Object.assign(new Error("refus"), { data })
const lastArgs = (path: string) => mocks.args.get(path)?.at(-1)
const REASON = "Fondatrice de l'association des étudiants."

/** Une admission fictive : identifiants en clair (le moteur les rend opaques). */
function admission(overrides: Partial<Record<keyof Admission, unknown>> = {}): Admission {
  return {
    admissionId: "admission-1",
    personId: "person-ines",
    person: { handle: "ines.obame", displayName: "Inès OBAME" },
    reason: "Présidente de l'association des étudiants gabonais de Lyon.",
    seniorityWaiver: true,
    admittedAt: Date.UTC(2026, 10, 20, 9, 0),
    admittedBy: { personId: "person-admin", handle: "awa.ndong", displayName: "Awa NDONG" },
    withdrawnAt: null,
    withdrawnBy: null,
    withdrawnByPerson: null,
    withdrawalReason: null,
    ...overrides,
  } as unknown as Admission
}

function cohort(overrides: Partial<CohortView> = {}): CohortView {
  return { cohortMax: 30, activeCount: 1, active: [admission()], withdrawn: [], ...overrides } as CohortView
}

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <FoundersSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.args.clear()
  mocks.failure = null
  mocks.cohort = cohort()
  mocks.writes = new Map([
    [ADMIT, vi.fn().mockResolvedValue({ admissionId: "admission-2", status: "verifiee" })],
    [WITHDRAW, vi.fn().mockResolvedValue({ status: "declaree" })],
  ])
  mocks.oneShot.mockResolvedValue({ personId: "person-jean", handle: "jean.mba", displayName: "Jean MBA" })
})
afterEach(() => cleanup())

describe("section Fondateurs — la cohorte", () => {
  it("lit la cohorte du réseau administré ; le nombre et le plafond, tels que le moteur les rend", () => {
    mount()
    expect(lastArgs(COHORT)).toEqual({ networkId: NETWORK_ID })
    expect(screen.getByText(n(t("founders.count", { count: 1, shown: "1", max: "30" })))).toBeInTheDocument()
    for (const write of mocks.writes.values()) expect(write).not.toHaveBeenCalled()
  })

  it("qui a été admis, par qui, quand, pourquoi, avec la dispense ; le retrait porte le nom de la personne", () => {
    mount()
    const line = within(screen.getAllByRole("listitem")[0]!)
    expect(line.getByText("Inès OBAME")).toBeInTheDocument()
    expect(line.getByText("@ines.obame")).toBeInTheDocument()
    expect(line.getByText("Awa NDONG")).toBeInTheDocument()
    expect(line.getByText("Présidente de l'association des étudiants gabonais de Lyon.")).toBeInTheDocument()
    expect(line.getByText(t("founders.waiverBadge"))).toBeInTheDocument()
    expect(line.getByRole("button", { name: t("founders.withdrawFor", { name: "Inès OBAME" }) })).toBeInTheDocument()
  })

  it("une admission d'amorçage sans auteur, un profil non publié : des noms neutres, rien d'inventé", () => {
    mocks.cohort = cohort({ active: [admission({ person: { handle: "", displayName: "" }, admittedBy: null, seniorityWaiver: false })] })
    mount()
    const line = within(screen.getAllByRole("listitem")[0]!)
    expect(line.getByText(t("founders.neutralName"))).toBeInTheDocument()
    expect(line.getByText(t("founders.admittedBySeed"))).toBeInTheDocument()
    expect(line.queryByText(t("founders.waiverBadge"))).toBeNull()
  })

  it("les admissions retirées : par décision (et de qui), ou par départ, avec leur motif", () => {
    mocks.cohort = cohort({
      withdrawn: [
        admission({ admissionId: "w-1", personId: "person-paul", person: { handle: "paul.ella", displayName: "Paul ELLA" }, withdrawnAt: Date.UTC(2026, 10, 21), withdrawnBy: "operator", withdrawnByPerson: { personId: "person-admin", handle: "awa.ndong", displayName: "Awa NDONG" }, withdrawalReason: "Engagement non tenu envers la cohorte." }),
        admission({ admissionId: "w-2", personId: "person-zoe", person: { handle: "zoe.ndong", displayName: "Zoé NDONG" }, withdrawnAt: Date.UTC(2026, 10, 22), withdrawnBy: "departure" }),
      ],
    })
    mount()
    const details = screen.getByText(t("founders.withdrawnTitle")).closest("details")!
    expect(within(details).getByText("Paul ELLA")).toBeInTheDocument()
    expect(within(details).getByText(/décision de Awa NDONG/)).toBeInTheDocument()
    expect(within(details).getByText("Engagement non tenu envers la cohorte.")).toBeInTheDocument()
    expect(within(details).getByText(new RegExp(t("founders.causeDeparture")))).toBeInTheDocument()
  })

  it("cohorte vide : un état vide qui invite à admettre", () => {
    mocks.cohort = cohort({ activeCount: 0, active: [] })
    mount()
    expect(screen.getByText(t("founders.emptyTitle"))).toBeInTheDocument()
    expect(screen.getByRole("region", { name: t("founders.admitTitle") })).toBeInTheDocument()
  })

  it("cohorte pleine : la section le dit et n'offre plus l'admission", () => {
    mocks.cohort = cohort({ cohortMax: 1, activeCount: 1 })
    mount()
    expect(screen.getByText(n(t("founders.full", { max: "1" })))).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: t("founders.admitTitle") })).toBeNull()
  })

  it("pendant la lecture : un état de chargement ; un refus de lecture reste dans la section", () => {
    mocks.cohort = undefined
    const { unmount } = mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("section.loading"))
    unmount()
    mocks.failure = refusal({ code: "notFound" })
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(errors("notFound"))
  })
})

describe("section Fondateurs — admettre et retirer", () => {
  const admitRegion = () => within(screen.getByRole("region", { name: t("founders.admitTitle") }))

  async function pick(user: ReturnType<typeof userEvent.setup>) {
    await user.type(admitRegion().getByLabelText(t("founders.handle")), "@jean.mba")
    await user.click(admitRegion().getByRole("button", { name: t("lookup.search") }))
    await admitRegion().findByText("Jean MBA")
  }

  it("admettre sans dispense : membre cherché par identifiant public, arguments exacts", async () => {
    const user = userEvent.setup()
    mount()
    await pick(user)
    expect(mocks.oneShot).toHaveBeenCalledWith(CANDIDATE, { networkId: NETWORK_ID, handle: "jean.mba" })
    await user.type(admitRegion().getByLabelText(t("decision.reason")), REASON)
    await user.click(admitRegion().getByRole("button", { name: t("founders.admitConfirm") }))
    await waitFor(() => expect(mocks.writes.get(ADMIT)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-jean", reason: REASON, seniorityWaiver: false }))
    expect(mocks.success).toHaveBeenCalledWith(t("founders.admitted", { name: "Jean MBA" }))
  })

  it("admettre avec dispense d'ancienneté : la case (jamais précochée) passe au moteur", async () => {
    const user = userEvent.setup()
    mount()
    await pick(user)
    const waiver = admitRegion().getByRole("checkbox", { name: t("founders.waiver") })
    expect(waiver).toHaveAttribute("aria-checked", "false")
    await user.click(waiver)
    await user.type(admitRegion().getByLabelText(t("decision.reason")), REASON)
    await user.click(admitRegion().getByRole("button", { name: t("founders.admitConfirm") }))
    await waitFor(() => expect(mocks.writes.get(ADMIT)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-jean", reason: REASON, seniorityWaiver: true }))
  })

  it("motif trop court : rien ne part", async () => {
    const user = userEvent.setup()
    mount()
    await pick(user)
    await user.type(admitRegion().getByLabelText(t("decision.reason")), "court")
    await user.click(admitRegion().getByRole("button", { name: t("founders.admitConfirm") }))
    expect(await admitRegion().findByText(n(t("decision.reasonLength", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(mocks.writes.get(ADMIT)).not.toHaveBeenCalled()
  })

  it.each([
    ["cohorte pleine", { code: "conflict", appRule: "founding_cohort_full", appParams: { limit: 30 } }, t("founders.refusal.cohortFull", { limit: 30 })],
    ["déjà admise", { code: "conflict", appRule: "founding_already_admitted" }, t("founders.refusal.alreadyAdmitted")],
    ["pas membre active", { code: "notFound", appRule: "founding_target_not_member", appParams: {} }, t("founders.refusal.notMember")],
  ])("le refus du moteur (%s) se dit en clair", async (_, data, text) => {
    const user = userEvent.setup()
    mocks.writes.get(ADMIT)!.mockRejectedValueOnce(refusal(data))
    mount()
    await pick(user)
    await user.type(admitRegion().getByLabelText(t("decision.reason")), REASON)
    await user.click(admitRegion().getByRole("button", { name: t("founders.admitConfirm") }))
    expect(await admitRegion().findByText(n(text))).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("retirer une admission : motif exigé, arguments exacts ; l'admission déjà retirée se dit", async () => {
    const user = userEvent.setup()
    mocks.writes.get(WITHDRAW)!.mockRejectedValueOnce(refusal({ code: "notFound", appRule: "founding_not_admitted" }))
    mount()
    await user.click(screen.getByRole("button", { name: t("founders.withdrawFor", { name: "Inès OBAME" }) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.click(dialog.getByRole("button", { name: t("founders.withdrawConfirm") }))
    expect(await dialog.findByText(n(t("decision.reasonLength", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(mocks.writes.get(WITHDRAW)).not.toHaveBeenCalled()
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("founders.withdrawConfirm") }))
    expect(await dialog.findByText(n(t("founders.refusal.notAdmitted")))).toBeInTheDocument()
    expect(mocks.writes.get(WITHDRAW)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-ines", reason: REASON })
    await user.click(dialog.getByRole("button", { name: t("founders.withdrawConfirm") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("founders.withdrawn", { name: "Inès OBAME" })))
  })
})
