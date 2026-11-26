// @vitest-environment jsdom
import { NETWORK_FEATURE_PARENTS, NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { featureMenuAdditions } from "@diaspora-ga/features/navigation"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import type { FeatureState, LastDecision } from "@/lib/network-features"

/**
 * CH-815 A5 — la section « Modules » : une carte par module rendu par le moteur, son état, ce
 * qu'il ajoute au menu (la règle partagée), sa dernière décision, ses prérequis à relire ; la
 * bascule motivée, dépendances dites avant le geste, l'appel au moteur avec ses arguments exacts.
 * Personnes fictives.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-one", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never
const DECIDED_AT = Date.UTC(2026, 10, 20, 14, 3)

const mocks = vi.hoisted(() => ({
  rows: undefined as unknown,
  decisions: undefined as unknown,
  decisionsFailure: null as unknown,
  args: new Map<string, unknown>(),
  setFeature: vi.fn(),
  mutations: [] as string[],
  success: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }))
vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">, args: unknown) => {
      const path = name(reference)
      mocks.args.set(path, args)
      if (path === "modules/networks/features:settings") return mocks.rows
      if (path === "modules/networks/features:lastDecisions") {
        if (mocks.decisionsFailure) throw mocks.decisionsFailure
        return mocks.decisions
      }
      throw new Error(`lecture inattendue : ${path}`)
    },
    useMutation: (reference: FunctionReference<"mutation">) => {
      mocks.mutations.push(name(reference))
      return mocks.setFeature
    },
  }
})

import { ModulesSection } from "./modules-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
/** Le texte tel que Testing Library le compare : espaces insécables de la typographie française ramenées à l'espace. */
const n = (text: string) => text.replace(/\s+/gu, " ")
const members = i18n.getFixedT("fr", "diaspora-ga")
const moduleName = (feature: NetworkFeature) => members(`networkFeatures.names.${feature}`)

/** Les huit lignes du moteur : `open` (décisions), les autres fermées, aucune décision sauf mention. */
function rowsWith(open: readonly NetworkFeature[], decided: Partial<Record<NetworkFeature, number>> = {}): FeatureState[] {
  return NETWORK_FEATURES.map((feature) => {
    const parent = NETWORK_FEATURE_PARENTS[feature]
    const enabled = open.includes(feature)
    return { feature, enabled, open: enabled && (parent === null || open.includes(parent)), requires: parent, updatedAt: decided[feature] ?? null }
  })
}

/** Une ligne de `features.lastDecisions` : un module décidé (un module jamais décidé n'y figure pas). */
function lastDecision(overrides: Partial<LastDecision> & Pick<LastDecision, "feature" | "reason">): LastDecision {
  return {
    enabled: true,
    at: DECIDED_AT,
    capacity: "network_admin",
    actor: { personId: "person-one", displayName: "Awa NDONG", handle: "awa" },
    ...overrides,
  } as LastDecision
}

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <ModulesSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

const card = (feature: NetworkFeature) => within(screen.getByRole("article", { name: moduleName(feature) }))
const toggleButton = (feature: NetworkFeature, action: "open" | "close") => card(feature).getByRole("button", { name: new RegExp(t(`modules.card.${action}`)) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows = rowsWith([])
  mocks.decisions = []
  mocks.decisionsFailure = null
  mocks.args.clear()
  mocks.mutations = []
  mocks.setFeature.mockResolvedValue({ changed: true })
})
afterEach(() => cleanup())

describe("section Modules — les cartes", () => {
  it("lit l'état des modules et leurs dernières décisions pour le réseau administré, en une requête, sans rien écrire", () => {
    mount()
    expect(mocks.args.get("modules/networks/features:settings")).toEqual({ networkId: NETWORK_ID })
    expect(mocks.args.get("modules/networks/features:lastDecisions")).toEqual({ networkId: NETWORK_ID })
    expect(mocks.setFeature).not.toHaveBeenCalled()
  })

  it("pendant la lecture, un état d'attente, aucune carte", () => {
    mocks.rows = undefined
    mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("modules.loading"))
    expect(screen.queryByRole("article")).toBeNull()
  })

  it("une carte par module, dans l'ordre du moteur, chacune avec sa description", () => {
    mount()
    const list = screen.getByRole("heading", { level: 2, name: t("modules.listTitle") }).closest("section")
    if (!list) throw new Error("liste des modules absente")
    expect(within(list).getAllByRole("article").map((article) => within(article).getByRole("heading", { level: 3 }).textContent)).toEqual(NETWORK_FEATURES.map(moduleName))
    for (const feature of NETWORK_FEATURES) {
      const texts = card(feature).getAllByRole("paragraph").map((paragraph) => paragraph.textContent)
      expect(texts).toContain(members(`networkFeatures.descriptions.${feature}`))
    }
  })

  it("états : ouvert, fermé, ou fermé parce que son module exigé est fermé", () => {
    mount()
    expect(card("pages").getByText(t("modules.state.closed"))).toBeInTheDocument()
    expect(card("mutualAid").getByText(t("modules.state.closed"))).toBeInTheDocument()
    for (const child of ["groupsAndEvents", "services", "jobs"] as const) {
      expect(card(child).getByText(t("modules.state.blocked"))).toBeInTheDocument()
      expect(card(child).getByText(t("modules.card.requires", { module: moduleName("pages") }))).toBeInTheDocument()
    }
    cleanup()
    mocks.rows = rowsWith(["pages", "services"])
    mount()
    expect(card("pages").getByText(t("modules.state.open"))).toBeInTheDocument()
    expect(card("services").getByText(t("modules.state.open"))).toBeInTheDocument()
    expect(card("jobs").getByText(t("modules.state.closed"))).toBeInTheDocument()
  })

  it.each(NETWORK_FEATURES)("%s : ce qu'il ajoute au menu des membres vient de la règle partagée, à sa place et pour son public", (feature) => {
    mount()
    const adds = card(feature).getByRole("heading", { name: t("modules.card.adds") }).parentElement
    if (!adds) throw new Error("bloc « ce qu'il ajoute » absent")
    // CH-815 A6 : la mesure du pilote n'ajoute rien au menu des membres, et la carte le dit.
    if (featureMenuAdditions(feature).length === 0) {
      expect(within(adds).queryAllByRole("listitem")).toEqual([])
      expect(within(adds).getByText(t("modules.card.addsNothing"))).toBeInTheDocument()
      return
    }
    const items = within(adds).getAllByRole("listitem").map((item) => item.textContent)
    expect(items).toEqual(
      featureMenuAdditions(feature).map(
        (change) =>
          `${members(change.labelKey)} · ${t(`menuChange.placement.${change.placement}`)}${change.audience === "everyone" ? "" : ` · ${t(`menuChange.audience.${change.audience}`)}`}`,
      ),
    )
  })

  it("dernière décision : la date, l'auteur et le motif d'un module décidé ; la date seule s'il n'y figure pas ; « aucune décision » sans ligne", () => {
    mocks.rows = rowsWith(["pages", "mutualAid"], { pages: DECIDED_AT, mutualAid: DECIDED_AT + 60_000 })
    // Un module absent de la lecture (mutualAid : posé hors bascule) ne porte rien de plus que sa date.
    mocks.decisions = [lastDecision({ feature: "pages", reason: "Ouverture des pages pour le pilote de Lyon." })]
    mount()
    const date = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" }).format(new Date(DECIDED_AT))
    expect(card("pages").getByText(t("modules.card.lastDecisionBy", { date, name: "Awa NDONG" }))).toBeInTheDocument()
    expect(card("pages").getByText(t("modules.card.reason", { reason: "Ouverture des pages pour le pilote de Lyon." }))).toBeInTheDocument()
    const later = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" }).format(new Date(DECIDED_AT + 60_000))
    expect(card("mutualAid").getByText(t("modules.card.lastDecision", { date: later }))).toBeInTheDocument()
    expect(card("mutualAid").queryByText(/Motif :/)).toBeNull()
    expect(card("mentoring").getByText(t("modules.card.neverDecided"))).toBeInTheDocument()
  })

  it("l'auteur sans nom publié se dit par son identifiant ; sans acteur, la date seule", () => {
    mocks.rows = rowsWith(["pages", "jobs"], { pages: DECIDED_AT, jobs: DECIDED_AT })
    mocks.decisions = [
      lastDecision({ feature: "pages", reason: "Ouverture des pages pour le pilote.", actor: { personId: "person-one", displayName: null, handle: "awa" } } as Partial<LastDecision> & Pick<LastDecision, "feature" | "reason">),
      lastDecision({ feature: "jobs", reason: "Ouverture de l'emploi pour le pilote.", actor: null }),
    ]
    mount()
    const date = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" }).format(new Date(DECIDED_AT))
    expect(card("pages").getByText(t("modules.card.lastDecisionBy", { date, name: "awa" }))).toBeInTheDocument()
    expect(card("jobs").getByText(t("modules.card.lastDecision", { date }))).toBeInTheDocument()
    expect(card("jobs").getByText(t("modules.card.reason", { reason: "Ouverture de l'emploi pour le pilote." }))).toBeInTheDocument()
  })

  it("une décision prise depuis la console de la plateforme le dit", () => {
    mocks.rows = rowsWith(["mentoring"], { mentoring: DECIDED_AT })
    mocks.decisions = [lastDecision({ feature: "mentoring", reason: "Bascule de secours du mentorat.", capacity: "platform_admin" })]
    mount()
    expect(card("mentoring").getByText(t("modules.card.viaConsole"))).toBeInTheDocument()
  })

  it("la lecture des décisions en attente n'affirme aucun motif ; en refus, elle ne retire rien aux cartes : la date seule", () => {
    mocks.rows = rowsWith(["pages"], { pages: DECIDED_AT })
    mocks.decisions = undefined
    mount()
    expect(card("pages").queryByText(/Motif :/)).toBeNull()
    cleanup()
    mocks.decisionsFailure = Object.assign(new Error("refus"), { data: { code: "notFound" } })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mount()
    expect(card("pages").getByText(t("modules.state.open"))).toBeInTheDocument()
    expect(card("pages").getByText(/Dernière décision/)).toBeInTheDocument()
    expect(card("pages").queryByText(/Motif :/)).toBeNull()
  })

  it("les prérequis à relire avant d'ouvrir : une liste à lire, sans case ni coche gardée ; absente d'un module ouvert", () => {
    mocks.rows = rowsWith(["pages"])
    mount()
    const prerequisites = card("services").getByText(t("modules.card.prerequisites")).closest("details")
    if (!prerequisites) throw new Error("prérequis absents")
    expect(within(prerequisites).getAllByRole("listitem", { hidden: true }).map((item) => item.textContent)).toEqual([
      t("modules.prerequisite.parentOpen", { module: moduleName("pages") }),
      t("modules.prerequisite.team"),
      t("modules.prerequisite.texts"),
      t("modules.prerequisite.rehearsal"),
    ])
    expect(within(prerequisites).queryByRole("checkbox", { hidden: true })).toBeNull()
    expect(card("pages").queryByText(t("modules.card.prerequisites"))).toBeNull()
  })

  it("appels, direct, iCom Pro et passerelle consulat.ga : en lecture seule, sans aucun geste ; le direct et la passerelle « ouverts par le code » (26/11/2026), les deux autres « fermé par le code »", () => {
    mount()
    const section = within(screen.getByRole("heading", { level: 2, name: t("modules.code.title") }).closest("section")!)
    const expected = { calls: "modules.code.closedByCode", live: "modules.code.openByCode", icomPro: "modules.code.closedByCode", consulateGateway: "modules.code.openByCode" } as const
    for (const key of ["calls", "live", "icomPro", "consulateGateway"] as const) {
      const item = within(section.getByRole("heading", { level: 3, name: t(`modules.code.names.${key}`) }).closest("li")!)
      expect(item.getByText(t(expected[key]))).toBeInTheDocument()
      expect(item.getByText(n(t(`modules.code.descriptions.${key}`)))).toBeInTheDocument()
    }
    expect(section.queryByRole("button")).toBeNull()
  })
})

describe("section Modules — les dépendances, dites avant le geste", () => {
  it("ouvrir un module qui vit sur les pages, pages fermées : expliqué et désactivé", () => {
    mount()
    for (const child of ["groupsAndEvents", "services", "jobs"] as const) {
      const button = toggleButton(child, "open")
      expect(button).toBeDisabled()
      expect(card(child).getByText(t("modules.card.blockedByParent", { module: moduleName("pages") }))).toBeInTheDocument()
    }
    expect(toggleButton("pages", "open")).toBeEnabled()
    expect(toggleButton("mutualAid", "open")).toBeEnabled()
  })

  it("fermer les pages, un de leurs modules ouvert : expliqué et désactivé ; le module, lui, se ferme", () => {
    mocks.rows = rowsWith(["pages", "services", "jobs"])
    mount()
    expect(toggleButton("pages", "close")).toBeDisabled()
    expect(card("pages").getByText(t("modules.card.blockedByChildren", { modules: [moduleName("services"), moduleName("jobs")].join(", ") }))).toBeInTheDocument()
    expect(toggleButton("services", "close")).toBeEnabled()
  })
})

describe("section Modules — la bascule motivée", () => {
  it("ouvrir : l'effet sur le menu, le motif exigé (dix caractères), puis l'appel exact, l'avis et la fenêtre refermée", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith(["pages"])
    mount()
    await user.click(toggleButton("services", "open"))
    const dialog = within(await screen.findByRole("dialog", { name: t("modules.dialog.openTitle", { module: moduleName("services") }) }))
    // Ce qui paraît, dans l'état actuel : Services dans la barre, Mes demandes dans le menu du compte.
    expect(dialog.getByText(t("modules.dialog.effectAdded"))).toBeInTheDocument()
    expect(dialog.getByText(members("nav.services"))).toBeInTheDocument()
    expect(dialog.getByText(members("nav.myRequests"))).toBeInTheDocument()
    expect(dialog.getByText(t("modules.dialog.requires", { module: moduleName("pages") }))).toBeInTheDocument()

    const reason = dialog.getByRole("textbox", { name: t("modules.dialog.reason") })
    await user.type(reason, "Trop court")
    await user.clear(reason)
    await user.type(reason, "  court  ")
    await user.click(dialog.getByRole("button", { name: t("modules.dialog.confirmOpen") }))
    expect(await dialog.findByText(t("modules.dialog.reasonLength", { min: 10, max: 500 }))).toBeInTheDocument()
    expect(mocks.setFeature).not.toHaveBeenCalled()

    await user.clear(reason)
    await user.type(reason, "  Ouverture des services pour le pilote.  ")
    await user.click(dialog.getByRole("button", { name: t("modules.dialog.confirmOpen") }))
    await waitFor(() => expect(mocks.setFeature).toHaveBeenCalledOnce())
    expect(mocks.setFeature).toHaveBeenCalledWith({ networkId: NETWORK_ID, feature: "services", enabled: true, reason: "Ouverture des services pour le pilote." })
    expect(mocks.mutations).toContain("modules/networks/features:setFeature")
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("modules.dialog.opened", { module: moduleName("services") })))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("fermer : l'effet sur le menu dit ce qui disparaît, puis l'appel avec `enabled: false`", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith(["pages", "jobs"])
    mount()
    await user.click(toggleButton("jobs", "close"))
    const dialog = within(await screen.findByRole("dialog", { name: t("modules.dialog.closeTitle", { module: moduleName("jobs") }) }))
    expect(dialog.getByText(t("modules.dialog.effectRemoved"))).toBeInTheDocument()
    expect(dialog.getByText(members("nav.communities"))).toBeInTheDocument()
    expect(dialog.getByText(members("nav.myApplications"))).toBeInTheDocument()
    await user.type(dialog.getByRole("textbox", { name: t("modules.dialog.reason") }), "Fermeture de l'emploi après le pilote.")
    await user.click(dialog.getByRole("button", { name: t("modules.dialog.confirmClose") }))
    await waitFor(() => expect(mocks.setFeature).toHaveBeenCalledWith({ networkId: NETWORK_ID, feature: "jobs", enabled: false, reason: "Fermeture de l'emploi après le pilote." }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("modules.dialog.closed", { module: moduleName("jobs") })))
  })

  it("un autre module de Communautés déjà ouvert : la fenêtre dit que la barre ne change pas pour lui", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith(["mutualAid"])
    mount()
    await user.click(toggleButton("arrivalKit", "open"))
    const dialog = within(await screen.findByRole("dialog"))
    expect(dialog.getByText(t("modules.dialog.effectNone"))).toBeInTheDocument()
  })

  it("un refus du moteur se dit par la traduction partagée ; la fenêtre reste ouverte, rien n'est annoncé comme fait", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith(["pages"])
    mocks.setFeature.mockRejectedValue(Object.assign(new Error("refus"), { data: { code: "invalidArgument", rule: "NETWORK_FEATURE_REQUIRES_PARENT" } }))
    mount()
    await user.click(toggleButton("services", "open"))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByRole("textbox", { name: t("modules.dialog.reason") }), "Ouverture des services pour le pilote.")
    await user.click(dialog.getByRole("button", { name: t("modules.dialog.confirmOpen") }))
    expect(await dialog.findByRole("alert")).toHaveTextContent(i18n.getFixedT("fr", "rules")("NETWORK_FEATURE_REQUIRES_PARENT"))
    expect(mocks.success).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("rien à décider : le moteur répond « inchangé », l'avis le dit", async () => {
    const user = userEvent.setup()
    mocks.setFeature.mockResolvedValue({ changed: false })
    mount()
    await user.click(toggleButton("mutualAid", "open"))
    const dialog = within(await screen.findByRole("dialog"))
    await user.type(dialog.getByRole("textbox", { name: t("modules.dialog.reason") }), "Ouverture de l'entraide pour le pilote.")
    await user.click(dialog.getByRole("button", { name: t("modules.dialog.confirmOpen") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("modules.dialog.unchanged", { module: moduleName("mutualAid") })))
  })
})

describe("section Modules — noms accessibles des gestes de ligne", () => {
  it("chaque bouton d'ouverture ou de fermeture porte, dans son nom accessible, le module qu'il vise ; le texte visible reste le même", () => {
    // Un module ouvert (le premier, sans parent), les autres fermés : les deux gestes sont présents.
    const first = NETWORK_FEATURES.find((feature) => NETWORK_FEATURE_PARENTS[feature] === null)
    if (first === undefined) throw new Error("aucun module racine")
    mocks.rows = rowsWith([first])
    mount()
    const names = screen.getAllByRole("button", { name: /^(Ouvrir|Fermer) le module / }).map((button) => button.getAttribute("aria-label"))
    // Un nom par carte, tous distincts : deux boutons ne portent jamais le même nom.
    expect(names).toHaveLength(NETWORK_FEATURES.length)
    expect(new Set(names).size).toBe(NETWORK_FEATURES.length)
    for (const feature of NETWORK_FEATURES) {
      const key = feature === first ? "close" : "open"
      const button = card(feature).getByRole("button", { name: t(`modules.card.${key}For`, { module: moduleName(feature) }) })
      expect(button).toHaveTextContent(t(`modules.card.${key}`))
    }
  })
})
