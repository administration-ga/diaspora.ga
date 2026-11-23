// @vitest-environment jsdom
import {
  DataSourceProvider,
  type ActionResult,
  type DeviceNotificationsCapability,
  type DeviceNotificationsView,
  type DiasporaGaDataSource,
  type Loadable,
  type MembershipView,
} from "@diaspora-ga/features/data"
import { createDemoDataSource, DemoStore } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DeviceNotificationsSettings } from "./device-notifications-settings"

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))

const t = getFixedT("fr")
const en = getFixedT("en")
/** Le texte tel que Testing Library le lit dans le DOM (espaces insécables normalisées). */
const text = (key: string, translate = t) => String(translate(key)).replace(/\s+/g, " ")

const membership = { personId: "person_awa", handle: "awa.demo", displayName: "Awa OGOOUÉ" } as MembershipView

function fakeCapability(view: DeviceNotificationsView, overrides: Partial<DeviceNotificationsCapability> = {}) {
  const state: { current: Loadable<DeviceNotificationsView> } = { current: { status: "ready", data: view } }
  const capability = {
    useDevice: vi.fn<DeviceNotificationsCapability["useDevice"]>(() => state.current),
    enable: vi.fn<DeviceNotificationsCapability["enable"]>().mockResolvedValue({ ok: true, value: null } as ActionResult),
    disable: vi.fn<DeviceNotificationsCapability["disable"]>().mockResolvedValue({ ok: true, value: null } as ActionResult),
    ...overrides,
  } satisfies DeviceNotificationsCapability
  return { capability, state }
}

function mount(source: DiasporaGaDataSource, locale: "fr" | "en" = "fr") {
  return render(
    <I18nProvider locale={locale}>
      <DataSourceProvider source={source}>
        <DeviceNotificationsSettings membership={membership} />
      </DataSourceProvider>
    </I18nProvider>,
  )
}

const engine = (capability: DeviceNotificationsCapability | undefined) => ({ kind: "engine", deviceNotifications: capability }) as unknown as DiasporaGaDataSource
const region = () => within(screen.getByRole("region", { name: t("settings.deviceNotifications.title") }))

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("« Notifications de cet appareil » — ce que la rubrique dit (DS-14, volet push)", () => {
  it("prêt : dit que l'appareil ne reçoit rien, explique l'accord, propose d'activer ; rien n'est demandé au montage", () => {
    const { capability } = fakeCapability({ state: "off", subscribedHere: false })
    mount(engine(capability))
    expect(region().getByRole("status")).toHaveTextContent(text("settings.deviceNotifications.state.off"))
    expect(region().getByText(text("settings.deviceNotifications.consent"))).toBeInTheDocument()
    expect(region().getByRole("button", { name: t("settings.deviceNotifications.enable") })).toBeEnabled()
    expect(region().queryByRole("button", { name: t("settings.deviceNotifications.disable") })).toBeNull()
    expect(capability.enable).not.toHaveBeenCalled()
  })

  it("chaque état sans geste possible se dit, sans bouton : navigateur incapable, serveur non configuré, autorisation bloquée", () => {
    for (const state of ["unsupported", "unavailable", "denied"] as const) {
      const { capability } = fakeCapability({ state, subscribedHere: false })
      mount(engine(capability))
      expect(region().getByRole("status"), state).toHaveTextContent(text(`settings.deviceNotifications.state.${state}`))
      expect(region().queryByRole("button"), state).toBeNull()
      cleanup()
    }
    // Sur iPhone, ne rien promettre de plus que l'installation sur l'écran d'accueil.
    expect(t("settings.deviceNotifications.state.unsupported")).toMatch(/iPhone/)
  })

  it("abonné : dit que l'appareil reçoit, propose seulement de désactiver", () => {
    const { capability } = fakeCapability({ state: "on", subscribedHere: true })
    mount(engine(capability))
    expect(region().getByRole("status")).toHaveTextContent(text("settings.deviceNotifications.state.on"))
    expect(region().queryByRole("button", { name: t("settings.deviceNotifications.enable") })).toBeNull()
    expect(region().getByRole("button", { name: t("settings.deviceNotifications.disable") })).toBeEnabled()
  })

  it("en anglais, les mêmes phrases existent", () => {
    const { capability } = fakeCapability({ state: "off", subscribedHere: false })
    mount(engine(capability), "en")
    expect(screen.getByRole("heading", { name: en("settings.deviceNotifications.title") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: en("settings.deviceNotifications.enable") })).toBeInTheDocument()
  })

  it("sans la capacité, la rubrique ne se montre pas", () => {
    mount(engine(undefined))
    expect(screen.queryByRole("region")).toBeNull()
  })
})

describe("« Notifications de cet appareil » — les gestes", () => {
  it("« Activer » appelle la capacité pour la personne affichée, une seule fois, et le confirme", async () => {
    const user = userEvent.setup()
    let release: (value: ActionResult) => void = () => undefined
    const { capability } = fakeCapability({ state: "off", subscribedHere: false }, { enable: vi.fn(() => new Promise<ActionResult>((resolve) => { release = resolve })) })
    mount(engine(capability))
    const button = region().getByRole("button", { name: t("settings.deviceNotifications.enable") })
    await user.click(button)
    await user.click(button)
    expect(capability.enable).toHaveBeenCalledTimes(1)
    expect(capability.enable).toHaveBeenCalledWith("person_awa")
    release({ ok: true, value: null })
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("settings.deviceNotifications.enabled")))
  })

  it("un refus se dit par son code (`errors.<code>`), jamais un succès", async () => {
    const user = userEvent.setup()
    const { capability } = fakeCapability({ state: "off", subscribedHere: false }, { enable: vi.fn(async () => ({ ok: false, code: "push_denied" }) as ActionResult) })
    mount(engine(capability))
    await user.click(region().getByRole("button", { name: t("settings.deviceNotifications.enable") }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(t("errors.push_denied")))
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("« Désactiver » retire cet appareil et le confirme", async () => {
    const user = userEvent.setup()
    const { capability } = fakeCapability({ state: "on", subscribedHere: true })
    mount(engine(capability))
    await user.click(region().getByRole("button", { name: t("settings.deviceNotifications.disable") }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(t("settings.deviceNotifications.disabled")))
    expect(capability.disable).toHaveBeenCalledWith("person_awa")
  })
})

describe("« Notifications de cet appareil » — en démonstration", () => {
  it("le dit, et l'appareil y est indisponible : aucun bouton, aucun faux succès", () => {
    mount(createDemoDataSource(new DemoStore(null)))
    expect(region().getByText(text("settings.deviceNotifications.demoNotice"))).toBeInTheDocument()
    expect(region().getByRole("status")).toHaveTextContent(text("settings.deviceNotifications.state.unavailable"))
    expect(region().queryByRole("button")).toBeNull()
  })
})
