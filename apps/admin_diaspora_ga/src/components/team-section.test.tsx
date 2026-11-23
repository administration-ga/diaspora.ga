// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { DECISION_REASON_BOUNDS, TEAM_NAME_BOUNDS } from "@/lib/moderation-rules"

/**
 * CH-815 A6 — la section « Équipe et responsables » : les équipes de `myDesk`, la composition, la
 * recherche par identifiant, la création, l'ajout et le retrait motivés ; les responsables du
 * réseau, la nomination motivée (dix caractères au moins), le refus du dernier administrateur.
 * Arguments exacts au moteur. Personnes fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const DESK = "modules/diaspora/moderationDesk:myDesk"
const RESPONSIBLES = "modules/diaspora/moderationDesk:responsibles"
const ROSTER = "modules/diaspora/moderationDesk:teamRoster"
const CANDIDATE = "modules/diaspora/moderationDesk:teamCandidate"
const SET_ROLE = "modules/diaspora/membership:setResponsibleRole"
const SET_MEMBER = "modules/moderation/networkAdmin:setTeamMember"
const CREATE = "modules/moderation/networkAdmin:createTeam"

const mocks = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
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
      if (!mocks.results.has(path)) throw new Error(`lecture inattendue : ${path}`)
      return mocks.results.get(path)
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

import { NetworkAdminProvider } from "./network-admin-context"
import { TeamSection } from "./team-section"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const rules = i18n.getFixedT("fr", "rules")

const TEAMS = [
  { teamId: "team-france", name: "France", scope: null, isMember: false },
  { teamId: "team-avis", name: "Avis", scope: "serviceReview", isMember: true },
]
const lastArgs = (path: string) => mocks.args.get(path)?.at(-1)
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const refusal = (data: Record<string, unknown>) => Object.assign(new Error("refus"), { data })

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <TeamSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

const region = (name: string) => within(screen.getByRole("region", { name }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.args.clear()
  mocks.results = new Map<string, unknown>([
    ["modules/diaspora/hubs:listOpenCountries", []],
    [DESK, { role: "network_admin", networkWide: true, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true, teams: TEAMS }],
    [
      RESPONSIBLES,
      {
        members: [
          { personId: "person-admin", role: "network_admin", handle: "awa.ndong", displayName: "Awa NDONG", active: true, isMe: true },
          { personId: "person-mod", role: "network_moderator", handle: null, displayName: null, active: false, isMe: false },
        ],
        more: false,
      },
    ],
    [ROSTER, { members: [{ personId: "person-ines", handle: "ines.obame", displayName: "Inès OBAME", inNetwork: true, isMe: false }], more: false }],
  ])
  mocks.writes = new Map([
    [SET_ROLE, vi.fn().mockResolvedValue({ role: "network_moderator", changed: true })],
    [SET_MEMBER, vi.fn().mockResolvedValue(null)],
    [CREATE, vi.fn().mockResolvedValue({ teamId: "team-new" })],
  ])
  mocks.oneShot.mockResolvedValue({ personId: "person-jean", handle: "jean.mba", displayName: "Jean MBA" })
})
afterEach(() => cleanup())

describe("section Équipe et responsables — lectures", () => {
  it("lit les équipes, les responsables et la composition de la première équipe, pour l'administrateur admis", () => {
    mount()
    expect(lastArgs(DESK)).toEqual({ networkId: NETWORK_ID, expectedPersonId: "person-admin" })
    expect(lastArgs(RESPONSIBLES)).toEqual({ networkId: NETWORK_ID, expectedPersonId: "person-admin" })
    expect(lastArgs(ROSTER)).toEqual({ networkId: NETWORK_ID, expectedPersonId: "person-admin", teamId: "team-france" })
    for (const write of mocks.writes.values()) expect(write).not.toHaveBeenCalled()
  })

  it("les équipes et leur nature ; les responsables par leur profil publié, rôle en sommeil dit ; le nom tel que le moteur le donne", () => {
    mount()
    const teams = region(t("team.teamsTitle"))
    expect(teams.getByText(n(t("team.scopeOne", { surface: members("moderationDesk.surface.serviceReview") })))).toBeInTheDocument()
    expect(teams.getByText("Inès OBAME")).toBeInTheDocument()
    const responsibles = region(t("responsibles.title"))
    expect(responsibles.getByText("Awa NDONG")).toBeInTheDocument()
    expect(responsibles.getByText(t("team.me"))).toBeInTheDocument()
    expect(responsibles.getByText(t("team.neutralName"))).toBeInTheDocument()
    expect(responsibles.getByText(n(t("responsibles.inactive")))).toBeInTheDocument()
    // Un rôle en sommeil se retire, il ne se change pas.
    expect(responsibles.getAllByRole("button", { name: new RegExp(t("responsibles.change")) })).toHaveLength(1)
  })

  it("choisir une autre équipe relit sa composition", async () => {
    const user = userEvent.setup()
    mount()
    await user.selectOptions(screen.getByLabelText(t("team.picker")), "team-avis")
    expect(lastArgs(ROSTER)).toEqual({ networkId: NETWORK_ID, expectedPersonId: "person-admin", teamId: "team-avis" })
  })

  it("aucune équipe : la section invite à créer la première", () => {
    mocks.results.set(DESK, { role: "network_admin", networkWide: true, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true, teams: [] })
    mount()
    expect(screen.getByText(n(t("team.noneYet")))).toBeInTheDocument()
  })
})

describe("section Équipe et responsables — équipes", () => {
  it("créer une équipe : nom borné, nature facultative, motif ; l'appel exact au moteur", async () => {
    const user = userEvent.setup()
    mount()
    const create = within(screen.getByRole("heading", { level: 2, name: t("team.createTitle") }).closest("div")!)
    await user.type(create.getByLabelText(t("team.name")), "F")
    await user.type(create.getByLabelText(t("decision.reason")), "Ouvrir la modération du Sénégal.")
    await user.click(create.getByRole("button", { name: t("team.create") }))
    expect(await create.findByText(t("team.nameLength", { nameMin: TEAM_NAME_BOUNDS.min, nameMax: TEAM_NAME_BOUNDS.max }))).toBeInTheDocument()
    expect(mocks.writes.get(CREATE)).not.toHaveBeenCalled()
    await user.clear(create.getByLabelText(t("team.name")))
    await user.type(create.getByLabelText(t("team.name")), "  Sénégal ")
    await user.selectOptions(create.getByLabelText(t("team.scope")), "post")
    await user.click(create.getByRole("button", { name: t("team.create") }))
    await waitFor(() =>
      expect(mocks.writes.get(CREATE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, name: "Sénégal", scope: "post", reason: "Ouvrir la modération du Sénégal." }),
    )
    expect(mocks.success).toHaveBeenCalledWith(t("team.created", { name: "Sénégal" }))
  })

  it("ajouter un membre : recherche par identifiant public, puis l'ajout motivé", async () => {
    const user = userEvent.setup()
    mount()
    const teams = region(t("team.teamsTitle"))
    await user.type(teams.getByLabelText(t("team.handle")), "@Jean.Mba")
    await user.click(teams.getByRole("button", { name: t("lookup.search") }))
    await waitFor(() => expect(mocks.oneShot).toHaveBeenCalledWith(CANDIDATE, { networkId: NETWORK_ID, expectedPersonId: "person-admin", handle: "jean.mba" }))
    expect(await teams.findByText("Jean MBA")).toBeInTheDocument()
    await user.type(teams.getByLabelText(t("decision.reason")), "Renfort de l'équipe France.")
    await user.click(teams.getByRole("button", { name: t("team.addConfirm") }))
    await waitFor(() =>
      expect(mocks.writes.get(SET_MEMBER)).toHaveBeenCalledWith({ networkId: NETWORK_ID, teamId: "team-france", personId: "person-jean", active: true, reason: "Renfort de l'équipe France." }),
    )
  })

  it("un identifiant que personne ne porte : la section le dit, rien n'est écrit", async () => {
    mocks.oneShot.mockResolvedValueOnce(null)
    const user = userEvent.setup()
    mount()
    const teams = region(t("team.teamsTitle"))
    await user.type(teams.getByLabelText(t("team.handle")), "inconnu.du.reseau")
    await user.click(teams.getByRole("button", { name: t("lookup.search") }))
    expect(await teams.findByText(t("lookup.unknown"))).toBeInTheDocument()
    expect(mocks.writes.get(SET_MEMBER)).not.toHaveBeenCalled()
  })

  it("retirer un membre : une feuille, un motif, l'appel exact au moteur", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(region(t("team.teamsTitle")).getByRole("button", { name: new RegExp(t("team.remove")) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByLabelText(t("decision.reason")), "Ne modère plus pour le réseau.")
    await user.click(dialog.getByRole("button", { name: t("team.removeConfirm") }))
    await waitFor(() =>
      expect(mocks.writes.get(SET_MEMBER)).toHaveBeenCalledWith({ networkId: NETWORK_ID, teamId: "team-france", personId: "person-ines", active: false, reason: "Ne modère plus pour le réseau." }),
    )
  })
})

describe("section Équipe et responsables — responsables", () => {
  it("nommer : motif de dix caractères au moins, puis le rôle choisi part au moteur", async () => {
    const user = userEvent.setup()
    mount()
    const responsibles = region(t("responsibles.title"))
    await user.type(responsibles.getByLabelText(t("responsibles.handle")), "jean.mba")
    await user.click(responsibles.getByRole("button", { name: t("lookup.search") }))
    await responsibles.findByText("Jean MBA")
    await user.selectOptions(responsibles.getByLabelText(t("responsibles.roleField")), "network_admin")
    await user.type(responsibles.getByLabelText(t("decision.reason")), "Trop bref")
    await user.click(responsibles.getByRole("button", { name: t("responsibles.appointConfirm") }))
    expect(await responsibles.findByText(t("decision.reasonLength", DECISION_REASON_BOUNDS))).toBeInTheDocument()
    expect(mocks.writes.get(SET_ROLE)).not.toHaveBeenCalled()
    await user.type(responsibles.getByLabelText(t("decision.reason")), " : second administrateur du réseau.")
    await user.click(responsibles.getByRole("button", { name: t("responsibles.appointConfirm") }))
    await waitFor(() =>
      expect(mocks.writes.get(SET_ROLE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-jean", role: "network_admin", reason: "Trop bref : second administrateur du réseau." }),
    )
  })

  it("retirer son propre rôle de dernier administrateur : le refus du moteur est dit par la règle partagée", async () => {
    mocks.writes.get(SET_ROLE)!.mockRejectedValueOnce(refusal({ code: "invalidArgument", rule: "NETWORK_LAST_ADMIN" }))
    const user = userEvent.setup()
    mount()
    const own = region(t("responsibles.title")).getByText("Awa NDONG").closest("li")!
    await user.click(within(own).getByRole("button", { name: new RegExp(t("responsibles.remove")) }))
    const dialog = within(await screen.findByRole("dialog"))
    expect(dialog.getByText(n(t("responsibles.selfWarning")))).toBeInTheDocument()
    await user.type(dialog.getByLabelText(t("decision.reason")), "Je quitte l'administration du réseau.")
    await user.click(dialog.getByRole("button", { name: t("responsibles.removeConfirm") }))
    await waitFor(() => expect(mocks.writes.get(SET_ROLE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-admin", role: "member", reason: "Je quitte l'administration du réseau." }))
    expect(await dialog.findByText(n(rules("NETWORK_LAST_ADMIN")))).toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("le refus indistinct d'un rôle se dit sans en livrer la raison", async () => {
    mocks.writes.get(SET_ROLE)!.mockRejectedValueOnce(refusal({ code: "notFound" }))
    const user = userEvent.setup()
    mount()
    const own = region(t("responsibles.title")).getByText("Awa NDONG").closest("li")!
    await user.click(within(own).getByRole("button", { name: new RegExp(t("responsibles.change")) }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByLabelText(t("decision.reason")), "Passage à la modération du réseau.")
    await user.click(dialog.getByRole("button", { name: t("responsibles.changeConfirm") }))
    await waitFor(() => expect(mocks.writes.get(SET_ROLE)).toHaveBeenCalledWith({ networkId: NETWORK_ID, personId: "person-admin", role: "network_moderator", reason: "Passage à la modération du réseau." }))
    expect(await dialog.findByText(n(t("responsibles.refused")))).toBeInTheDocument()
  })
})
