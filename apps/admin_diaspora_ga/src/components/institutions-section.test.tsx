// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { DECISION_REASON_BOUNDS } from "@/lib/moderation-rules"
import { OFFICIAL_PAGES_PAGE, type OfficialPageRow } from "@/lib/official-pages"

/**
 * CH-815 A7 — la section « Institutions et pages officielles » : module « Pages » fermé (aucune
 * lecture des pages, renvoi aux modules), la liste et son filtre d'état aux arguments exacts, la
 * suite par curseur, la création (signataire par identifiant public, adresse tirée du nom ou
 * saisie, motif de dix caractères au moins), la désignation et le remplacement du signataire, la
 * mise en sommeil et le réveil, les refus du moteur traduits. Institutions et personnes fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const SETTINGS = "modules/networks/features:settings"
const PAGES = "modules/pages/networkAdmin:officialPages"
const CANDIDATE = "modules/pages/networkAdmin:signatoryCandidate"
const CREATE = "modules/pages/networkAdmin:createOfficialPage"
const DESIGNATE = "modules/pages/networkAdmin:designateSignatory"
const SLEEP = "modules/pages/networkAdmin:sleepOfficialPage"
const WAKE = "modules/pages/networkAdmin:wakeOfficialPage"

const mocks = vi.hoisted(() => ({
  settings: undefined as unknown,
  windows: new Map<string, unknown>(),
  pagesFailure: null as unknown,
  args: new Map<string, unknown[]>(),
  writes: new Map<string, ReturnType<typeof vi.fn>>(),
  oneShot: vi.fn(),
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: { status?: string; paginationOpts?: { cursor: string | null } }) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (path === SETTINGS) return mocks.settings
      if (path === PAGES) {
        if (mocks.pagesFailure) throw mocks.pagesFailure
        return mocks.windows.get(`${args.status}:${args.paginationOpts?.cursor ?? ""}`)
      }
      throw new Error(`lecture inattendue : ${path}`)
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

import { InstitutionsSection } from "./institutions-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const rules = i18n.getFixedT("fr", "rules")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const refusal = (data: Record<string, unknown>) => Object.assign(new Error("refus"), { data })
const lastArgs = (path: string) => mocks.args.get(path)?.at(-1)
const REASON = "Page de l'ambassade pour le lancement."

const open = (pages: boolean) => [
  { feature: "pages", open: pages, enabled: pages, requires: null, updatedAt: null },
  { feature: "jobs", open: false, enabled: false, requires: "pages", updatedAt: null },
]

/** Une page fictive : identifiants en clair (le moteur les rend opaques). */
function page(overrides: Partial<Record<keyof OfficialPageRow, unknown>> = {}): OfficialPageRow {
  return {
    pageId: "page-ambassade",
    name: "Ambassade du Gabon en France",
    handle: "ambassade-gabon-france",
    country: "FR",
    state: "active",
    sleepEndsAt: null,
    signatory: { personId: "person-ines", handle: "ines.obame", displayName: "Inès OBAME", accepted: true },
    createdAt: Date.UTC(2026, 10, 20),
    ...overrides,
  } as unknown as OfficialPageRow
}

const done = (rows: OfficialPageRow[]) => ({ page: rows, isDone: true, continueCursor: "" })

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <InstitutionsSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.args.clear()
  mocks.windows.clear()
  mocks.pagesFailure = null
  mocks.settings = open(true)
  mocks.windows.set("active:", done([page()]))
  mocks.writes = new Map([
    [CREATE, vi.fn().mockResolvedValue({ pageId: "page-new", handle: "consulat-gabon-lyon" })],
    [DESIGNATE, vi.fn().mockResolvedValue({ invited: true, replaced: false })],
    [SLEEP, vi.fn().mockResolvedValue({ sleepEndsAt: Date.UTC(2026, 11, 23) })],
    [WAKE, vi.fn().mockResolvedValue({ status: "active" })],
  ])
  mocks.oneShot.mockResolvedValue({ personId: "person-jean", handle: "jean.mba", displayName: "Jean MBA" })
})
afterEach(() => cleanup())

describe("section Institutions — module « Pages »", () => {
  it("fermé : une explication neutre et le lien vers les modules, aucune lecture des pages", () => {
    mocks.settings = open(false)
    mount()
    expect(screen.getByRole("heading", { name: t("institutions.closed.title") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t("institutions.closed.link") })).toHaveAttribute("href", "/modules")
    expect(mocks.args.has(PAGES)).toBe(false)
    expect(screen.queryByRole("button", { name: t("institutions.create") })).toBeNull()
  })

  it("refermé entre-temps : le refus indistinct de la lecture se dit comme un module fermé", () => {
    mocks.pagesFailure = refusal({ code: "notFound" })
    mount()
    expect(screen.getByRole("heading", { name: t("institutions.closed.title") })).toBeInTheDocument()
  })

  it("une autre panne de lecture reste dans la section, avec « Relire »", () => {
    mocks.pagesFailure = refusal({ code: "rateLimited" })
    mount()
    expect(screen.getByRole("button", { name: t("section.retry") })).toBeInTheDocument()
  })

  it("pendant la lecture des modules : un état de chargement, aucune page", () => {
    mocks.settings = undefined
    mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("section.loading"))
    expect(mocks.args.has(PAGES)).toBe(false)
  })
})

describe("section Institutions — liste", () => {
  it("lit les pages actives du réseau, vingt par fenêtre ; nom, adresse, pays, état, signataire", () => {
    mount()
    expect(lastArgs(PAGES)).toEqual({ networkId: NETWORK_ID, status: "active", paginationOpts: { cursor: null, numItems: OFFICIAL_PAGES_PAGE } })
    const line = within(screen.getAllByRole("listitem")[0]!)
    expect(line.getByText("Ambassade du Gabon en France")).toBeInTheDocument()
    expect(line.getByText("@ambassade-gabon-france")).toBeInTheDocument()
    expect(line.getByText("Inès OBAME")).toBeInTheDocument()
    expect(line.getByText(t("institutions.state.active"))).toBeInTheDocument()
    // Les gestes d'une ligne portent le nom de la page.
    expect(line.getByRole("button", { name: t("institutions.replaceFor", { name: "Ambassade du Gabon en France" }) })).toBeInTheDocument()
    expect(line.getByRole("button", { name: t("institutions.sleepFor", { name: "Ambassade du Gabon en France" }) })).toBeInTheDocument()
    for (const write of mocks.writes.values()) expect(write).not.toHaveBeenCalled()
  })

  it("signataire en attente, sans signataire, profil non publié : chacun dit en clair", () => {
    mocks.windows.set(
      "active:",
      done([
        page({ pageId: "p-1", name: "Consulat de Lyon", signatory: { personId: "person-x", handle: null, displayName: null, accepted: false } }),
        page({ pageId: "p-2", name: "Office du tourisme", signatory: null }),
      ]),
    )
    mount()
    const [first, second] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(first!.getByText(n(t("institutions.invitationPending", { name: t("institutions.neutralName") })))).toBeInTheDocument()
    expect(second!.getByText(n(t("institutions.noSignatory")))).toBeInTheDocument()
    expect(second!.getByRole("button", { name: t("institutions.designateFor", { name: "Office du tourisme" }) })).toBeInTheDocument()
  })

  it("le filtre « en sommeil ou retirées » relit l'autre état ; sommeil réveillable, retrait sans geste", async () => {
    const user = userEvent.setup()
    mocks.windows.set(
      "inactive:",
      done([
        page({ pageId: "p-1", name: "Consulat de Lyon", state: "asleep", sleepEndsAt: Date.UTC(2026, 11, 20) }),
        page({ pageId: "p-2", name: "Office du tourisme", state: "withdrawn" }),
      ]),
    )
    mount()
    await user.selectOptions(screen.getByLabelText(t("institutions.statusFilter")), "inactive")
    expect(lastArgs(PAGES)).toEqual({ networkId: NETWORK_ID, status: "inactive", paginationOpts: { cursor: null, numItems: OFFICIAL_PAGES_PAGE } })
    const [asleep, withdrawn] = screen.getAllByRole("listitem").map((item) => within(item))
    expect(asleep!.getByRole("button", { name: t("institutions.wakeFor", { name: "Consulat de Lyon" }) })).toBeInTheDocument()
    expect(asleep!.queryByRole("button", { name: /sommeil/ })).toBeNull()
    expect(withdrawn!.getByText(n(t("institutions.withdrawnNote")))).toBeInTheDocument()
    expect(withdrawn!.queryByRole("button")).toBeNull()
  })

  it("aucune page active : un état vide qui invite à créer la première", () => {
    mocks.windows.set("active:", done([]))
    mount()
    expect(screen.getByText(t("institutions.emptyActiveTitle"))).toBeInTheDocument()
  })

  it("par fenêtres : « Afficher plus » lit la suivante à son curseur", async () => {
    const user = userEvent.setup()
    mocks.windows.set("active:", { page: [page()], isDone: false, continueCursor: "suite-1" })
    mocks.windows.set("active:suite-1", done([page({ pageId: "p-2", name: "Consulat de Lyon" })]))
    mount()
    await user.click(screen.getByRole("button", { name: t("section.loadMore") }))
    expect(lastArgs(PAGES)).toEqual({ networkId: NETWORK_ID, status: "active", paginationOpts: { cursor: "suite-1", numItems: OFFICIAL_PAGES_PAGE } })
    expect(await screen.findByText("Consulat de Lyon")).toBeInTheDocument()
  })
})

describe("section Institutions — créer une page officielle", () => {
  const form = () => within(screen.getByRole("region", { name: t("institutions.createTitle") }))

  async function pickSignatory(user: ReturnType<typeof userEvent.setup>) {
    await user.type(form().getByLabelText(t("institutions.signatoryHandle")), "@jean.mba")
    await user.click(form().getByRole("button", { name: t("lookup.search") }))
    await form().findByText("Jean MBA")
  }

  it("signataire cherché par identifiant public ; adresse tirée du nom ; arguments exacts au moteur", async () => {
    const user = userEvent.setup()
    mount()
    await pickSignatory(user)
    expect(mocks.oneShot).toHaveBeenCalledWith(CANDIDATE, { networkId: NETWORK_ID, handle: "jean.mba" })
    await user.type(form().getByLabelText(t("institutions.name")), "Consulat du Gabon à Lyon")
    expect(form().getByText(n(t("institutions.handlePreview", { handle: "consulat-du-gabon-a-lyon" })))).toBeInTheDocument()
    await user.selectOptions(form().getByLabelText(t("institutions.country")), "FR")
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    await waitFor(() =>
      expect(mocks.writes.get(CREATE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, name: "Consulat du Gabon à Lyon", country: "FR", signatoryPersonId: "person-jean", reason: REASON }),
    )
    expect(mocks.success).toHaveBeenCalledWith(t("institutions.created", { name: "Consulat du Gabon à Lyon", handle: "consulat-gabon-lyon" }))
  })

  it("une adresse saisie est envoyée telle quelle", async () => {
    const user = userEvent.setup()
    mount()
    await pickSignatory(user)
    await user.type(form().getByLabelText(t("institutions.name")), "Consulat du Gabon à Lyon")
    await user.type(form().getByLabelText(t("institutions.handle")), "consulat-lyon")
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    await waitFor(() => expect(mocks.writes.get(CREATE)).toHaveBeenCalledWith(expect.objectContaining({ handle: "consulat-lyon" })))
  })

  it("après une création réussie, tout le formulaire repart vide : identifiant du signataire, signataire choisi, nom, adresse, pays, motif", async () => {
    const user = userEvent.setup()
    mount()
    await pickSignatory(user)
    await user.type(form().getByLabelText(t("institutions.name")), "Consulat du Gabon à Lyon")
    await user.type(form().getByLabelText(t("institutions.handle")), "consulat-lyon")
    await user.selectOptions(form().getByLabelText(t("institutions.country")), "FR")
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalled())
    // Le signataire choisi a disparu : le champ de recherche est de retour, et vide.
    expect(await form().findByLabelText(t("institutions.signatoryHandle"))).toHaveValue("")
    expect(form().queryByText("Jean MBA")).toBeNull()
    expect(form().getByLabelText(t("institutions.name"))).toHaveValue("")
    expect(form().getByLabelText(t("institutions.handle"))).toHaveValue("")
    expect(form().getByLabelText(t("institutions.country"))).toHaveValue("")
    expect(form().getByLabelText(t("decision.reason"))).toHaveValue("")
  })

  it("sans signataire, sans motif suffisant, sans adresse tirable du nom : rien ne part", async () => {
    const user = userEvent.setup()
    mount()
    await user.type(form().getByLabelText(t("institutions.name")), "Î")
    await user.type(form().getByLabelText(t("decision.reason")), "court")
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    expect(await form().findByText(n(t("decision.reasonLength", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(form().getByText(n(t("institutions.handleRequired", { handleMin: 3, handleMax: 60 })))).toBeInTheDocument()
    expect(mocks.writes.get(CREATE)).not.toHaveBeenCalled()
    await user.clear(form().getByLabelText(t("decision.reason")))
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.type(form().getByLabelText(t("institutions.handle")), "office-lyon")
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    expect(await form().findByText(n(t("institutions.signatoryRequired")))).toBeInTheDocument()
    expect(mocks.writes.get(CREATE)).not.toHaveBeenCalled()
  })

  it("un membre introuvable se dit, sans signataire retenu", async () => {
    const user = userEvent.setup()
    mocks.oneShot.mockResolvedValueOnce(null)
    mount()
    await user.type(form().getByLabelText(t("institutions.signatoryHandle")), "inconnu.x")
    await user.click(form().getByRole("button", { name: t("lookup.search") }))
    expect(await form().findByText(n(t("lookup.unknown")))).toBeInTheDocument()
  })

  it.each([
    ["l'identité vérifiée du signataire", { code: "invalidArgument", rule: "PAGE_SIGNATORY_IDENTITY_REQUIRED", params: {} }, "institutions.refusal.signatoryIdentity"],
    ["l'adresse déjà prise", { code: "handleUnavailable" }, "institutions.refusal.handleTaken"],
    ["le signataire sorti du réseau", { code: "notFound" }, "institutions.refusal.notFound"],
  ])("le refus du moteur sur %s se dit en clair", async (_, data, key) => {
    const user = userEvent.setup()
    mocks.writes.get(CREATE)!.mockRejectedValueOnce(refusal(data))
    mount()
    await pickSignatory(user)
    await user.type(form().getByLabelText(t("institutions.name")), "Consulat du Gabon à Lyon")
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    expect(await form().findByText(n(t(key)))).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("une règle de page du domaine passe par la traduction partagée", async () => {
    const user = userEvent.setup()
    mocks.writes.get(CREATE)!.mockRejectedValueOnce(refusal({ code: "invalidArgument", rule: "PAGE_NAME_LENGTH", params: { max: 120 } }))
    mount()
    await pickSignatory(user)
    await user.type(form().getByLabelText(t("institutions.name")), "Consulat du Gabon à Lyon")
    await user.type(form().getByLabelText(t("decision.reason")), REASON)
    await user.click(form().getByRole("button", { name: t("institutions.create") }))
    expect(await form().findByText(n(rules("PAGE_NAME_LENGTH", { max: 120 })))).toBeInTheDocument()
  })
})

describe("section Institutions — signataire, sommeil, réveil", () => {
  async function openDesignation(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: t("institutions.replaceFor", { name: "Ambassade du Gabon en France" }) }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(t("institutions.signatoryHandle")), "jean.mba")
    await user.click(within(dialog).getByRole("button", { name: t("lookup.search") }))
    await within(dialog).findByText("Jean MBA")
    return within(dialog)
  }

  it("désigner sans remplacer : l'ancien signataire reste ; arguments exacts", async () => {
    const user = userEvent.setup()
    mount()
    const dialog = await openDesignation(user)
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("institutions.designateConfirm") }))
    await waitFor(() => expect(mocks.writes.get(DESIGNATE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, pageId: "page-ambassade", personId: "person-jean", reason: REASON }))
    expect(mocks.success).toHaveBeenCalledWith(t("institutions.invited", { name: "Jean MBA", page: "Ambassade du Gabon en France" }))
  })

  it("remplacer : la case cochée retire l'ancien dans la même décision", async () => {
    const user = userEvent.setup()
    mount()
    const dialog = await openDesignation(user)
    await user.click(dialog.getByRole("checkbox", { name: t("institutions.replaceCurrent", { name: "Inès OBAME" }) }))
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("institutions.designateConfirm") }))
    await waitFor(() =>
      expect(mocks.writes.get(DESIGNATE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, pageId: "page-ambassade", personId: "person-jean", replacesPersonId: "person-ines", reason: REASON }),
    )
  })

  it("le même signataire que celui retiré : le refus du moteur se dit en clair", async () => {
    const user = userEvent.setup()
    mocks.writes.get(DESIGNATE)!.mockRejectedValueOnce(refusal({ code: "invalidArgument", field: "replacesPersonId" }))
    mount()
    const dialog = await openDesignation(user)
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("institutions.designateConfirm") }))
    expect(await dialog.findByText(n(t("institutions.refusal.sameSignatory")))).toBeInTheDocument()
  })

  it("mettre en sommeil : motif exigé, puis arguments exacts et échéance annoncée", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole("button", { name: t("institutions.sleepFor", { name: "Ambassade du Gabon en France" }) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.click(dialog.getByRole("button", { name: t("institutions.sleepConfirm") }))
    expect(await dialog.findByText(n(t("decision.reasonLength", DECISION_REASON_BOUNDS)))).toBeInTheDocument()
    expect(mocks.writes.get(SLEEP)).not.toHaveBeenCalled()
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("institutions.sleepConfirm") }))
    await waitFor(() => expect(mocks.writes.get(SLEEP)).toHaveBeenCalledWith({ networkId: NETWORK_ID, pageId: "page-ambassade", reason: REASON }))
    expect(mocks.success).toHaveBeenCalledOnce()
  })

  it("réveiller : arguments exacts ; la mesure du juge se dit en clair", async () => {
    const user = userEvent.setup()
    mocks.windows.set("active:", done([page({ state: "expired", sleepEndsAt: Date.UTC(2026, 10, 1) })]))
    mocks.writes.get(WAKE)!.mockRejectedValueOnce(refusal({ code: "conflict" }))
    mount()
    await user.click(screen.getByRole("button", { name: t("institutions.wakeFor", { name: "Ambassade du Gabon en France" }) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByLabelText(t("decision.reason")), REASON)
    await user.click(dialog.getByRole("button", { name: t("institutions.wakeConfirm") }))
    expect(await dialog.findByText(n(t("institutions.refusal.conflict")))).toBeInTheDocument()
    expect(mocks.writes.get(WAKE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, pageId: "page-ambassade", reason: REASON })
  })
})
