// @vitest-environment jsdom
import { DataSourceProvider, NETWORK_FEATURES, type DiasporaGaDataSource, type NetworkFeaturesCapability, type NetworkFeatureState } from "@diaspora-ga/features/data"
import { createDemoDataSource, createDemoSeed, DEMO_STORAGE_KEY, DemoStore, type DemoState } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { featureToggleBlock, NetworkFeaturesSettings } from "./network-features-settings"

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

/**
 * « Fonctionnalités du réseau » (ADR-0041 du moteur) : les huit modules, fermés au départ ;
 * l'ouverture motivée, la dépendance dite avant le geste, l'accès réservé à l'administration.
 */
const t = getFixedT("fr")
const NOW = Date.UTC(2026, 10, 20, 12)
const REASON = "Ouverture pour le lancement du pilote."
const text = (key: string, options?: Record<string, unknown>) => String(t(key, options)).replace(/\s+/g, " ")

function demoSource(): DiasporaGaDataSource {
  const state: DemoState = { ...createDemoSeed(NOW), session: { personId: "p-prisca" } }
  const stored = new Map([[DEMO_STORAGE_KEY, JSON.stringify(state)]])
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: (key: string) => { stored.delete(key) },
  }
  return createDemoDataSource(new DemoStore(storage, () => NOW, 0))
}

function mount(source: DiasporaGaDataSource) {
  return render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={source}>
        <NetworkFeaturesSettings />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const section = () => within(screen.getByRole("region", { name: t("networkFeatures.settings.title") }))
const card = (feature: string) => within(section().getByRole("heading", { name: t(`networkFeatures.names.${feature}`) }).closest("li")!)

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("fonctionnalités du réseau — réglages de l'administration", () => {
  it("montre les huit modules, tous fermés au départ ; ouvrir un module des pages attend les pages", () => {
    mount(demoSource())
    expect(section().getAllByRole("listitem")).toHaveLength(NETWORK_FEATURES.length)
    expect(section().getAllByText(t("networkFeatures.settings.closed"))).toHaveLength(NETWORK_FEATURES.length)
    expect(card("pages").getByRole("button", { name: t("networkFeatures.settings.openAction") })).toBeEnabled()
    expect(card("services").getByRole("button", { name: t("networkFeatures.settings.openAction") })).toBeDisabled()
    expect(card("services").getByText(text("errors.network_feature_requires_parent"))).toBeTruthy()
    expect(card("mutualAid").getByRole("button", { name: t("networkFeatures.settings.openAction") })).toBeEnabled()
  })

  it("ouvrir exige un motif, puis ouvre le module ; les modules des pages deviennent ouvrables", async () => {
    const user = userEvent.setup()
    mount(demoSource())
    await user.click(card("pages").getByRole("button", { name: t("networkFeatures.settings.openAction") }))
    const dialog = within(await screen.findByRole("dialog"))
    await user.click(dialog.getByRole("button", { name: t("networkFeatures.settings.sheet.confirmOpen") }))
    expect(await dialog.findByText(text("errors.moderation_desk_reason_length", { min: 10, max: 500 }))).toBeTruthy()
    await user.type(dialog.getByRole("textbox"), REASON)
    await user.click(dialog.getByRole("button", { name: t("networkFeatures.settings.sheet.confirmOpen") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("networkFeatures.settings.sheet.opened", { feature: t("networkFeatures.names.pages") })))
    await waitFor(() => expect(card("pages").getByText(t("networkFeatures.settings.open"))).toBeTruthy())
    expect(card("services").getByRole("button", { name: t("networkFeatures.settings.openAction") })).toBeEnabled()
    expect(card("pages").getByRole("button", { name: t("networkFeatures.settings.closeAction") })).toBeEnabled()
  })

  it("hors de l'administration, la section le dit sans rien montrer d'autre", () => {
    const capability: NetworkFeaturesCapability = {
      useOpen: () => ({ status: "ready", data: [] }),
      useSettings: () => ({ status: "error", code: "not_found" }),
      setFeature: vi.fn(),
    }
    mount({ ...demoSource(), networkFeatures: capability })
    expect(section().getByText(t("networkFeatures.settings.restricted"))).toBeTruthy()
    expect(section().queryAllByRole("listitem")).toHaveLength(0)
  })

  it("la dépendance se dit avant le geste : ouvrir sans les pages, fermer les pages avec un module ouvert", () => {
    const row = (feature: NetworkFeatureState["feature"], enabled: boolean): NetworkFeatureState => ({ feature, enabled, open: enabled, requires: feature === "jobs" ? "pages" : null, updatedAt: null })
    expect(featureToggleBlock(row("jobs", false), [])).toBe("network_feature_requires_parent")
    expect(featureToggleBlock(row("jobs", false), ["pages"])).toBeNull()
    expect(featureToggleBlock(row("pages", true), ["pages", "jobs"])).toBe("network_feature_has_open_children")
    expect(featureToggleBlock(row("pages", true), ["pages"])).toBeNull()
    expect(featureToggleBlock(row("mentoring", false), [])).toBeNull()
  })
})
