// @vitest-environment jsdom
import {
  DataSourceProvider,
  useSession,
  type ActionResult,
  type DeviceNotificationsCapability,
  type DeviceNotificationsView,
  type DiasporaGaActions,
  type DiasporaGaDataSource,
  type Loadable,
} from "@diaspora-ga/features/data"
import { DemoStore, createDemoDataSource } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { FirstChoicesPrompt, firstChoicesDismissKey } from "./first-choices-prompt"

/**
 * A3 de l'accueil en un écran (décision du 25/11/2026) : l'invite de première visite. Elle
 * propose l'annuaire et les notifications de l'appareil après l'entrée, chacun par son geste
 * (origine `prompt`), par les écritures existantes ; elle reste tant qu'un réglage est à son
 * défaut et qu'elle n'a pas été fermée sur l'appareil. Personnes fictives.
 */
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toasts }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

const t = getFixedT("fr")
const T0 = Date.UTC(2026, 10, 25, 12)

/** Un membre fraîchement entré (fictif), annuaire masqué et notifications coupées ; l'horloge avance d'une seconde par lecture. */
async function freshMember(firstName: string) {
  let now = T0
  const store = new DemoStore(null, () => (now += 1000), 0)
  await store.signInWithIdn({ firstName, lastName: "Ogooué", loa: 2, gaboneseNationality: true })
  const joined = await store.join({
    facet: { countryOfResidence: "FR", city: "Lyon" },
    // Un identifiant n'admet ni accent ni majuscule : « Gisèle » devient « gisele.demo ».
    handle: `${firstName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}.demo`,
    displayName: `OGOOUÉ ${firstName}`,
    consents: { social_profile: true, directory: false, notifications: false },
    directoryVisibility: "hidden",
  })
  if (!joined.ok) throw new Error(`entrée de démonstration refusée : ${joined.code}`)
  return store
}

/** La coque lit l'adhésion dans la session ; l'invite la reçoit comme la coque la lui passe. */
function SessionPrompt() {
  const session = useSession()
  if (session.status !== "ready" || session.data.status !== "signed_in" || !session.data.membership) return null
  return <FirstChoicesPrompt membership={session.data.membership} />
}

interface Overrides {
  readonly actions?: Partial<DiasporaGaActions>
  readonly source?: Partial<Pick<DiasporaGaDataSource, "deviceNotifications">>
}

function renderPrompt(store: DemoStore, overrides: Overrides = {}) {
  const source = createDemoDataSource(store)
  const view = render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={{ ...source, ...overrides.source, actions: { ...source.actions, ...overrides.actions } }}>
        <SessionPrompt />
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

/** Un appareil qui peut s'abonner et ne l'est pas encore (`off`), ou un autre état, et son geste « Activer ». */
function deviceIn(state: DeviceNotificationsView["state"], enable = vi.fn<DeviceNotificationsCapability["enable"]>().mockResolvedValue({ ok: true, value: null })) {
  const view: Loadable<DeviceNotificationsView> = { status: "ready", data: { state, subscribedHere: false } }
  const disable = vi.fn<DeviceNotificationsCapability["disable"]>().mockResolvedValue({ ok: true, value: null })
  return { capability: { useDevice: () => view, enable, disable } satisfies DeviceNotificationsCapability, enable }
}

const region = () => screen.findByRole("region", { name: t("firstChoices.title") })

describe("invite de première visite — ce qu'elle propose", () => {
  it("un membre neuf : l'annuaire, avec ce qu'il implique, et les trois rubriques des réglages", async () => {
    renderPrompt(await freshMember("Awa"))
    const prompt = within(await region())
    expect(prompt.getByText(t("consent.directory.title"))).toBeInTheDocument()
    expect(prompt.getByRole("group", { name: t("consent.directory.levelLabel") })).toBeInTheDocument()
    expect(prompt.getByRole("button", { name: t("settings.directoryLevel.country") })).toBeEnabled()
    expect(prompt.getByRole("button", { name: t("settings.directoryLevel.network") })).toBeEnabled()
    expect(prompt.getByRole("link", { name: t("firstChoices.settingsDirectory") })).toHaveAttribute("href", routes.settingsDirectory())
    expect(prompt.getByRole("link", { name: t("firstChoices.settingsConsents") })).toHaveAttribute("href", routes.settingsConsents())
    expect(prompt.getByRole("link", { name: t("firstChoices.settingsDevice") })).toHaveAttribute("href", routes.settingsDeviceNotifications())
    // La démonstration n'envoie rien : l'appareil n'est pas proposé.
    expect(prompt.queryByRole("button", { name: t("settings.deviceNotifications.enable") })).not.toBeInTheDocument()
  })

  it("les ancres des liens sont celles des sections des réglages", () => {
    expect(routes.settingsDirectory()).toBe(`${routes.settings()}#annuaire`)
    expect(routes.settingsConsents()).toBe(`${routes.settings()}#consentements`)
    expect(routes.settingsDeviceNotifications()).toBe(`${routes.settings()}#notifications-appareil`)
  })

  it("un appareil prêt (`off`) : « Activer sur cet appareil », dit avec ce que vaut le geste", async () => {
    const { capability } = deviceIn("off")
    renderPrompt(await freshMember("Bella"), { source: { deviceNotifications: capability } })
    const prompt = within(await region())
    expect(prompt.getByText(t("settings.deviceNotifications.consent").replace(/\s+/g, " "))).toBeInTheDocument()
    expect(prompt.getByRole("button", { name: t("settings.deviceNotifications.enable") })).toBeEnabled()
  })

  it("rien à son défaut (annuaire ouvert, appareil indisponible), ou adhésion suspendue : aucune invite", async () => {
    const store = await freshMember("Carine")
    await store.setConsent("directory", true)
    expect(await store.setDirectoryVisibility("country")).toEqual({ ok: true, value: null })
    renderPrompt(store)
    expect(screen.queryByRole("region", { name: t("firstChoices.title") })).not.toBeInTheDocument()
    cleanup()

    const { capability } = deviceIn("on")
    renderPrompt(store, { source: { deviceNotifications: capability } })
    expect(screen.queryByRole("region", { name: t("firstChoices.title") })).not.toBeInTheDocument()
  })
})

describe("invite de première visite — chaque choix, son geste", () => {
  it("l'annuaire : l'accord « Annuaire » d'origine `prompt`, puis le niveau ; la ligne quitte l'invite", async () => {
    const store = await freshMember("Diane")
    const { user } = renderPrompt(store)
    await user.click(within(await region()).getByRole("button", { name: t("settings.directoryLevel.network") }))

    await vi.waitFor(() => expect(toasts.success).toHaveBeenCalledWith(t("firstChoices.directorySaved")))
    const me = store.getState().session.personId ?? ""
    expect(store.getState().consents.filter((record) => record.personId === me).at(-1)).toMatchObject({ purpose: "directory", granted: true, origin: "prompt" })
    expect(store.getState().memberships[me]?.directoryVisibility).toBe("network")
    // Plus rien à son défaut ici (la démonstration n'envoie pas de notification) : l'invite se retire.
    await vi.waitFor(() => expect(screen.queryByRole("region", { name: t("firstChoices.title") })).not.toBeInTheDocument())
  })

  it("l'appareil : le geste des réglages, avec l'origine `prompt`", async () => {
    const { capability, enable } = deviceIn("off")
    const store = await freshMember("Edith")
    const { user } = renderPrompt(store, { source: { deviceNotifications: capability } })
    await user.click(within(await region()).getByRole("button", { name: t("settings.deviceNotifications.enable") }))
    await vi.waitFor(() => expect(enable).toHaveBeenCalledExactlyOnceWith(store.getState().session.personId, { origin: "prompt" }))
    expect(toasts.success).toHaveBeenCalledWith(t("settings.deviceNotifications.enabled"))
  })

  it("un refus se dit sans détail, rien d'autre n'est écrit, et la ligne reste pour réessayer", async () => {
    const setConsent = vi.fn<DiasporaGaActions["setConsent"]>().mockResolvedValue({ ok: false, code: "rate_limited" } satisfies ActionResult)
    const setDirectoryVisibility = vi.fn<DiasporaGaActions["setDirectoryVisibility"]>()
    const { user } = renderPrompt(await freshMember("Fanny"), { actions: { setConsent, setDirectoryVisibility } })
    const button = within(await region()).getByRole("button", { name: t("settings.directoryLevel.country") })
    await user.click(button)

    await vi.waitFor(() => expect(toasts.error).toHaveBeenCalledWith(t("errors.rate_limited")))
    expect(setConsent).toHaveBeenCalledExactlyOnceWith("directory", true, "prompt")
    expect(setDirectoryVisibility).not.toHaveBeenCalled()
    expect(button).toBeEnabled()
  })
})

describe("invite de première visite — fermée sur l'appareil", () => {
  it("la croix la ferme pour de bon sur cet appareil, sous la clé préfixée du réseau, pour cette personne", async () => {
    const store = await freshMember("Gisèle")
    const me = store.getState().session.personId ?? ""
    const { user, unmount } = renderPrompt(store)
    await user.click(within(await region()).getByRole("button", { name: t("firstChoices.dismiss") }))

    expect(screen.queryByRole("region", { name: t("firstChoices.title") })).not.toBeInTheDocument()
    expect(firstChoicesDismissKey(me)).toBe(`antsia:diaspora-ga:premiers-choix:${me}`)
    expect(window.localStorage.getItem(firstChoicesDismissKey(me))).toBe("1")
    // Rien n'a été écrit au moteur : l'annuaire reste masqué.
    expect(store.getState().memberships[me]?.directoryVisibility).toBe("hidden")

    unmount()
    renderPrompt(store)
    expect(screen.queryByRole("region", { name: t("firstChoices.title") })).not.toBeInTheDocument()
  })
})
