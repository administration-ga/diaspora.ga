// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { JOURNAL_PAGE } from "@/lib/journal"

/**
 * CH-815 A7 — le tableau de bord : seules les lectures réelles du moteur (compteurs tenus, modules
 * ouverts nommés, équipes vivantes, dernières décisions) ; chaque tuile mène à sa section ; aucun
 * chiffre que les lectures ne donnent pas ; les liens vers le bureau de modération de diaspora.ga
 * (origine de l'environnement, chemin partagé), sans compteur, et rien sans origine configurée.
 * Personnes et décisions fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-admin", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true }
const OVERVIEW = "modules/diaspora/networkSettings:overview"
const SETTINGS = "modules/networks/features:settings"
const DESK = "modules/diaspora/moderationDesk:myDesk"
const JOURNAL = "modules/platform/audit:paginateNetworkAdminAudit"

const mocks = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  failures: new Map<string, unknown>(),
  args: new Map<string, unknown[]>(),
  membersSiteUrl: null as string | null,
}))

vi.mock("@/lib/env", () => ({
  get publicEnv() {
    return { convexUrl: "configured", membersSiteUrl: mocks.membersSiteUrl }
  },
}))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.args.set(path, [...(mocks.args.get(path) ?? []), args])
      if (mocks.failures.has(path)) throw mocks.failures.get(path)
      if (!mocks.results.has(path)) throw new Error(`lecture inattendue : ${path}`)
      return mocks.results.get(path)
    },
    useMutation: () => {
      throw new Error("aucune écriture attendue")
    },
  }
})

import { DashboardSection } from "./dashboard-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const errors = i18n.getFixedT("fr", "errors")
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const lastArgs = (path: string) => mocks.args.get(path)?.at(-1)

function entry(auditId: string, action: string, at: number) {
  return { auditId, action, capacity: "network_admin", actor: { personId: "person-admin", displayName: "Awa NDONG", handle: "awa.ndong" }, networkId: NETWORK_ID, subject: { table: "networks", id: NETWORK_ID }, details: null, at, reason: null }
}

function mount(admin: object = ADMIN) {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={admin as never}>
        <DashboardSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  mocks.args.clear()
  mocks.failures.clear()
  mocks.membersSiteUrl = null
  mocks.results = new Map<string, unknown>([
    [OVERVIEW, { modules: { open: 2, total: 8 }, founders: { active: 3, cap: 30 }, countries: { open: 1 } }],
    [
      SETTINGS,
      [
        { feature: "pages", open: true },
        { feature: "jobs", open: false },
        { feature: "mutualAid", open: true },
      ],
    ],
    [DESK, { role: "network_admin", networkWide: true, canReviewAppeals: true, canManageTeams: true, canManagePolicy: true, teams: [{ teamId: "t-1", name: "France", scope: null, isMember: false }] }],
    [
      JOURNAL,
      {
        page: [entry("a-1", "network.admin_access", Date.UTC(2026, 10, 23, 9)), entry("a-2", "network.feature_set", Date.UTC(2026, 10, 22, 9)), entry("a-3", "diaspora.founder_admit", Date.UTC(2026, 10, 21, 9))],
        isDone: true,
        continueCursor: "",
      },
    ],
  ])
})
afterEach(() => cleanup())

describe("tableau de bord — lectures réelles seulement", () => {
  it("accueille l'administrateur ; sans nom affiché, un accueil sans nom", () => {
    mount()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t("dashboard.greeting", { name: "Awa NDONG" }))
    cleanup()
    mount({ ...ADMIN, displayName: null })
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t("dashboard.greetingWithoutName"))
  })

  it("lit les compteurs tenus, les modules, les équipes et la première fenêtre du journal, pour le réseau administré", () => {
    mount()
    expect(lastArgs(OVERVIEW)).toEqual({ networkId: NETWORK_ID })
    expect(lastArgs(SETTINGS)).toEqual({ networkId: NETWORK_ID })
    expect(lastArgs(DESK)).toEqual({ networkId: NETWORK_ID, expectedPersonId: "person-admin" })
    expect(lastArgs(JOURNAL)).toEqual({ networkId: NETWORK_ID, paginationOpts: { cursor: null, numItems: JOURNAL_PAGE } })
  })

  it("chaque tuile mène à sa section, avec les seuls chiffres que le moteur rend", () => {
    mount()
    const tiles = within(screen.getByRole("region", { name: t("dashboard.overviewTitle") }))
    const modules = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.modules")) })
    expect(modules).toHaveAttribute("href", "/modules")
    expect(modules).toHaveTextContent(n(t("dashboard.outOf", { value: "2", max: "8" })))
    expect(modules).toHaveTextContent(`${members("networkFeatures.names.pages")} · ${members("networkFeatures.names.mutualAid")}`)
    const founders = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.founders")) })
    expect(founders).toHaveAttribute("href", "/fondateurs")
    expect(founders).toHaveTextContent(n(t("dashboard.outOf", { value: "3", max: "30" })))
    const countries = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.countries")) })
    expect(countries).toHaveAttribute("href", "/pays")
    expect(countries).toHaveTextContent("1")
    const teams = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.teams")) })
    expect(teams).toHaveAttribute("href", "/equipe")
    expect(teams).toHaveTextContent("1")
    // Recours et pages officielles : un lien, aucun chiffre (le moteur ne les compte pas).
    const appeals = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.appeals")) })
    expect(appeals).toHaveAttribute("href", "/recours")
    expect(appeals.textContent).not.toMatch(/\d/)
    const institutions = tiles.getByRole("link", { name: new RegExp(t("dashboard.tile.institutions")) })
    expect(institutions).toHaveAttribute("href", "/institutions")
    expect(institutions.textContent).not.toMatch(/\d/)
  })

  it("aucun chiffre que les lectures ne donnent pas : les chiffres affichés sont ceux du moteur, et le reste est dit non compté", () => {
    mount()
    const tiles = screen.getByRole("region", { name: t("dashboard.overviewTitle") })
    expect((tiles.textContent ?? "").match(/\d+/g)?.sort()).toEqual(["1", "1", "2", "3", "30", "8"])
    expect(screen.getByText(n(t("dashboard.notCounted")))).toBeInTheDocument()
  })

  it("les dernières décisions, sans les entrées dans l'administration, et le lien vers le journal", () => {
    mount()
    const decisions = within(screen.getByRole("region", { name: t("dashboard.decisionsTitle") }))
    expect(decisions.getAllByRole("listitem").map((item) => item.firstChild?.textContent)).toEqual([t("journal.action.featureSet"), t("journal.action.founderAdmit")])
    expect(decisions.queryByText(t("journal.action.adminAccess"))).toBeNull()
    expect(decisions.getByRole("link", { name: t("dashboard.decisionsLink") })).toHaveAttribute("href", "/journal")
  })

  it("journal sans décision : il le dit", () => {
    mocks.results.set(JOURNAL, { page: [entry("a-1", "network.admin_access", Date.UTC(2026, 10, 23, 9))], isDone: true, continueCursor: "" })
    mount()
    expect(screen.getByText(t("dashboard.decisionsEmpty"))).toBeInTheDocument()
  })

  it("pendant la lecture : des états de chargement, aucun chiffre", () => {
    for (const path of [OVERVIEW, SETTINGS, DESK, JOURNAL]) mocks.results.set(path, undefined)
    mount()
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole("region", { name: t("dashboard.overviewTitle") }).textContent).not.toMatch(/\d/)
  })

  it("un refus d'une lecture reste dans sa tuile, traduit, avec « Relire » ; le reste du tableau s'affiche", () => {
    mocks.failures.set(OVERVIEW, Object.assign(new Error("refus"), { data: { code: "notFound" } }))
    mount()
    expect(screen.getByRole("alert")).toHaveTextContent(errors("notFound"))
    expect(screen.getByRole("button", { name: t("section.retry") })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: new RegExp(t("dashboard.tile.teams")) })).toBeInTheDocument()
  })
})

describe("tableau de bord — le bureau de modération de diaspora.ga", () => {
  it("« File de modération » et « Pages à vérifier » mènent au bureau des membres, dans un nouvel onglet, sans compteur", () => {
    mocks.membersSiteUrl = "https://membres.exemple"
    mount()
    const desk = within(screen.getByRole("region", { name: t("dashboard.desk.title") }))
    const queue = desk.getByRole("link", { name: `${t("dashboard.desk.queue")} ${t("shell.newTab")}` })
    expect(queue).toHaveAttribute("href", "https://membres.exemple/moderation?onglet=file")
    expect(queue).toHaveAttribute("target", "_blank")
    expect(queue).toHaveAttribute("rel", "noopener noreferrer")
    expect(desk.getByRole("link", { name: `${t("dashboard.desk.pages")} ${t("shell.newTab")}` })).toHaveAttribute("href", "https://membres.exemple/moderation?onglet=pages")
    expect(screen.getByRole("region", { name: t("dashboard.desk.title") }).textContent).not.toMatch(/\d/)
  })

  it("sans adresse des membres configurée : aucun lien, une phrase le dit", () => {
    mount()
    const desk = within(screen.getByRole("region", { name: t("dashboard.desk.title") }))
    expect(desk.queryByRole("link")).toBeNull()
    expect(desk.getByText(n(t("dashboard.desk.unconfigured")))).toBeInTheDocument()
  })
})
