// @vitest-environment jsdom
import { DEFAULT_FACET_VISIBILITY } from "@diaspora-ga/domain"
import type { ActionResult, ConsentView, MembershipView } from "@diaspora-ga/features/data"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { routes } from "@/lib/routes"

import { SettingsScreen } from "./settings-screen"

const mocks = vi.hoisted(() => ({
  membership: null as MembershipView | null,
  consents: [] as readonly ConsentView[],
  leave: vi.fn<() => Promise<ActionResult>>(),
  consent: vi.fn(),
  push: vi.fn(),
  publication: vi.fn(),
  dataRights: vi.fn(),
  callSettings: vi.fn(),
  deviceNotifications: vi.fn(),
  replace: vi.fn(),
  session: { status: "loading" } as unknown,
  success: vi.fn(),
  error: vi.fn(),
  /** La nature demandée à la coque (« une page = une vue »). */
  shellLayout: vi.fn(),
  /** La page flottante « Informations » de la coque. */
  openInformation: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@diaspora-ga/features/data", async (original) => ({
  ...(await original<typeof import("@diaspora-ga/features/data")>()),
  useActions: () => ({ leaveDiasporaGa: mocks.leave, setConsent: mocks.consent }),
  useMyConsents: () => ({ status: "ready", data: mocks.consents }),
  useOpenCountries: () => ({ status: "ready", data: [] }),
  useSession: () => mocks.session,
}))
vi.mock("@/components/gate", () => ({
  Gate: (props: { children: (session: { membership: MembershipView | null }) => ReactNode }) => props.children({ membership: mocks.membership }),
}))
vi.mock("@/components/app-shell", () => ({
  AppShell: (props: { layout?: string; children: ReactNode }) => {
    mocks.shellLayout(props.layout)
    return props.children
  },
  useInformationReader: () => ({ available: true, open: mocks.openInformation }),
}))
vi.mock("@/components/profile-images-settings", () => ({ ProfileImagesSettings: () => null }))
vi.mock("@/components/profile-publication-settings", () => ({
  ProfilePublicationSettings: (props: { membership: MembershipView }) => {
    mocks.publication(props.membership)
    return <section aria-label="Profil commun" />
  },
}))
vi.mock("@/components/sign-out-settings", () => ({ SignOutSettings: () => null }))
// Sections branchées sur leur propre capacité, éprouvées par leurs tests : ici, seulement leur montage.
vi.mock("@/components/content-preferences-settings", () => ({ ContentPreferencesSettings: () => null }))
vi.mock("@/components/data-rights-settings", () => ({
  DataRightsSettings: (props: { person: { personId: string; handle: string | null; canLeave: boolean } }) => {
    mocks.dataRights(props.person)
    return <section id="mes-donnees" aria-label="Mes données" />
  },
}))
vi.mock("@/components/preferences", () => ({ LanguageSwitch: () => null, ThemeSwitch: () => null }))
vi.mock("@/components/call-settings", () => ({
  CallSettings: (props: { membership: MembershipView }) => {
    mocks.callSettings(props.membership)
    return <section id="messages-et-appels" aria-label="Messages et appels" />
  },
}))
vi.mock("@/components/device-notifications-settings", () => ({
  DeviceNotificationsSettings: (props: { membership: MembershipView }) => {
    mocks.deviceNotifications(props.membership)
    return <section id="notifications-appareil" aria-label="Notifications de cet appareil" />
  },
}))

const t = getFixedT("fr")
const membership: MembershipView = {
  personId: "person_lecture",
  handle: "lecture.demo",
  displayName: "Lecteur fictif",
  status: "en_attente",
  badges: [],
  facet: { countryOfResidence: "FR", associationIds: [], helpAvailable: false, visibility: DEFAULT_FACET_VISIBILITY },
  joinedAt: 1,
  verifiedSince: null,
  sponsoredBy: null,
  attestation: { outcome: "none", postSlug: null, requestedAt: null },
  root: { network: "antsia", status: "en_attente", derivedFrom: "diaspora-ga" },
  canPublish: false,
  rateTier: "reinforced",
  directoryVisibility: "hidden",
}
const tree = () => <I18nProvider locale="fr"><SettingsScreen /></I18nProvider>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.membership = membership
  mocks.consents = []
  mocks.leave.mockResolvedValue({ ok: true, value: null })
})
afterEach(cleanup)

describe("Réglages — profil commun et départ distinct", () => {
  it("monte les réglages personnels même pour un membre en attente", () => {
    render(tree())
    expect(mocks.publication).toHaveBeenLastCalledWith(membership)
    expect(screen.getByRole("region", { name: "Profil commun" })).toBeInTheDocument()
  })

  it("un compte en attente trouve sa salle d'attente à l'ancre du parrainage, où mènent toutes les sorties « Obtenir un parrainage » (EA-10)", () => {
    render(tree())
    const room = screen.getByRole("region", { name: t("pendingRoom.title") })
    expect(room).toHaveAttribute("id", "parrainage")
    expect(within(room).getByRole("textbox", { name: t("pendingRoom.linkLabel") })).toHaveValue(new URL(routes.sponsorFor("lecture.demo"), window.location.origin).href)
  })

  it("un membre déclaré garde l'aide au parrainage, sans salle d'attente", () => {
    mocks.membership = { ...membership, status: "declaree" }
    render(tree())
    expect(screen.queryByRole("region", { name: t("pendingRoom.title") })).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: t("settings.sponsorHelp") })).toHaveAttribute("id", "parrainage")
  })

  it("ne quitte qu'après confirmation et ne révoque pas le consentement global", async () => {
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: t("settings.leave") }))
    expect(mocks.leave).not.toHaveBeenCalled()
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }))
    expect(mocks.leave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: t("settings.leave") }))
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.leave") })) })
    expect(mocks.leave).toHaveBeenCalledTimes(1)
    expect(mocks.consent).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith("/bienvenue")
  })

  it("n'annonce pas un départ si le moteur le refuse", async () => {
    mocks.leave.mockResolvedValue({ ok: false, code: "rate_limited" })
    render(tree())
    fireEvent.click(screen.getByRole("button", { name: t("settings.leave") }))
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.leave") })) })
    expect(mocks.error).toHaveBeenCalledWith(t("errors.rate_limited"))
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each([true, false])("ignore une réponse de départ tardive après changement de personne (succès %s)", async (success) => {
    let settle!: (result: ActionResult) => void
    mocks.leave.mockReturnValueOnce(new Promise((resolve) => { settle = resolve }))
    const view = render(tree())
    fireEvent.click(screen.getByRole("button", { name: t("settings.leave") }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t("settings.leave") }))
    expect(mocks.leave).toHaveBeenCalledOnce()
    mocks.membership = { ...membership, personId: "nouvelle-personne", handle: "nouveau.demo" }
    view.rerender(tree())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await act(async () => { settle(success ? { ok: true, value: null } : { ok: false, code: "rate_limited" }) })
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.publication).toHaveBeenLastCalledWith(mocks.membership)
  })
})

describe("Réglages — registre des consentements (NP-01)", () => {
  const consent = (purpose: ConsentView["purpose"], granted: boolean): ConsentView => ({ purpose, granted, recordedAt: 1, textVersion: "2026-10-14" })
  const consentsRegion = () => screen.getByRole("region", { name: t("settings.consents") })
  /** Le texte tel que Testing Library le lit dans le DOM (espaces insécables normalisées). */
  const text = (key: string) => String(t(key)).replace(/\s+/g, " ")

  it("la ligne « talents » ne dit plus « Bientôt » : elle renvoie au profil de talent, sans interrupteur", () => {
    render(tree())
    const region = within(consentsRegion())
    expect(region.getByText(text("consentPurpose.talents.body"))).toBeInTheDocument()
    expect(region.queryByText(/Bientôt/)).toBeNull()
    expect(region.getByRole("link", { name: t("consentPurpose.talents.link") })).toHaveAttribute("href", "/talents")
    expect(region.queryByRole("switch", { name: t("consentPurpose.talents.title") })).toBeNull()
    // Les quatre autres finalités gardent leur interrupteur.
    expect(region.getAllByRole("switch")).toHaveLength(4)
  })

  it("l'attestation consulaire dit l'effet réel du retrait, et son retrait passe par l'adaptateur", async () => {
    mocks.consents = [consent("consular_attestation", true), consent("notifications", true)]
    mocks.consent.mockResolvedValue({ ok: true, value: null })
    render(tree())
    const region = within(consentsRegion())
    expect(region.getByText(text("consentPurpose.consular_attestation.body"))).toBeInTheDocument()
    expect(t("consentPurpose.consular_attestation.body")).toMatch(/arrête une demande en cours/)
    const attestation = region.getByRole("switch", { name: t("consentPurpose.consular_attestation.title") })
    expect(attestation).toBeEnabled()
    await act(async () => { fireEvent.click(attestation) })
    expect(mocks.consent).toHaveBeenCalledWith("consular_attestation", false)
    expect(mocks.success).toHaveBeenCalledWith(t("settings.consentRevoked"))
    await act(async () => { fireEvent.click(region.getByRole("switch", { name: t("consentPurpose.notifications.title") })) })
    expect(mocks.consent).toHaveBeenLastCalledWith("notifications", false)
  })

  it("sans accord en vigueur, l'attestation ne se donne pas ici (elle se donne au geste de vérification)", () => {
    mocks.consents = [consent("consular_attestation", false)]
    render(tree())
    expect(within(consentsRegion()).getByRole("switch", { name: t("consentPurpose.consular_attestation.title") })).toBeDisabled()
  })
})

describe("Réglages — « Mes données » (DG-026)", () => {
  const suspended: MembershipView = { ...membership, status: "suspendue", canPublish: false, root: { ...membership.root, status: "suspendue" } }

  it("monte la section des droits pour la personne affichée, à la place de l'ancien export immédiat", () => {
    render(tree())
    // La section reçoit la personne, jamais l'adhésion (NP-02) ; un membre peut aussi « quitter ».
    expect(mocks.dataRights).toHaveBeenLastCalledWith({ personId: membership.personId, handle: membership.handle, canLeave: true })
    expect(screen.getByRole("region", { name: "Mes données" })).toHaveAttribute("id", "mes-donnees")
    expect(screen.queryByRole("button", { name: t("settings.export") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("settings.delete") })).not.toBeInTheDocument()
  })

  it("la garde de Réglages admet un membre suspendu, sans le renvoyer ailleurs, et la section reste montée", async () => {
    const { Gate } = await vi.importActual<typeof import("@/components/gate")>("@/components/gate")
    mocks.session = { status: "ready", data: { status: "signed_in", account: {}, membership: suspended } }
    render(<Gate require="member">{(session) => <p data-testid="admis">{session.membership?.personId}</p>}</Gate>)
    expect(screen.getByTestId("admis")).toHaveTextContent(suspended.personId)
    expect(mocks.replace).not.toHaveBeenCalled()
    cleanup()
    mocks.membership = suspended
    render(tree())
    expect(mocks.dataRights).toHaveBeenLastCalledWith({ personId: suspended.personId, handle: suspended.handle, canLeave: true })
  })
})

describe("Réglages — une vue, des sous-vues (« une page = une vue », lot 2a)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/")
  })
  const list = () => screen.getByRole("navigation", { name: t("settings.title") })
  const shown = () => Array.from(document.querySelectorAll<HTMLElement>("[data-sub-view]:not([data-inactive])")).map((node) => node.dataset.subView)
  const view = () => document.querySelector("[data-sub-views]")?.getAttribute("data-view")
  const current = () => within(list()).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "true").map((link) => link.textContent)

  it("demande la vue à sa coque", () => {
    render(tree())
    expect(mocks.shellLayout).toHaveBeenLastCalledWith("view")
  })

  it("la liste porte les neuf rubriques, chacune vers l'ancre de sa première section, puis la ligne « Informations »", () => {
    render(tree())
    expect(within(list()).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Compte", "#adhesions"],
      ["Profil", "#profil"],
      ["Pays et visibilité", "#facette"],
      ["Fil et annuaire", "#mon-fil"],
      ["Messages et appels", "#messages-et-appels"],
      ["Affichage et notifications", "#apparence"],
      ["Consentements", "#consentements"],
      ["Parrainage", "#parrainage"],
      ["Mes données", "#mes-donnees"],
      ["Informations", "/mentions-legales"],
    ])
    // Le détail : un seul volet, nommé, qui porte les neuf sous-vues, toutes montées.
    expect(screen.getByRole("region", { name: t("settings.views.detail") })).toHaveAttribute("data-view-pane")
    expect(document.querySelectorAll("[data-sub-view]")).toHaveLength(9)
  })

  it.each([
    ["#parrainage", "parrainage", "Parrainage"],
    ["#annuaire", "fil", "Fil et annuaire"],
    ["#mes-signalements", "donnees", "Mes données"],
    // L'onglet « Décisions et signalements » (lot 2b) : l'avis de décision et le membre suspendu y mènent.
    ["#mes-decisions", "donnees", "Mes données"],
  ])("l'ancre %s montre sa sous-vue, et elle seule", (hash, subView, label) => {
    window.history.replaceState(null, "", `${routes.settings()}${hash}`)
    render(tree())
    expect(shown()).toEqual([subView])
    expect(view()).toBe("detail")
    expect(current()).toEqual([label])
    // La ligne de retour à la liste, au téléphone.
    expect(screen.getByRole("link", { name: t("settings.views.all") })).toHaveAttribute("href", "#rubriques")
  })

  it("une ancre inconnue (l'ancienne rubrique des textes) donne la liste, et la première sous-vue au large", () => {
    window.history.replaceState(null, "", `${routes.settings()}#informations`)
    render(tree())
    expect(view()).toBe("list")
    expect(shown()).toEqual(["compte"])
    expect(current()).toEqual(["Compte"])
  })

  it("la ligne « Informations » est un lien vers les mentions légales : le clic simple ouvre la page flottante, le clic modifié suit le lien", () => {
    render(tree())
    const link = within(list()).getByRole("link", { name: t("nav.account.info") })
    expect(link).toHaveAttribute("href", "/mentions-legales")
    expect(link).toHaveAttribute("aria-haspopup", "dialog")
    expect(fireEvent.click(link)).toBe(false)
    expect(mocks.openInformation).toHaveBeenCalledExactlyOnceWith(link)
    expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(fireEvent.click(link, { button: 1 })).toBe(true)
    expect(mocks.openInformation).toHaveBeenCalledOnce()
  })
})

describe("Réglages — « Messages et appels » (IM-02)", () => {
  it("monte la rubrique des réglages d'appel pour le membre affiché", () => {
    render(tree())
    expect(mocks.callSettings).toHaveBeenLastCalledWith(membership)
    expect(screen.getByRole("region", { name: "Messages et appels" })).toHaveAttribute("id", "messages-et-appels")
  })
})

describe("Réglages — « Notifications de cet appareil » (DS-14, volet push)", () => {
  it("monte la rubrique des notifications de l'appareil pour le membre affiché, avant les consentements où l'accord se retire", () => {
    render(tree())
    expect(mocks.deviceNotifications).toHaveBeenLastCalledWith(membership)
    const device = screen.getByRole("region", { name: "Notifications de cet appareil" })
    expect(device).toHaveAttribute("id", "notifications-appareil")
    const consents = document.getElementById("consentements")
    expect(consents).not.toBeNull()
    expect(device.compareDocumentPosition(consents!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
