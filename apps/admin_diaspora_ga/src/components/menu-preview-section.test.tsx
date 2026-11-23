// @vitest-environment jsdom
import { NETWORK_FEATURE_PARENTS, NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { memberMenu, type MemberMenu } from "@diaspora-ga/features/navigation"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FunctionReference } from "convex/server"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { DEFAULT_PREVIEW_PERSON, previewSituation, type FeatureState } from "@/lib/network-features"

/**
 * CH-815 A5 — l'aperçu du menu : il part de l'état courant, montre le menu EXACT que la règle
 * partagée rend (celle que la coque de diaspora.ga monte, test commun dans diaspora.ga), suit la
 * règle d'ordre du moteur, et n'écrit jamais rien.
 */
const NETWORK_ID = "network-diaspora"
const ADMIN = { personId: "person-one", displayName: "Awa NDONG", networkId: NETWORK_ID, networkSlug: "diaspora-ga", networkName: "DIASPORA.GA", accessLogged: true } as never

const mocks = vi.hoisted(() => ({ rows: undefined as unknown, queried: [] as string[], mutations: [] as string[] }))

vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server")
  return {
    useQuery: (reference: FunctionReference<"query">) => {
      const path = name(reference)
      mocks.queried.push(path)
      if (path === "modules/networks/features:settings") return mocks.rows
      throw new Error(`lecture inattendue : ${path}`)
    },
    // L'aperçu n'écrit rien : toute écriture branchée ici est une faute.
    useMutation: (reference: FunctionReference<"mutation">) => {
      mocks.mutations.push(name(reference))
      return () => Promise.reject(new Error("aucune écriture dans l'aperçu"))
    },
    useAction: (reference: FunctionReference<"action">) => {
      mocks.mutations.push(name(reference))
      return () => Promise.reject(new Error("aucune écriture dans l'aperçu"))
    },
  }
})

import { MenuPreviewSection } from "./menu-preview-section"
import { NetworkAdminProvider } from "./network-admin-context"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
const t = i18n.getFixedT("fr", APP_NAMESPACE)
const members = i18n.getFixedT("fr", "diaspora-ga")
const moduleName = (feature: NetworkFeature) => members(`networkFeatures.names.${feature}`)

function rowsWith(open: readonly NetworkFeature[]): FeatureState[] {
  return NETWORK_FEATURES.map((feature) => {
    const parent = NETWORK_FEATURE_PARENTS[feature]
    const enabled = open.includes(feature)
    return { feature, enabled, open: enabled && (parent === null || open.includes(parent)), requires: parent, updatedAt: enabled ? 1 : null }
  })
}

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NetworkAdminProvider admin={ADMIN}>
        <MenuPreviewSection />
      </NetworkAdminProvider>
    </I18nextProvider>,
  )
}

/** Les libellés d'un panneau de l'aperçu, dans l'ordre. */
function panel(name: string) {
  const section = screen.getByRole("heading", { level: 3, name }).closest("section")
  if (!section) throw new Error(`panneau « ${name} » absent`)
  return section
}
const labels = (container: HTMLElement) => within(container).getAllByRole("listitem").map((item) => item.textContent)

/** Ce que l'aperçu doit montrer : la règle partagée, libellés des membres. */
function expectPreviewOf(menu: MemberMenu) {
  const rail = within(panel(t("preview.rail")))
  const createGroup = rail.queryByRole("group", { name: t("preview.createMenu") })
  const railItems = labels(panel(t("preview.rail"))).slice(0, menu.rail.length)
  expect(railItems).toEqual(menu.rail.map((entry) => members(entry.labelKey)))
  if (menu.create.length === 0) expect(createGroup).toBeNull()
  else expect(labels(createGroup!)).toEqual(menu.create.map((entry) => `${members(entry.labelKey)}${members(entry.hintKey)}`))
  expect(labels(panel(t("preview.phoneBar")))).toEqual(menu.phoneBar.map((entry) => members(entry.labelKey)))
  const account = panel(t("preview.account"))
  const information = within(account).getByRole("group", { name: t("preview.information") })
  expect(labels(account).slice(0, menu.account.length)).toEqual(menu.account.map((entry) => members(entry.labelKey)))
  expect(labels(information)).toEqual(menu.information.map((entry) => members(entry.labelKey)))
}

const checkbox = (feature: NetworkFeature) => screen.getByRole("checkbox", { name: moduleName(feature) })

beforeEach(() => {
  mocks.rows = rowsWith(["pages"])
  mocks.queried = []
  mocks.mutations = []
})
afterEach(() => cleanup())

describe("aperçu du menu — il part de l'état courant", () => {
  it("les modules servis aujourd'hui sont cochés, et le menu est celui de la règle partagée pour un membre en règle", () => {
    mount()
    for (const feature of NETWORK_FEATURES) expect(checkbox(feature)).toHaveAttribute("aria-checked", String(feature === "pages"))
    expect(screen.getByText(t("preview.noChange"))).toBeInTheDocument()
    expectPreviewOf(memberMenu({ ...previewSituation(DEFAULT_PREVIEW_PERSON), openFeatures: ["pages"] }))
  })

  it("pendant la lecture, un état d'attente, aucune case", () => {
    mocks.rows = undefined
    mount()
    expect(screen.getByRole("status")).toHaveTextContent(t("preview.loading"))
    expect(screen.queryByRole("checkbox")).toBeNull()
  })
})

describe("aperçu du menu — cocher pour voir, sans rien écrire", () => {
  it.each([
    [["services"], ["pages", "services"]],
    [["services", "jobs"], ["pages", "services", "jobs"]],
    [["mutualAid", "mentoring", "arrivalKit", "pilotMetrics"], ["pages", "mutualAid", "mentoring", "arrivalKit", "pilotMetrics"]],
  ] as const)("cocher %j : le menu exact des modules %j, et ce qui apparaît par rapport à aujourd'hui", async (ticks, served) => {
    const user = userEvent.setup()
    mount()
    for (const feature of ticks) await user.click(checkbox(feature))
    expectPreviewOf(memberMenu({ ...previewSituation(DEFAULT_PREVIEW_PERSON), openFeatures: served }))
    expect(screen.getByRole("heading", { level: 3, name: t("preview.added") })).toBeInTheDocument()
    expect(screen.queryByText(t("preview.noChange"))).toBeNull()
    expect(mocks.mutations).toEqual([])
  })

  it("décocher les pages fait disparaître leurs entrées, dit à part ; « revenir à l'état actuel » rétablit tout", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(checkbox("pages"))
    expectPreviewOf(memberMenu({ ...previewSituation(DEFAULT_PREVIEW_PERSON), openFeatures: [] }))
    const removed = screen.getByRole("heading", { level: 3, name: t("preview.removed") }).parentElement!
    expect(within(removed).getByText(members("nav.create.association"))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t("preview.reset") }))
    expect(checkbox("pages")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(t("preview.noChange"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("preview.reset") })).toBeNull()
  })

  it("la règle d'ordre du moteur : un module des pages exige les pages ; les pages attendent que leurs modules soient décochés", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith([])
    mount()
    for (const child of ["groupsAndEvents", "services", "jobs"] as const) {
      expect(checkbox(child)).toBeDisabled()
      expect(checkbox(child)).toHaveAccessibleDescription(t("preview.requiresParent", { module: moduleName("pages") }))
    }
    expect(checkbox("mutualAid")).toBeEnabled()
    await user.click(checkbox("pages"))
    await user.click(checkbox("services"))
    expect(checkbox("pages")).toBeDisabled()
    expect(checkbox("pages")).toHaveAccessibleDescription(t("preview.hasChildren", { modules: moduleName("services") }))
    await user.click(checkbox("services"))
    expect(checkbox("pages")).toBeEnabled()
  })

  it("le membre regardé : en attente, ni Messages ni actu ; avec une page et un rôle de modération, leurs entrées ; la mesure n'ajoute rien", async () => {
    const user = userEvent.setup()
    mocks.rows = rowsWith(["pages", "pilotMetrics"])
    mount()
    await user.click(screen.getByRole("radio", { name: t("preview.membership.pending") }))
    expectPreviewOf(memberMenu({ ...previewSituation({ ...DEFAULT_PREVIEW_PERSON, membership: "pending" }), openFeatures: ["pages", "pilotMetrics"] }))
    expect(labels(panel(t("preview.phoneBar")))).not.toContain(members("nav.messages"))

    await user.click(screen.getByRole("radio", { name: t("preview.membership.active") }))
    for (const holding of ["holdsPageRole", "holdsAssociation", "moderator"] as const) {
      await user.click(screen.getByRole("checkbox", { name: t(`preview.holding.${holding}`) }))
    }
    const person = { membership: "active", holdings: { holdsPageRole: true, holdsAssociation: true, moderator: true } } as const
    expectPreviewOf(memberMenu({ ...previewSituation(person), openFeatures: ["pages", "pilotMetrics"] }))
    for (const key of ["nav.myActivity", "nav.myAssociations", "nav.moderation"]) expect(labels(panel(t("preview.account")))).toContain(members(key))
    // CH-815 A6 : la mesure du pilote ne se lit plus sur diaspora.ga ; ouverte, elle n'ajoute aucune entrée.
    expectPreviewOf(memberMenu({ ...previewSituation(person), openFeatures: ["pages"] }))
  })

  it("n'écrit jamais : aucune fonction d'écriture n'est même branchée, la seule lecture est l'état des modules", async () => {
    const user = userEvent.setup()
    mount()
    await user.click(checkbox("services"))
    await user.click(checkbox("mutualAid"))
    await user.click(screen.getByRole("radio", { name: t("preview.membership.suspended") }))
    expect(mocks.mutations).toEqual([])
    expect(new Set(mocks.queried)).toEqual(new Set(["modules/networks/features:settings"]))
  })
})
