// @vitest-environment jsdom
import { createAppI18n } from "@diaspora-ga/features/i18n"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getFunctionName, type FunctionReference } from "convex/server"
import { StrictMode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { REQUESTED_SECTION_KEY } from "@/lib/requested-section"

/**
 * CH-815 A4 — `/entrer` : l'identité numérique seule (D3), un refus d'IDN dit en phrase neutre.
 * CH-815 A1b — les trois adresses de retour d'IDN sont `/entrer` nu (revue A1, F2) ; une
 * session ouverte reprend la section retenue dans l'onglet, jamais une section de l'adresse.
 */
const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  configuration: undefined as unknown,
  queried: [] as string[],
  oauth2: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("@/lib/env", () => ({ publicEnv: { convexUrl: "configured", membersSiteUrl: null } }))
vi.mock("@/lib/sign-out", () => ({ signOutAndRedirect: vi.fn() }))
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { oauth2: mocks.oauth2 } } }))
vi.mock("convex/react", () => ({
  useConvexAuth: () => mocks.auth,
  useQuery: (reference: FunctionReference<"query">) => {
    mocks.queried.push(getFunctionName(reference))
    return mocks.configuration
  },
}))

import { idnReturnURLs, SignInScreen } from "./sign-in-screen"

const OPEN = { idn: true, emailOtp: true, smsOtp: true, localCodes: true }

function mount(path = "/entrer", strict = false) {
  window.history.replaceState(null, "", path)
  const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: APP_NAMESPACE })
  const tree = (
    <I18nextProvider i18n={i18n}>
      <SignInScreen />
    </I18nextProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

type IdnStart = { providerId: string; callbackURL: string; newUserCallbackURL: string; errorCallbackURL: string; [key: string]: unknown }

async function startIdn(): Promise<IdnStart> {
  await userEvent.click(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" }))
  expect(mocks.oauth2).toHaveBeenCalledOnce()
  return (mocks.oauth2.mock.calls[0] as [IdnStart])[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { isAuthenticated: false, isLoading: false }
  mocks.configuration = OPEN
  mocks.queried = []
  mocks.oauth2.mockResolvedValue({ data: { url: "https://idn.exemple/autoriser", redirect: true }, error: null })
  window.sessionStorage.clear()
})
afterEach(() => cleanup())

describe("entrée d'admin.diaspora.ga — l'identité numérique seule", () => {
  it("un seul bouton, « Se connecter avec l'identité numérique », et aucun champ de code, même si le moteur sert les codes", () => {
    mount()
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(["Se connecter avec l’identité numérique"])
    expect(buttons[0]).toBeEnabled()
    expect(screen.queryAllByRole("textbox")).toEqual([])
    expect(document.querySelectorAll("input")).toHaveLength(0)
    expect(screen.queryByText(/courriel|e-mail|SMS/i, { selector: "button, a, label" })).toBeNull()
    expect(mocks.queried).toEqual(["modules/platform/authentication:configuration"])
  })

  it("IDN indisponible pour ce déploiement : le bouton reste seul, inactif, et le dit", () => {
    mocks.configuration = { ...OPEN, idn: false }
    mount()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" })).toBeDisabled()
    expect(screen.getByText("La connexion par l’identité numérique n’est pas disponible pour le moment.")).toBeDefined()
  })

  it("le départ vers IDN : succès, compte neuf et échec reviennent tous à `/entrer` nu de cette origine", async () => {
    mount()
    const args = await startIdn()
    const entry = `${window.location.origin}/entrer`
    expect(args.providerId).toBe("idn")
    expect({ callbackURL: args.callbackURL, newUserCallbackURL: args.newUserCallbackURL, errorCallbackURL: args.errorCallbackURL }).toEqual({
      callbackURL: entry,
      newUserCallbackURL: entry,
      errorCallbackURL: entry,
    })
    // Aucune autre adresse ne part vers le moteur (pas de `newUserURL`, de `redirectTo`…).
    expect(Object.keys(args).sort()).toEqual(["callbackURL", "errorCallbackURL", "fetchOptions", "newUserCallbackURL", "providerId"])
  })

  it.each([
    "/entrer?retour=%2Fmodules",
    "/entrer?retour=https%3A%2F%2Failleurs.exemple%2F",
    "/entrer?next=%2Fmodules&redirect=%2F%2Failleurs.exemple#apercu",
  ])("une continuation dans l'adresse (%s) n'est ni transportée ni retenue", async (path) => {
    mount(path)
    const args = await startIdn()
    for (const url of [args.callbackURL, args.newUserCallbackURL, args.errorCallbackURL]) {
      expect(url).toBe(`${window.location.origin}/entrer`)
      expect(new URL(url).search).toBe("")
      expect(new URL(url).hash).toBe("")
    }
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBeNull()
  })

  it("les adresses de retour sont absolues, nues, de l'origine donnée seule", () => {
    for (const origin of ["https://admin.exemple", "http://localhost:3033"]) {
      const urls = idnReturnURLs(origin)
      expect(urls).toEqual({ callbackURL: `${origin}/entrer`, newUserCallbackURL: `${origin}/entrer`, errorCallbackURL: `${origin}/entrer` })
      expect(Object.values(urls).every((url) => !url.includes("?") && !url.includes("#"))).toBe(true)
    }
  })

  it("une session ouverte passe l'entrée vers la section retenue, effacée aussitôt", async () => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/modules")
    mount()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/modules"))
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBeNull()
    expect(mocks.oauth2).not.toHaveBeenCalled()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("StrictMode ne perd pas la section retenue (lue une seule fois)", async () => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/apercu")
    mount("/entrer", true)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    expect(new Set(mocks.replace.mock.calls.map(([target]) => target as string))).toEqual(new Set(["/apercu"]))
  })

  it.each([
    ["rien de retenu", null],
    ["une adresse hors du registre", "//ailleurs.exemple"],
  ])("une session ouverte sans section valable (%s) mène au tableau de bord, jamais à l'adresse", async (_case, stored) => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    if (stored !== null) window.sessionStorage.setItem(REQUESTED_SECTION_KEY, stored)
    mount("/entrer?retour=%2Fmodules")
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"))
    expect(mocks.replace).not.toHaveBeenCalledWith("/modules")
  })

  it.each([
    ["access_denied", "Vous n’avez pas autorisé la connexion avec IDN. Vous pouvez recommencer quand vous le souhaitez."],
    ["une-raison-du-serveur", "La connexion avec IDN n’a pas abouti. Vous pouvez recommencer."],
  ])("un retour d'échec d'IDN (%s) se dit en phrase neutre, puis quitte l'adresse", async (code, sentence) => {
    mount(`/entrer?error=${code}&error_description=detail-du-serveur`)
    expect(screen.getByRole("alert").textContent).toBe(sentence)
    expect(screen.queryByText(/detail-du-serveur|une-raison-du-serveur/)).toBeNull()
    await waitFor(() => expect(window.location.search).toBe(""))
  })

  it("un départ refusé par le moteur se dit sans quitter l'entrée", async () => {
    mocks.oauth2.mockResolvedValueOnce({ data: null, error: { status: 429, code: "rateLimited" } })
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Se connecter avec l’identité numérique" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop de tentatives")
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("une sortie incomplète avec une session encore ouverte propose d'abord de la refaire, sans quitter l'entrée", async () => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    window.sessionStorage.setItem(REQUESTED_SECTION_KEY, "/modules")
    mount("/entrer?deconnexion=incomplete")
    expect(screen.getByRole("alert").textContent).toContain("La déconnexion complète n’a pas pu être confirmée")
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Se déconnecter partout"])
    // Aucune navigation, même un instant avant la lecture de l'adresse (StrictMode compris).
    cleanup()
    mount("/entrer?deconnexion=incomplete", true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(REQUESTED_SECTION_KEY)).toBe("/modules")
  })
})
