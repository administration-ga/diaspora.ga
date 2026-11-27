// @vitest-environment jsdom
import { DAY_MS } from "@diaspora-ga/domain"
import { RoutingProvider, type FeatureRoutes, type LinkComponent } from "@diaspora-ga/features"
import { DataSourceProvider, type DiasporaGaActions, type DiasporaGaDataSource, type EntryPrefillView, type Loadable } from "@diaspora-ga/features/data"
import { DEMO_STORAGE_KEY, DemoStore, createDemoDataSource, createDemoSeed, type DemoState } from "@diaspora-ga/features/demo"
import { getFixedT } from "@diaspora-ga/features/i18n"
import { I18nProvider } from "@diaspora-ga/features/i18n/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { peekPendingCode, rememberPendingCode } from "@/lib/pending-code"
import { peekReturnPath, rememberReturnPath } from "@/lib/return-path"
import { routes } from "@/lib/routes"

import { WelcomeScreen } from "./welcome-screen"

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navigation, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/bienvenue",
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

const t = getFixedT("fr")
/** Les textes de la locale, espaces insécables comprises, tels que le DOM les rend lisibles. */
const text = (key: string, options?: Record<string, unknown>) => t(key, options).replace(/\s+/g, " ")

const featureRoutes: FeatureRoutes = {
  profile: routes.profile,
  post: routes.post,
  page: routes.page,
  hub: routes.hub,
  feed: () => routes.feed(),
  sponsor: routes.sponsor,
  settings: routes.settings,
  attestation: routes.attestation,
  enter: routes.enter,
}
const PlainLink: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
)

/** Ce que le test change de la source de démonstration : des gestes, ou une capacité (pré-remplissage). */
interface Overrides {
  readonly actions?: Partial<DiasporaGaActions>
  readonly source?: Partial<Pick<DiasporaGaDataSource, "entryPrefill" | "useHandleSuggestions">>
}

/** Awa (fictive) entre par IDN : la démonstration propose son nom et ses identifiants. */
async function signedInAwa(overrides: Overrides = {}) {
  const store = new DemoStore(null, () => Date.UTC(2026, 9, 14, 12), 0)
  await store.signInWithIdn({ firstName: "Awa", lastName: "Ogooué", loa: 2, gaboneseNationality: true })
  return renderWelcome(store, overrides)
}

/** Un compte entré par code : aucune identité IDN, donc rien à proposer. */
async function signedInByCode(overrides: Overrides = {}) {
  const store = new DemoStore(null, () => Date.UTC(2026, 9, 14, 12), 0)
  const sent = await store.requestCode({ kind: "email", value: "neuve@example.com" })
  if (!sent.ok || sent.value.demoCode === null) throw new Error("code de démonstration attendu")
  await store.verifyCode(sent.value.demoCode)
  return renderWelcome(store, overrides)
}

function renderWelcome(store: DemoStore, overrides: Overrides = {}) {
  const source = createDemoDataSource(store)
  render(
    <I18nProvider locale="fr">
      <DataSourceProvider source={{ ...source, ...overrides.source, actions: { ...source.actions, ...overrides.actions } }}>
        <RoutingProvider routes={featureRoutes} Link={PlainLink}>
          <WelcomeScreen />
        </RoutingProvider>
      </DataSourceProvider>
    </I18nProvider>,
  )
  return { store, user: userEvent.setup() }
}

/** Un pré-remplissage fixé par le test (le moteur du lot M1), avec des valeurs fictives. */
function prefillOf(data: EntryPrefillView | null): Pick<DiasporaGaDataSource, "entryPrefill"> {
  const loaded: Loadable<EntryPrefillView | null> = { status: "ready", data }
  return { entryPrefill: { useEntryPrefill: () => loaded } }
}

const AWA_PREFILL: EntryPrefillView = { displayName: "OGOOUÉ Awa", handles: [{ handle: "awa", available: true }], residence: null }

const NOW = Date.UTC(2026, 10, 10, 12)
/** L'acteur `exterieur` (fictif) : un compte ANTSIA à profil publié, sans adhésion à DIASPORA.GA. */
const OUTSIDER = { handle: "demo.exterieur", displayName: "Brice MOUNDOUNGA", headline: "Membre d'ANTSIA, hors de DIASPORA (démonstration)" }

/** Une démonstration dont la session est déjà ouverte : sur `personId`, ou sur l'acteur `exterieur`. */
function demoSignedIn(options: { personId?: string; withdrawn?: boolean } = {}) {
  const seed = createDemoSeed(NOW)
  const outsider: DemoState["persons"][string] = {
    id: "p-exterieur",
    idn: null,
    local: { kind: "email", value: "exterieur@example.com" },
    profile: { ...OUTSIDER },
    administrationLink: false,
    createdAt: NOW - 30 * DAY_MS,
    demoAccountKey: null,
    ...(options.withdrawn ? { withdrawnAt: NOW - DAY_MS } : {}),
  }
  const state: DemoState = { ...seed, persons: { ...seed.persons, [outsider.id]: outsider }, session: { personId: options.personId ?? outsider.id } }
  const items = new Map<string, string>([[DEMO_STORAGE_KEY, JSON.stringify(state)]])
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) }
  return new DemoStore(storage, () => NOW, 0)
}

async function chooseCountry(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("combobox", { name: "Pays de résidence" }))
  await user.type(screen.getByRole("searchbox"), name)
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: new RegExp(name) }))
}

const SUBMIT = /Créer mon profil et entrer/
const SUBMIT_KEPT = /Entrer dans DIASPORA/

/** La navigation de page (`window.location.assign`), que jsdom n'exécute pas. */
function stubPageNavigation() {
  const assign = vi.fn()
  vi.stubGlobal("window", new Proxy(window, {
    get(target, property) {
      return property === "location" ? { assign } : Reflect.get(target, property, target)
    },
  }))
  return assign
}

describe("/bienvenue — un seul écran, un seul geste (décision du 25/11/2026)", () => {
  it("pré-remplissage complet : nom et identifiant en ligne de rappel, aucune case ; le clic crée le profil, annuaire masqué, notifications coupées", async () => {
    const { store, user } = await signedInAwa()

    expect(await screen.findByRole("heading", { level: 1, name: t("welcomeEntry.title") })).toBeInTheDocument()
    const identity = screen.getByRole("region", { name: t("welcomeEntry.identityHeading") })
    expect(identity).toHaveTextContent("OGOOUÉ Awa")
    expect(identity).toHaveTextContent("@awa")
    expect(within(identity).getByRole("button", { name: t("welcomeEntry.editIdentity") })).toBeInTheDocument()
    // Ni nom ni identifiant à saisir, aucune case à cocher, aucune année d'arrivée.
    expect(screen.queryByRole("textbox", { name: "Nom affiché" })).not.toBeInTheDocument()
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
    expect(screen.queryByRole("textbox", { name: /Année d'arrivée/ })).not.toBeInTheDocument()
    // La phrase dit ce que les membres verront, et accompagne le bouton.
    const button = screen.getByRole("button", { name: SUBMIT })
    expect(button).toHaveAccessibleDescription(t("welcomeEntry.consent"))

    await chooseCountry(user, "France")
    // Rien n'est écrit avant le clic.
    const me = store.getState().session.personId ?? ""
    expect(store.getState().persons[me]?.profile).toBeNull()
    expect(store.getState().memberships[me]).toBeUndefined()

    await user.click(button)
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`${routes.hub("FR")}?bienvenue=1`))
    expect(store.getState().persons[me]?.profile).toMatchObject({ handle: "awa", displayName: "OGOOUÉ Awa" })
    expect(store.statusOf(me)).toBe("declaree")
    expect(store.getState().memberships[me]?.directoryVisibility).toBe("hidden")
    const consents = store.getState().consents.filter((record) => record.personId === me)
    expect(consents.map(({ purpose, granted, origin }) => ({ purpose, granted, origin }))).toEqual([
      { purpose: "social_profile", granted: true, origin: "onboarding" },
      { purpose: "directory", granted: false, origin: "onboarding" },
      { purpose: "notifications", granted: false, origin: "onboarding" },
    ])
  })

  it("sans pays, le clic ne crée rien : l'erreur est dite sur place", async () => {
    const { store, user } = await signedInAwa()
    await user.click(await screen.findByRole("button", { name: SUBMIT }))
    expect(await screen.findByText(t("errors.country_required"))).toBeInTheDocument()
    expect(navigation.push).not.toHaveBeenCalled()
    expect(store.getState().persons[store.getState().session.personId ?? ""]?.profile).toBeNull()
  })

  it("« Modifier » rouvre le nom et l'identifiant, remplis d'après IDN, le premier libre présélectionné, le focus sur le nom", async () => {
    const { store, user } = await signedInAwa()
    await user.click(await screen.findByRole("button", { name: t("welcomeEntry.editIdentity") }))

    const name = screen.getByRole("textbox", { name: "Nom affiché" })
    expect(name).toHaveValue("OGOOUÉ Awa")
    await vi.waitFor(() => expect(name).toHaveFocus())
    expect(screen.getByRole("radio", { name: "@awa" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText(text("welcome.handleHint"))).toBeInTheDocument()

    await user.clear(name)
    await user.type(name, "Awa OGOOUÉ")
    // `nom.prénom`, la forme de l'identifiant IDN : une proposition d'IDN.
    await user.click(screen.getByRole("radio", { name: "@ogooue.awa" }))
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT }))

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalled())
    expect(store.getState().persons[store.getState().session.personId ?? ""]?.profile).toMatchObject({ handle: "ogooue.awa", displayName: "Awa OGOOUÉ" })
  })

  it("un identifiant pris entre-temps rouvre les champs, l'erreur à sa place, sans rien écrire", async () => {
    const checkHandle = vi.fn<DiasporaGaActions["checkHandle"]>(async (handle) => ({ ok: true, value: { available: handle !== "awa" } }))
    const join = vi.fn<DiasporaGaActions["join"]>()
    const { store, user } = await signedInAwa({ actions: { checkHandle, join } })
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT }))

    const alert = await screen.findByText(t("errors.handle_taken"))
    expect(alert).toHaveAttribute("role", "alert")
    await vi.waitFor(() => expect(alert).toHaveFocus())
    expect(screen.getByRole("textbox", { name: "Nom affiché" })).toHaveValue("OGOOUÉ Awa")
    expect(join).not.toHaveBeenCalled()
    expect(store.getState().persons[store.getState().session.personId ?? ""]?.profile).toBeNull()

    // Une autre proposition, et l'entrée se fait.
    join.mockResolvedValue({ ok: true, value: { country: "FR", status: "declaree" } })
    await user.click(screen.getByRole("radio", { name: "@ogooue.awa" }))
    await user.click(screen.getByRole("button", { name: SUBMIT }))
    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(join.mock.calls[0]?.[0]).toMatchObject({ handle: "ogooue.awa" })
  })

  it("un identifiant pris au moment même de l'entrée (le moteur refuse) rouvre aussi les champs", async () => {
    const join = vi.fn<DiasporaGaActions["join"]>().mockResolvedValue({ ok: false, code: "handle_taken" })
    const { user } = await signedInAwa({ actions: { join } })
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT }))
    expect(await screen.findByText(t("errors.handle_taken"))).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Nom affiché" })).toBeInTheDocument()
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it("propositions d'IDN : seules elles sont offertes, jamais celles tirées du nom affiché (consigne du 25/11/2026)", async () => {
    // Le moteur tire ses propositions du nom affiché tapé ; avec un pré-remplissage d'IDN, elles ne s'ajoutent pas.
    const fromDisplayName = (displayName: string) => (displayName.includes("KOMBILA") ? ["kombila.gaelle", "gaelle.kombila"] : [])
    const { user } = await signedInAwa({ source: { ...prefillOf(AWA_PREFILL), useHandleSuggestions: fromDisplayName } })
    await user.click(await screen.findByRole("button", { name: t("welcomeEntry.editIdentity") }))
    const name = screen.getByRole("textbox", { name: "Nom affiché" })
    await user.clear(name)
    await user.type(name, "Gaëlle KOMBILA")
    expect(screen.queryByRole("radio", { name: "@kombila.gaelle" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "@gaelle.kombila" })).toBeNull()
    expect(screen.getByRole("radio", { name: "@awa" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: t("welcome.handleOther") })).toBeInTheDocument()
  })

  it("sans pré-remplissage d'IDN, les propositions tirées du nom affiché restent offertes", async () => {
    const fromDisplayName = (displayName: string) => (displayName.includes("KOMBILA") ? ["kombila.gaelle"] : [])
    const { user } = await signedInByCode({ source: { useHandleSuggestions: fromDisplayName } })
    await user.type(await screen.findByRole("textbox", { name: "Nom affiché" }), "Gaëlle KOMBILA")
    expect(await screen.findByRole("radio", { name: "@kombila.gaelle" })).toBeInTheDocument()
  })

  it("pré-remplissage partiel : le nom posé, aucun identifiant libre — les champs, rien de présélectionné", async () => {
    const { user } = await signedInByCode({ source: prefillOf({ displayName: "OGOOUÉ Awa", handles: [{ handle: "awa", available: false }], residence: null }) })
    const name = await screen.findByRole("textbox", { name: "Nom affiché" })
    expect(name).toHaveValue("OGOOUÉ Awa")
    expect(screen.queryByRole("radio", { name: "@awa" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT }))
    expect(await screen.findByText(t("errors.handle_required"))).toBeInTheDocument()
  })

  it("sans pré-remplissage (compte par code) : les champs, vides, aucune proposition choisie d'office", async () => {
    await signedInByCode()
    expect(await screen.findByRole("textbox", { name: "Nom affiché" })).toHaveValue("")
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    expect(screen.getByRole("combobox", { name: "Pays de résidence" })).toBeInTheDocument()
  })

  it("un moteur sans la fonction de pré-remplissage : la saisie, sans erreur et sans un mot en console", async () => {
    const consoleError = vi.spyOn(console, "error")
    const consoleWarn = vi.spyOn(console, "warn")
    for (const source of [prefillOf(null), { entryPrefill: { useEntryPrefill: (): Loadable<EntryPrefillView | null> => ({ status: "error", code: "unknown" }) } }]) {
      await signedInAwa({ source })
      expect(await screen.findByRole("textbox", { name: "Nom affiché" })).toHaveValue("")
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      cleanup()
    }
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it("résidence connue d'IDN, hors du Gabon : une ligne de rappel, et « Modifier » rouvre le pays et la ville", async () => {
    const join = vi.fn<DiasporaGaActions["join"]>().mockResolvedValue({ ok: true, value: { country: "FR", status: "declaree" } })
    const { user } = await signedInAwa({ actions: { join }, source: prefillOf({ ...AWA_PREFILL, residence: { country: "FR", city: "Lyon" } }) })
    const residence = await screen.findByRole("region", { name: t("welcomeEntry.residenceHeading") })
    expect(residence).toHaveTextContent(/France/)
    expect(residence).toHaveTextContent(/Lyon/)
    expect(screen.queryByRole("combobox", { name: "Pays de résidence" })).not.toBeInTheDocument()

    // Les deux lignes de rappel : un seul geste suffit.
    await user.click(screen.getByRole("button", { name: SUBMIT }))
    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(join.mock.calls[0]?.[0]).toEqual({
      facet: { countryOfResidence: "FR", city: "Lyon" },
      handle: "awa",
      displayName: "OGOOUÉ Awa",
      consents: { social_profile: true, directory: false, notifications: false },
      directoryVisibility: "hidden",
    })
  })

  it("« Modifier » la résidence : le pays et la ville d'IDN dans les champs, le focus sur le pays", async () => {
    const { user } = await signedInAwa({ source: prefillOf({ ...AWA_PREFILL, residence: { country: "FR", city: "Lyon" } }) })
    await user.click(await screen.findByRole("button", { name: t("welcomeEntry.editResidence") }))
    const country = screen.getByRole("combobox", { name: "Pays de résidence" })
    expect(country).toHaveTextContent(/France/)
    await vi.waitFor(() => expect(country).toHaveFocus())
    expect(screen.getByRole("textbox", { name: "Ville" })).toHaveValue("Lyon")
  })

  it("pays fermé (IDN) : la ligne de rappel porte l'avis, sans promettre de relecture, et l'on entre quand même", async () => {
    const join = vi.fn<DiasporaGaActions["join"]>().mockResolvedValue({ ok: true, value: { country: "ES", status: "declaree" } })
    const { user } = await signedInAwa({ actions: { join }, source: prefillOf({ ...AWA_PREFILL, residence: { country: "ES", city: null } }) })
    const notice = await screen.findByText(text("welcome.countryNotOpen"))
    expect(notice).toHaveTextContent(/publiez pour toute la diaspora/)
    expect(notice).not.toHaveTextContent(/relue|relecture/i)
    await user.click(screen.getByRole("button", { name: SUBMIT }))
    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(join.mock.calls[0]?.[0].facet).toEqual({ countryOfResidence: "ES", city: "" })
  })

  it("une résidence au Gabon (IDN) ne se reprend pas : le pays se choisit", async () => {
    await signedInAwa({ source: prefillOf({ ...AWA_PREFILL, residence: { country: "GA", city: "Libreville" } }) })
    const country = await screen.findByRole("combobox", { name: "Pays de résidence" })
    expect(country).not.toHaveTextContent(/Gabon/)
    expect(screen.getByRole("textbox", { name: "Ville" })).toHaveValue("")
  })

  it("un pays pas encore ouvert, choisi à la main : l'avis dit ce qui est possible (HB-01)", async () => {
    const { user } = await signedInAwa()
    await chooseCountry(user, "Espagne")
    const notice = await screen.findByText(text("welcome.countryNotOpen"))
    expect(notice).toHaveTextContent(/publiez pour toute la diaspora/)
  })
})

/** Un compte neuf remplit l'accueil : France, un nom, un identifiant libre, puis le seul geste. */
async function completeNewAccount(user: ReturnType<typeof userEvent.setup>, displayName: string, handle: string) {
  await user.type(await screen.findByRole("textbox", { name: "Nom affiché" }), displayName)
  await user.click(screen.getByRole("radio", { name: t("welcome.handleOther") }))
  await user.type(screen.getByRole("textbox", { name: t("welcome.handleOtherLabel") }), handle)
  await chooseCountry(user, "France")
  await user.click(screen.getByRole("button", { name: SUBMIT }))
}

describe("/bienvenue — la page demandée avant la connexion (UX-02, MO-03)", () => {
  const EVENT = routes.associationEvent("amicale-lyon", "evt-42")

  it("nouveau membre : l'accueil d'abord, puis la page demandée ; la garde ne l'emmène pas ailleurs", async () => {
    rememberReturnPath({ pathname: EVENT, search: "", hash: "" })
    const { user } = await signedInAwa()
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT }))

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(EVENT))
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it("compte en attente : la page demandée qu'il ne peut pas lire cède la place à son hub", async () => {
    rememberReturnPath({ pathname: routes.messages(), search: "", hash: "" })
    const { store, user } = await signedInByCode()
    await completeNewAccount(user, "Neuve EXEMPLE", "neuve.exemple")

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.hubWelcome("FR")))
    expect(store.statusOf(store.getState().session.personId ?? "")).toBe("en_attente")
  })

  it("un compte en attente arrive sur la page demandée qu'il peut lire", async () => {
    rememberReturnPath({ pathname: EVENT, search: "", hash: "" })
    const { user } = renderWelcome(demoSignedIn())
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT_KEPT }))

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(EVENT))
  })
})

describe("/bienvenue — un profil commun déjà là (EA-04)", () => {
  it("l'acteur `exterieur` entre : son identité est montrée, jamais redemandée ni réécrite", async () => {
    const store = demoSignedIn()
    const before = store.getState().persons["p-exterieur"]?.profile
    const { user } = renderWelcome(store)

    expect(await screen.findByRole("heading", { level: 1, name: t("welcomeProfile.keptTitle") })).toBeInTheDocument()
    const identity = screen.getByRole("region", { name: t("welcomeProfile.identityLabel") })
    expect(identity).toHaveTextContent(OUTSIDER.displayName)
    expect(identity).toHaveTextContent(`@${OUTSIDER.handle}`)
    expect(identity).toHaveTextContent(OUTSIDER.headline)
    // Ni nom à saisir, ni identifiant à choisir, ni « Modifier » de l'identité.
    expect(screen.queryByRole("textbox", { name: "Nom affiché" })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t("welcomeEntry.editIdentity") })).not.toBeInTheDocument()

    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT_KEPT }))
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`${routes.hub("FR")}?bienvenue=1`))

    expect(store.getState().persons["p-exterieur"]?.profile).toEqual(before)
    expect(store.statusOf("p-exterieur")).toBe("en_attente")
  })

  it("un profil retiré se republie d'un geste, accroche conservée, avant d'entrer", async () => {
    const store = demoSignedIn({ withdrawn: true })
    const { user } = renderWelcome(store)
    expect(await screen.findByRole("heading", { level: 1, name: t("welcomeProfile.withdrawnTitle") })).toBeInTheDocument()
    await chooseCountry(user, "France")
    await user.click(screen.getByRole("button", { name: SUBMIT_KEPT }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(text("errors.profile_republish_required"))
    expect(navigation.push).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: t("settings.profilePublication.republish") }))
    expect(await screen.findByRole("heading", { level: 1, name: t("welcomeProfile.keptTitle") })).toBeInTheDocument()
    expect(store.getState().persons["p-exterieur"]?.profile).toEqual(OUTSIDER)
    expect(store.getState().persons["p-exterieur"]?.withdrawnAt).toBeUndefined()
    await user.click(screen.getByRole("button", { name: SUBMIT_KEPT }))
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalled())
  })

  it("retour après un départ : pays et ville d'avant en ligne de rappel, le profil reste le sien, un seul geste", async () => {
    const store = demoSignedIn({ personId: "p-mireille" })
    expect(await store.leaveDiasporaGa()).toEqual({ ok: true, value: null })
    const before = store.getState().persons["p-mireille"]?.profile
    const arrivedAt = store.getState().memberships["p-mireille"]?.facet.arrivedAt
    const { user } = renderWelcome(store)

    expect(await screen.findByText(text("welcomeProfile.returningNote"))).toBeInTheDocument()
    const residence = screen.getByRole("region", { name: t("welcomeEntry.residenceHeading") })
    expect(residence).toHaveTextContent(/France/)
    expect(residence).toHaveTextContent(/Paris/)
    expect(screen.queryByRole("combobox", { name: "Pays de résidence" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: SUBMIT_KEPT }))

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`${routes.hub("FR")}?bienvenue=1`))
    expect(store.getState().persons["p-mireille"]?.profile).toEqual(before)
    // Rien de ce qu'elle avait donné n'est perdu au retour dans le même pays.
    expect(store.getState().memberships["p-mireille"]?.facet).toMatchObject({ countryOfResidence: "FR", city: "Paris", ...(arrivedAt !== undefined ? { arrivedAt } : {}) })
  })
})

describe("/bienvenue — la sortie d'un compte connecté sans adhésion", () => {
  it("se déconnecte partout depuis l'accueil, puis la démonstration recharge la porte ; la page demandée est oubliée", async () => {
    rememberReturnPath({ pathname: routes.associationEvent("amicale-lyon", "evt-42"), search: "", hash: "" })
    const assign = stubPageNavigation()
    const { store, user } = await signedInAwa()
    // Une adresse en attente d'un code, posée après l'ouverture de la session : la sortie l'oublie aussi (EA-08).
    await vi.waitFor(() => expect(peekPendingCode()).toBeNull())
    rememberPendingCode({ kind: "email", value: "awa@example.com" })

    // Ni les réglages ni la porte ne s'ouvrent à ce compte : l'accueil porte sa sortie.
    expect(await screen.findByText(text("welcome.notYourAccount"))).toBeInTheDocument()
    expect(store.getState().session.personId).not.toBeNull()
    await user.click(screen.getByRole("button", { name: t("settings.signOutEverywhere") }))

    await vi.waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(routes.home()))
    expect(store.getState().session.personId ?? null).toBeNull()
    expect(peekReturnPath()).toBeNull()
    expect(peekPendingCode()).toBeNull()
  })

  it("dit un échec générique et laisse réessayer", async () => {
    stubPageNavigation()
    const signOutEverywhere = vi.fn<DiasporaGaActions["signOutEverywhere"]>().mockRejectedValueOnce(new Error("diagnostic privé de la révocation")).mockResolvedValue(undefined)
    const { user } = await signedInAwa({ actions: { signOutEverywhere } })

    await user.click(await screen.findByRole("button", { name: t("settings.signOutEverywhere") }))
    expect(await screen.findByRole("alert")).toHaveTextContent(t("errors.unknown"))
    expect(screen.queryByText(/diagnostic privé/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: t("settings.signOutEverywhere") }))
    await vi.waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(2))
  })

  it("mène à « Mes données » sans adhésion, à côté de la déconnexion et depuis le pied de page (NP-02, EA-05)", async () => {
    await signedInAwa()
    const link = await screen.findByRole("link", { name: t("welcome.myData") })
    expect(link).toHaveAttribute("href", routes.myData())
    const footer = within(screen.getByRole("navigation", { name: t("footer.label") }))
    expect(footer.getByRole("link", { name: t("footer.myData") })).toHaveAttribute("href", routes.myData())
  })
})

describe("/bienvenue — porte fiable (EA-08)", () => {
  it("une session ouverte oublie l'adresse en attente d'un code", async () => {
    rememberPendingCode({ kind: "email", value: "awa@example.com" })
    await signedInAwa()

    expect(await screen.findByRole("heading", { level: 1, name: t("welcomeEntry.title") })).toBeInTheDocument()
    await vi.waitFor(() => expect(peekPendingCode()).toBeNull())
  })

  it("aucune année d'arrivée à l'entrée : la facette n'en porte pas (elle reste aux réglages)", async () => {
    const join = vi.fn<DiasporaGaActions["join"]>().mockResolvedValue({ ok: true, value: { country: "FR", status: "declaree" } })
    const { user } = await signedInByCode({ actions: { join } })
    await completeNewAccount(user, "Neuve EXEMPLE", "neuve.exemple")

    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1))
    expect(join.mock.calls[0]?.[0].facet).toEqual({ countryOfResidence: "FR", city: "" })
  })

  it("l'identifiant choisi est vérifié pendant la saisie : libre, puis pris, dit poliment", async () => {
    const checkHandle = vi.fn<DiasporaGaActions["checkHandle"]>(async (handle) => ({ ok: true, value: { available: handle !== "pris.deja" } }))
    const { user } = await signedInByCode({ actions: { checkHandle } })
    await user.type(await screen.findByRole("textbox", { name: "Nom affiché" }), "Neuve EXEMPLE")
    await user.click(screen.getByRole("radio", { name: t("welcome.handleOther") }))
    const field = screen.getByRole("textbox", { name: t("welcome.handleOtherLabel") })

    await user.type(field, "awa.libre")
    expect(await screen.findByText(t("welcomeHandle.available", { handle: "awa.libre" }), {}, { timeout: 3000 })).toHaveAttribute("role", "status")
    await user.clear(field)
    await user.type(field, "pris.deja")
    expect(await screen.findByText(t("welcomeHandle.taken", { handle: "pris.deja" }), {}, { timeout: 3000 })).toBeInTheDocument()
    // Une question par pause, pas par touche : jamais l'identifiant incomplet de chaque frappe.
    expect(checkHandle.mock.calls.map(([handle]) => handle)).toEqual(["awa.libre", "pris.deja"])
  })
})
